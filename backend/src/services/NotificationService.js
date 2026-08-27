/**
 * NotificationService
 * Server-side management of RiskLoop notifications.
 * Uses Supabase Service Role client to create and manage notifications securely.
 * Clients cannot arbitrarily insert notifications (enforced by RLS & backend).
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const NOTIFICATION_TYPES = [
  'support_reply',
  'customer_reply',
  'ticket_status_change',
  'ticket_resolved'
];

class NotificationService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || null;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;

    this.isSupabaseConfigured = !!(
      this.supabaseUrl &&
      this.supabaseServiceKey &&
      !this.supabaseUrl.includes('placeholder') &&
      !this.supabaseServiceKey.includes('placeholder')
    );

    if (this.isSupabaseConfigured) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      console.log('✅ NotificationService: Supabase service-role client initialized.');
    } else {
      this.supabase = null;
      console.log('ℹ️ NotificationService: Supabase not configured, using memory fallback engine.');
    }

    // In-memory fallback map for offline local dev/testing: Map<notificationId, notificationObj>
    this.memoryNotifications = new Map();
  }

  /**
   * Verify Supabase JWT token and extract authenticated user
   */
  async verifyUserToken(token) {
    if (!token) {
      return { user: null, error: new Error('Missing authorization token') };
    }

    if (this.supabase) {
      try {
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (error || !user) {
          return { user: null, error: error || new Error('Invalid user session') };
        }
        return { user, error: null };
      } catch (err) {
        console.warn('[NotificationService] Supabase token verification failed:', err.message);
      }
    }

    // Development fallback for test tokens
    if (process.env.NODE_ENV !== 'production' && (token.startsWith('mock-') || token.startsWith('test-') || token === 'mock-token')) {
      return {
        user: {
          id: 'usr-test-101',
          email: 'trader101@riskloop.io',
          role: 'user'
        },
        error: null
      };
    }

    return { user: null, error: new Error('Unauthorized') };
  }

  /**
   * Create a notification securely on the server
   */
  async createNotification({ userId, type, title, message, ticketId = null, metadata = {} }) {
    if (!userId) {
      const err = new Error('Recipient userId is required to create a notification');
      err.statusCode = 400;
      throw err;
    }

    if (!type || !NOTIFICATION_TYPES.includes(type)) {
      const err = new Error(`Invalid notification type "${type}". Allowed: ${NOTIFICATION_TYPES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) {
      const err = new Error('Notification title is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) {
      const err = new Error('Notification message is required');
      err.statusCode = 400;
      throw err;
    }

    const payload = {
      user_id: userId,
      type,
      title: cleanTitle,
      message: cleanMessage,
      ticket_id: ticketId || null,
      is_read: false,
      metadata: typeof metadata === 'object' && metadata !== null ? metadata : {}
    };

    let createdNotification = null;

    // 1. Insert via Supabase Service-Role
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('notifications')
          .insert([payload])
          .select()
          .single();

        if (!error && data) {
          createdNotification = data;
        } else if (error) {
          console.warn('[NotificationService] Supabase insert warning:', error.message);
        }
      } catch (err) {
        console.warn('[NotificationService] Supabase insert error:', err.message);
      }
    }

    // 2. Memory Fallback for offline testing
    if (!createdNotification) {
      const generatedId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      createdNotification = {
        id: generatedId,
        ...payload,
        created_at: new Date().toISOString()
      };
      this.memoryNotifications.set(generatedId, createdNotification);
    }

    return createdNotification;
  }

  /**
   * Retrieve notifications for a specific authenticated user
   */
  async getUserNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
    if (!userId) {
      const err = new Error('User ID is required');
      err.statusCode = 400;
      throw err;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    let notifications = [];
    let unreadCount = 0;

    // 1. Query Supabase
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(parsedLimit);

        if (unreadOnly) {
          query = query.eq('is_read', false);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          notifications = data;

          // Fetch exact unread count
          const { count, error: countErr } = await this.supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

          if (!countErr && typeof count === 'number') {
            unreadCount = count;
          } else {
            unreadCount = notifications.filter(n => !n.is_read).length;
          }
        }
      } catch (err) {
        console.warn('[NotificationService] Supabase fetch error:', err.message);
      }
    }

    // 2. Memory Fallback if needed
    if (notifications.length === 0 && this.memoryNotifications.size > 0) {
      const userNotifs = Array.from(this.memoryNotifications.values())
        .filter(n => n.user_id === userId);

      userNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      unreadCount = userNotifs.filter(n => !n.is_read).length;
      notifications = unreadOnly ? userNotifs.filter(n => !n.is_read).slice(0, parsedLimit) : userNotifs.slice(0, parsedLimit);
    }

    return {
      notifications,
      unreadCount
    };
  }

  /**
   * Mark a single notification as read (with strict ownership check)
   */
  async markAsRead(notificationId, userId) {
    if (!notificationId) {
      const err = new Error('Notification ID is required');
      err.statusCode = 400;
      throw err;
    }

    if (!userId) {
      const err = new Error('User ID is required');
      err.statusCode = 400;
      throw err;
    }

    let updatedNotification = null;

    // 1. Update in Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
          .eq('user_id', userId)
          .select()
          .single();

        if (!error && data) {
          updatedNotification = data;
        } else if (error && error.code === 'PGRST116') {
          const err = new Error('Notification not found or access denied');
          err.statusCode = 404;
          throw err;
        }
      } catch (err) {
        if (err.statusCode) throw err;
        console.warn('[NotificationService] Supabase markAsRead warning:', err.message);
      }
    }

    // 2. Memory Fallback
    if (!updatedNotification && this.memoryNotifications.has(notificationId)) {
      const notif = this.memoryNotifications.get(notificationId);
      if (notif.user_id !== userId) {
        const err = new Error('Notification not found or access denied');
        err.statusCode = 404;
        throw err;
      }
      notif.is_read = true;
      updatedNotification = notif;
      this.memoryNotifications.set(notificationId, notif);
    }

    if (!updatedNotification) {
      const err = new Error(`Notification "${notificationId}" not found or unauthorized`);
      err.statusCode = 404;
      throw err;
    }

    return updatedNotification;
  }

  /**
   * Mark all unread notifications for a user as read
   */
  async markAllAsRead(userId) {
    if (!userId) {
      const err = new Error('User ID is required');
      err.statusCode = 400;
      throw err;
    }

    let updatedCount = 0;

    // 1. Update in Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false)
          .select();

        if (!error && Array.isArray(data)) {
          updatedCount = data.length;
        }
      } catch (err) {
        console.warn('[NotificationService] Supabase markAllAsRead warning:', err.message);
      }
    }

    // 2. Memory Fallback
    for (const [id, notif] of this.memoryNotifications.entries()) {
      if (notif.user_id === userId && !notif.is_read) {
        notif.is_read = true;
        this.memoryNotifications.set(id, notif);
        updatedCount++;
      }
    }

    return {
      success: true,
      updatedCount
    };
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    if (!userId) return 0;
    const { unreadCount } = await this.getUserNotifications(userId, { limit: 1 });
    return unreadCount;
  }
}

export const notificationService = new NotificationService();
