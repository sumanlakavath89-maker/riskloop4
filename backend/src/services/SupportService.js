/**
 * SupportService
 * Handles business logic, validation, and database operations for RiskLoop Support Tickets & Messages.
 * Interacts with Supabase PostgreSQL (public.support_tickets, public.support_ticket_messages)
 * with transparent local database fallback when Supabase credentials are in development mode.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './DatabaseService.js';
import { notificationService } from './NotificationService.js';
import { emailService } from './EmailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Valid RiskLoop support categories
export const SUPPORT_CATEGORIES = [
  'journal',
  'calculator',
  'broker',
  'market',
  'account',
  'feedback',
  'other'
];

export const TICKET_STATUSES = ['open', 'under_review', 'waiting_for_user', 'resolved'];
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

class SupportService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || null;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;
    
    this.isSupabaseConfigured = !!(
      this.supabaseUrl &&
      this.supabaseKey &&
      !this.supabaseUrl.includes('placeholder') &&
      !this.supabaseKey.includes('placeholder')
    );

    if (this.isSupabaseConfigured) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      console.log('✅ SupportService: Supabase client initialized.');
    } else {
      this.supabase = null;
      console.log('ℹ️ SupportService: Supabase not configured, using local database engine.');
    }
  }

  /**
   * Verify Supabase JWT token and extract authenticated user
   */
  async verifyUserToken(token) {
    if (!token) {
      return { user: null, error: new Error('Missing authorization token') };
    }

    // If Supabase client is configured, verify with Supabase Auth
    if (this.supabase) {
      try {
        const { data: { user }, error } = await this.supabase.auth.getUser(token);
        if (error || !user) {
          return { user: null, error: error || new Error('Invalid or expired token') };
        }
        return { user, error: null };
      } catch (err) {
        return { user: null, error: err };
      }
    }

    // In development / demo mode when Supabase is not configured, support local token or mock session
    if (process.env.NODE_ENV !== 'production' && (token.startsWith('mock_user_') || token.startsWith('demo_'))) {
      return {
        user: {
          id: token.replace('mock_user_', '').replace('demo_', '') || 'demo-user-1',
          email: 'demo_trader@riskloop.io'
        },
        error: null
      };
    }

    return { user: null, error: new Error('Supabase authentication service unavailable') };
  }

  /**
   * Generate a unique ticket number formatted as RL-XXXXXX
   */
  async generateTicketNumber() {
    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      const num = Math.floor(100000 + Math.random() * 900000);
      const ticketNumber = `RL-${num}`;

      // Check collision
      if (this.supabase) {
        try {
          const { data } = await this.supabase
            .from('support_tickets')
            .select('id')
            .eq('ticket_number', ticketNumber)
            .maybeSingle();

          if (!data) return ticketNumber;
        } catch (_) {
          return ticketNumber;
        }
      } else {
        const existing = db.getSupportTicketById(ticketNumber);
        if (!existing) return ticketNumber;
      }
    }
    return `RL-${Date.now().toString().slice(-6)}`;
  }

  /**
   * Create a new support ticket
   */
  async createTicket({ userId, email, category, description, attachments = [] }) {
    if (!userId) {
      const err = new Error('Authenticated user ID is required');
      err.statusCode = 401;
      throw err;
    }

    if (!email) {
      const err = new Error('User email is required');
      err.statusCode = 400;
      throw err;
    }

    const cleanCategory = String(category || '').toLowerCase().trim();
    if (!SUPPORT_CATEGORIES.includes(cleanCategory)) {
      const err = new Error(`Invalid category "${category}". Allowed: ${SUPPORT_CATEGORIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const cleanDescription = String(description || '').trim();
    if (!cleanDescription || cleanDescription.length === 0) {
      const err = new Error('Description is required (minimum 1 character)');
      err.statusCode = 400;
      throw err;
    }

    if (cleanDescription.length > 2000) {
      const err = new Error('Description exceeds maximum limit of 2000 characters');
      err.statusCode = 400;
      throw err;
    }

    const attachmentList = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []);
    const ticketNumber = await this.generateTicketNumber();

    const newTicketPayload = {
      ticket_number: ticketNumber,
      user_id: userId,
      email: email,
      category: cleanCategory,
      description: cleanDescription,
      attachments: attachmentList,
      status: 'open',
      priority: 'medium'
    };

    let createdTicket = null;

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('support_tickets')
          .insert([newTicketPayload])
          .select()
          .single();

        if (error) {
          console.error('[SupportService] Supabase insert error:', error.message);
          throw error;
        }
        createdTicket = data;
      } catch (supabaseErr) {
        console.warn('[SupportService] Falling back to local database persistence:', supabaseErr.message);
      }
    }

    // 2. Persist locally in DatabaseService as well
    if (!createdTicket) {
      createdTicket = db.createSupportTicket(newTicketPayload);
    } else {
      try {
        db.createSupportTicket({ ...newTicketPayload, id: createdTicket.id });
      } catch (_) {}
    }

    return createdTicket;
  }

  /**
   * Get all tickets belonging to the authenticated user
   */
  async getUserTickets(userId) {
    if (!userId) {
      const err = new Error('Authenticated user ID is required');
      err.statusCode = 401;
      throw err;
    }

    let tickets = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('support_tickets')
          .select('id, ticket_number, user_id, email, user_email, user_name, subject, category, description, status, priority, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          tickets = data;
        }
      } catch (err) {
        console.warn('[SupportService] Supabase query fallback:', err.message);
      }
    }

    // Merge with local DB records for this user (deduplicated by ticket_number / id)
    const localRows = db.getSupportTickets(userId);
    const ticketMap = new Map();
    tickets.forEach(t => ticketMap.set(t.ticket_number || t.id, t));
    localRows.forEach(t => {
      if (!ticketMap.has(t.ticket_number || t.id)) {
        ticketMap.set(t.ticket_number || t.id, t);
      }
    });

    return Array.from(ticketMap.values()).map(t => ({
      id: t.id,
      ticket_number: t.ticket_number,
      subject: t.subject || `${(t.category || 'General').toUpperCase()} Inquiry`,
      category: t.category,
      description_preview: (t.description || '').length > 120 ? t.description.substring(0, 120) + '...' : (t.description || ''),
      status: t.status,
      priority: t.priority,
      created_at: t.created_at,
      updated_at: t.updated_at
    }));
  }

  /**
   * Get single ticket by ID and verify ownership
   */
  async getTicketById(ticketId, userId) {
    if (!userId) {
      const err = new Error('Authenticated user ID is required');
      err.statusCode = 401;
      throw err;
    }

    if (!ticketId) {
      const err = new Error('Ticket ID is required');
      err.statusCode = 400;
      throw err;
    }

    let ticket = null;
    let messages = [];

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data: ticketData, error: ticketError } = await this.supabase
          .from('support_tickets')
          .select('*')
          .or(`id.eq.${ticketId},ticket_number.eq.${ticketId}`)
          .maybeSingle();

        if (!ticketError && ticketData) {
          ticket = ticketData;

          // Check ownership
          if (ticket.user_id && ticket.user_id !== userId) {
            const err = new Error('Access denied: You do not have permission to view this support ticket');
            err.statusCode = 403;
            throw err;
          }

          // Fetch messages from ticket_messages or support_ticket_messages
          let messagesData = [];
          try {
            const { data: m1 } = await this.supabase
              .from('ticket_messages')
              .select('*')
              .eq('ticket_id', ticket.id)
              .order('created_at', { ascending: true });

            if (Array.isArray(m1) && m1.length > 0) {
              messagesData = m1;
            }
          } catch (_) {}

          if (!messagesData || messagesData.length === 0) {
            try {
              const { data: m2 } = await this.supabase
                .from('support_ticket_messages')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('created_at', { ascending: true });

              if (Array.isArray(m2) && m2.length > 0) {
                messagesData = m2;
              }
            } catch (_) {}
          }

          messages = (Array.isArray(messagesData) ? messagesData : []).map(m => ({
            id: m.id,
            ticket_id: m.ticket_id,
            sender_id: m.sender_id,
            sender_type: m.sender_type || m.sender_role || 'user',
            sender_role: m.sender_role || m.sender_type || 'user',
            sender_name: m.sender_name || (m.sender_role === 'agent' || m.sender_type === 'agent' ? 'RiskLoop Support Team' : (ticket.user_name || 'You')),
            message: m.message,
            attachment_url: m.attachment_url || (Array.isArray(m.attachments) ? m.attachments[0] : ''),
            created_at: m.created_at
          }));
        }
      } catch (err) {
        if (err.statusCode === 403) throw err;
        console.warn('[SupportService] Supabase ticket lookup fallback:', err.message);
      }
    }

    // 2. Fallback to Local DB
    if (!ticket) {
      ticket = db.getSupportTicketById(ticketId);
      if (ticket) {
        if (ticket.user_id && ticket.user_id !== userId) {
          const err = new Error('Access denied: You do not have permission to view this support ticket');
          err.statusCode = 403;
          throw err;
        }
        messages = db.getSupportTicketMessages(ticket.id);
      }
    }

    if (!ticket) {
      const err = new Error(`Support ticket "${ticketId}" not found`);
      err.statusCode = 404;
      throw err;
    }

    return {
      ...ticket,
      messages
    };
  }

  /**
   * Get messages for a ticket with ownership check
   */
  async getTicketMessages(ticketId, userId) {
    const ticketWithMessages = await this.getTicketById(ticketId, userId);
    return ticketWithMessages.messages || [];
  }

  /**
   * Helper: Resolve admin recipient for ticket notifications
   */
  async getAdminRecipientForTicket(ticket) {
    if (!ticket) return process.env.ADMIN_USER_ID || 'usr-admin-1';

    // 1. Check if an agent participated in this ticket
    if (Array.isArray(ticket.messages) && ticket.messages.length > 0) {
      const agentMsg = [...ticket.messages].reverse().find(
        m => m.sender_role === 'agent' && m.sender_id && m.sender_id !== ticket.user_id
      );
      if (agentMsg) return agentMsg.sender_id;
    }

    // 2. Query Supabase for registered admin/support users
    if (this.supabase) {
      try {
        const { data: adminProfiles } = await this.supabase
          .from('profiles')
          .select('id, email')
          .neq('id', ticket.user_id || 'none')
          .limit(5);

        if (Array.isArray(adminProfiles) && adminProfiles.length > 0) {
          const foundAdmin = adminProfiles.find(p => {
            const em = (p.email || '').toLowerCase();
            return em.includes('admin') || em.includes('support') || em.endsWith('@riskloop.io');
          });
          if (foundAdmin) return foundAdmin.id;
          return adminProfiles[0].id;
        }
      } catch (_) {}
    }

    return process.env.ADMIN_USER_ID || 'usr-admin-1';
  }

  /**
   * Add a reply message to a ticket
   */
  async addTicketMessage({ ticketId, userId, message, attachments = [] }) {
    if (!userId) {
      const err = new Error('Authenticated user ID is required');
      err.statusCode = 401;
      throw err;
    }

    // Verify ticket ownership first
    const ticket = await this.getTicketById(ticketId, userId);

    const cleanMessage = String(message || '').trim();
    if (!cleanMessage || cleanMessage.length === 0) {
      const err = new Error('Message text is required (minimum 1 character)');
      err.statusCode = 400;
      throw err;
    }

    if (cleanMessage.length > 2000) {
      const err = new Error('Message exceeds maximum limit of 2000 characters');
      err.statusCode = 400;
      throw err;
    }

    const attachmentList = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []);
    const messagePayload = {
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: 'user', // Enforce 'user' role
      message: cleanMessage,
      attachments: attachmentList
    };

    let createdMessage = null;

    // 1. Try Supabase
    if (this.supabase) {
      try {
        // Try ticket_messages table
        const { data: msgData1, error: err1 } = await this.supabase
          .from('ticket_messages')
          .insert([{
            ticket_id: ticket.id,
            sender_id: userId,
            sender_type: 'user',
            sender_name: ticket.user_name || 'You',
            message: cleanMessage,
            attachment_url: attachmentList[0] || null
          }])
          .select()
          .single();

        if (!err1 && msgData1) {
          createdMessage = msgData1;
        }
      } catch (_) {}

      if (!createdMessage) {
        try {
          const { data: msgData2, error: err2 } = await this.supabase
            .from('support_ticket_messages')
            .insert([messagePayload])
            .select()
            .single();

          if (!err2 && msgData2) {
            createdMessage = msgData2;
          }
        } catch (_) {}
      }

      if (createdMessage) {
        try {
          await this.supabase
            .from('support_tickets')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', ticket.id);
        } catch (_) {}
      }
    }

    // 2. Fallback to Local DB
    if (!createdMessage) {
      const msgId = db.addSupportTicketMessage(messagePayload);
      createdMessage = {
        id: msgId,
        ...messagePayload,
        created_at: new Date().toISOString()
      };
    } else {
      try {
        db.addSupportTicketMessage({ ...messagePayload, id: createdMessage.id });
      } catch (_) {}
    }

    // 3. Dispatch Customer Reply Notification for Support / Admin Team
    if (createdMessage) {
      try {
        const adminRecipientId = await this.getAdminRecipientForTicket(ticket);
        if (adminRecipientId && adminRecipientId !== userId) {
          await notificationService.createNotification({
            userId: adminRecipientId,
            type: 'customer_reply',
            title: 'Customer Replied',
            message: `Customer replied to ticket #${ticket.ticket_number}`,
            ticketId: ticket.id,
            metadata: {
              ticket_number: ticket.ticket_number,
              category: ticket.category
            }
          });
        }
      } catch (notifErr) {
        console.error('[SupportService] Failed to create customer_reply notification:', notifErr.message);
      }
    }

    return createdMessage;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN & SUPPORT TEAM METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all tickets across all users for Admin Dashboard with filtering & search
   */
  async getAllTicketsAdmin({ status, priority, category, search } = {}) {
    let tickets = [];

    // 1. Try Supabase
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('support_tickets')
          .select('id, ticket_number, user_id, email, category, description, status, priority, created_at, updated_at')
          .order('created_at', { ascending: false });

        if (status && status !== 'all') {
          query = query.eq('status', status);
        }
        if (priority && priority !== 'all') {
          query = query.eq('priority', priority);
        }
        if (category && category !== 'all') {
          query = query.eq('category', category);
        }
        if (search) {
          query = query.or(`ticket_number.ilike.%${search}%,email.ilike.%${search}%,description.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          tickets = data;
        }
      } catch (err) {
        console.warn('[SupportService] Supabase admin query fallback:', err.message);
      }
    }

    // 2. Always merge with Local DB records (deduplicated by ticket_number / id)
    const allRows = db.getSupportTickets(null);
    const ticketMap = new Map();
    tickets.forEach(t => ticketMap.set(t.ticket_number || t.id, t));
    allRows.forEach(t => {
      const key = t.ticket_number || t.id;
      if (!ticketMap.has(key)) {
        if (status && status !== 'all' && t.status !== status) return;
        if (priority && priority !== 'all' && t.priority !== priority) return;
        if (category && category !== 'all' && t.category !== category) return;
        if (search) {
          const s = search.toLowerCase();
          const tNum = (t.ticket_number || '').toLowerCase();
          const tEmail = (t.email || t.user_email || '').toLowerCase();
          const tDesc = (t.description || '').toLowerCase();
          if (!tNum.includes(s) && !tEmail.includes(s) && !tDesc.includes(s)) return;
        }
        ticketMap.set(key, t);
      }
    });
    tickets = Array.from(ticketMap.values());

    // Calculate overview statistics
    const allTickets = this.supabase ? (await this.supabase.from('support_tickets').select('status').then(r => r.data || []).catch(() => [])) : db.getSupportTickets(null);
    const statsSource = allTickets.length > 0 ? allTickets : tickets;

    const stats = {
      total: statsSource.length,
      open: statsSource.filter(t => t.status === 'open').length,
      under_review: statsSource.filter(t => t.status === 'under_review' || t.status === 'review').length,
      waiting_for_user: statsSource.filter(t => t.status === 'waiting_for_user' || t.status === 'waiting').length,
      resolved: statsSource.filter(t => t.status === 'resolved').length
    };

    const formattedTickets = tickets.map(t => ({
      id: t.id,
      ticket_number: t.ticket_number,
      user_id: t.user_id,
      email: t.email || 'Anonymous',
      category: t.category,
      description_preview: t.description ? (t.description.length > 130 ? t.description.substring(0, 130) + '...' : t.description) : '',
      status: t.status || 'open',
      priority: t.priority || 'medium',
      created_at: t.created_at,
      updated_at: t.updated_at
    }));

    return {
      tickets: formattedTickets,
      stats
    };
  }

  /**
   * Get complete ticket details and full conversation thread for Admin
   */
  async getTicketByIdAdmin(ticketId) {
    if (!ticketId) {
      const err = new Error('Ticket ID is required');
      err.statusCode = 400;
      throw err;
    }

    let ticket = null;
    let messages = [];

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data: ticketData, error: ticketError } = await this.supabase
          .from('support_tickets')
          .select('*')
          .or(`id.eq.${ticketId},ticket_number.eq.${ticketId}`)
          .maybeSingle();

        if (!ticketError && ticketData) {
          ticket = ticketData;

          let messagesData = [];
          try {
            const { data: m1 } = await this.supabase
              .from('ticket_messages')
              .select('*')
              .eq('ticket_id', ticket.id)
              .order('created_at', { ascending: true });

            if (Array.isArray(m1) && m1.length > 0) {
              messagesData = m1;
            }
          } catch (_) {}

          if (!messagesData || messagesData.length === 0) {
            try {
              const { data: m2 } = await this.supabase
                .from('support_ticket_messages')
                .select('*')
                .eq('ticket_id', ticket.id)
                .order('created_at', { ascending: true });

              if (Array.isArray(m2) && m2.length > 0) {
                messagesData = m2;
              }
            } catch (_) {}
          }

          messages = (Array.isArray(messagesData) ? messagesData : []).map(m => ({
            id: m.id,
            ticket_id: m.ticket_id,
            sender_id: m.sender_id,
            sender_type: m.sender_type || m.sender_role || 'user',
            sender_role: m.sender_role || m.sender_type || 'user',
            sender_name: m.sender_name || (m.sender_role === 'agent' || m.sender_type === 'agent' ? 'RiskLoop Support Team' : (ticket.user_name || 'Trader')),
            message: m.message,
            attachment_url: m.attachment_url || (Array.isArray(m.attachments) ? m.attachments[0] : ''),
            created_at: m.created_at
          }));
        }
      } catch (err) {
        console.warn('[SupportService] Supabase admin ticket lookup fallback:', err.message);
      }
    }

    // 2. Fallback to Local DB
    if (!ticket) {
      ticket = db.getSupportTicketById(ticketId);
      if (ticket) {
        messages = db.getSupportTicketMessages(ticket.id);
      }
    }

    if (!ticket) {
      const err = new Error(`Support ticket "${ticketId}" not found`);
      err.statusCode = 404;
      throw err;
    }

    return {
      ...ticket,
      messages
    };
  }

  /**
   * Add a Support Team / Admin reply to a customer ticket
   */
  async addTicketMessageAdmin({ ticketId, senderId, senderEmail, message, attachments = [] }) {
    const ticket = await this.getTicketByIdAdmin(ticketId);

    const cleanMessage = String(message || '').trim();
    if (!cleanMessage || cleanMessage.length === 0) {
      const err = new Error('Message text is required (minimum 1 character)');
      err.statusCode = 400;
      throw err;
    }

    if (cleanMessage.length > 2000) {
      const err = new Error('Message exceeds maximum limit of 2000 characters');
      err.statusCode = 400;
      throw err;
    }

    const attachmentList = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []);
    const messagePayload = {
      ticket_id: ticket.id,
      sender_id: senderId || 'support-agent-admin',
      sender_role: 'agent', // Enforce 'agent' role for support desk
      message: cleanMessage,
      attachments: attachmentList
    };

    let createdMessage = null;

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data: msgData1, error: err1 } = await this.supabase
          .from('ticket_messages')
          .insert([{
            ticket_id: ticket.id,
            sender_id: senderId || 'support-agent-admin',
            sender_type: 'agent',
            sender_name: 'RiskLoop Support Team',
            message: cleanMessage,
            attachment_url: attachmentList[0] || null
          }])
          .select()
          .single();

        if (!err1 && msgData1) {
          createdMessage = msgData1;
        }
      } catch (_) {}

      if (!createdMessage) {
        try {
          const { data: msgData2, error: err2 } = await this.supabase
            .from('support_ticket_messages')
            .insert([messagePayload])
            .select()
            .single();

          if (!err2 && msgData2) {
            createdMessage = msgData2;
          }
        } catch (_) {}
      }

      if (createdMessage) {
        try {
          const newStatus = ticket.status === 'resolved' ? 'resolved' : 'waiting_for_user';
          await this.supabase
            .from('support_tickets')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', ticket.id);
        } catch (_) {}
      }
    }

    // 2. Fallback to Local DB
    if (!createdMessage) {
      const msgId = db.addSupportTicketMessage(messagePayload);
      createdMessage = {
        id: msgId,
        ...messagePayload,
        created_at: new Date().toISOString()
      };
      if (ticket.status !== 'resolved') {
        db.updateSupportTicketStatus(ticket.id, 'waiting_for_user');
      }
    } else {
      try {
        db.addSupportTicketMessage({ ...messagePayload, id: createdMessage.id });
        if (ticket.status !== 'resolved') {
          db.updateSupportTicketStatus(ticket.id, 'waiting_for_user');
        }
      } catch (_) {}
    }

    // 3. Dispatch Support Reply Notification for Ticket Owner
    if (createdMessage) {
      try {
        if (ticket.user_id) {
          await notificationService.createNotification({
            userId: ticket.user_id,
            type: 'support_reply',
            title: 'New Support Reply',
            message: `RiskLoop Support replied to ticket #${ticket.ticket_number}`,
            ticketId: ticket.id,
            metadata: {
              ticket_number: ticket.ticket_number,
              category: ticket.category
            }
          });
        }
      } catch (notifErr) {
        console.error('[SupportService] Failed to create support_reply notification:', notifErr.message);
      }

      // 4. Dispatch Support Reply Email to Ticket Owner (Async & Fail-Safe)
      if (ticket.email) {
        try {
          await emailService.sendSupportReplyEmail({
            to: ticket.email,
            ticketNumber: ticket.ticket_number,
            ticketId: ticket.id,
            messageText: cleanMessage,
            category: ticket.category
          });
        } catch (emailErr) {
          console.error('[SupportService] Failed to send support_reply email:', emailErr.message);
        }
      }
    }

    return createdMessage;
  }

  /**
   * Update Ticket Status as Admin
   */
  async updateTicketStatusAdmin({ ticketId, status }) {
    if (!status || !TICKET_STATUSES.includes(status)) {
      const err = new Error(`Invalid status "${status}". Allowed: ${TICKET_STATUSES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const ticket = await this.getTicketByIdAdmin(ticketId);
    const previousStatus = ticket.status;
    let updatedTicket = null;

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('support_tickets')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', ticket.id)
          .select()
          .single();

        if (!error && data) {
          updatedTicket = data;
        }
      } catch (err) {
        console.warn('[SupportService] Supabase status update fallback:', err.message);
      }
    }

    // 2. Local DB Fallback
    if (!updatedTicket) {
      updatedTicket = db.updateSupportTicketStatus(ticket.id, status);
    } else {
      try { db.updateSupportTicketStatus(ticket.id, status); } catch (_) {}
    }

    // 3. Dispatch Notification for Ticket Owner (Only if status changed)
    if (updatedTicket && ticket.user_id && status !== previousStatus) {
      try {
        if (status === 'resolved') {
          // Send ONLY ticket_resolved (avoid duplicate ticket_status_change)
          await notificationService.createNotification({
            userId: ticket.user_id,
            type: 'ticket_resolved',
            title: 'Ticket Resolved',
            message: `Your support ticket #${ticket.ticket_number} has been resolved.`,
            ticketId: ticket.id,
            metadata: {
              ticket_number: ticket.ticket_number,
              previous_status: previousStatus,
              new_status: 'resolved'
            }
          });
        } else {
          // Build user-friendly status message
          let statusMsg = `Your ticket #${ticket.ticket_number} status was updated to ${status}.`;
          if (status === 'under_review') {
            statusMsg = `Your ticket #${ticket.ticket_number} is now under review.`;
          } else if (status === 'waiting_for_user') {
            statusMsg = `Your ticket #${ticket.ticket_number} is waiting for your response.`;
          } else if (status === 'open') {
            statusMsg = `Your ticket #${ticket.ticket_number} is open.`;
          }

          await notificationService.createNotification({
            userId: ticket.user_id,
            type: 'ticket_status_change',
            title: 'Ticket Updated',
            message: statusMsg,
            ticketId: ticket.id,
            metadata: {
              ticket_number: ticket.ticket_number,
              previous_status: previousStatus,
              new_status: status
            }
          });
        }
      } catch (notifErr) {
        console.error('[SupportService] Failed to create status notification:', notifErr.message);
      }
    }

    // 4. Dispatch Email to Ticket Owner (Async & Fail-Safe)
    if (updatedTicket && ticket.email && status !== previousStatus) {
      try {
        if (status === 'resolved') {
          await emailService.sendTicketResolvedEmail({
            to: ticket.email,
            ticketNumber: ticket.ticket_number,
            ticketId: ticket.id,
            category: ticket.category,
            resolutionNote: 'Your inquiry has been successfully marked as resolved by RiskLoop support.'
          });
        } else {
          await emailService.sendTicketStatusChangeEmail({
            to: ticket.email,
            ticketNumber: ticket.ticket_number,
            ticketId: ticket.id,
            previousStatus: previousStatus,
            newStatus: status,
            category: ticket.category
          });
        }
      } catch (emailErr) {
        console.error('[SupportService] Failed to send ticket status email:', emailErr.message);
      }
    }

    return updatedTicket;
  }

  /**
   * Update Ticket Priority as Admin
   */
  async updateTicketPriorityAdmin({ ticketId, priority }) {
    if (!priority || !TICKET_PRIORITIES.includes(priority)) {
      const err = new Error(`Invalid priority "${priority}". Allowed: ${TICKET_PRIORITIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const ticket = await this.getTicketByIdAdmin(ticketId);
    let updatedTicket = null;

    // 1. Try Supabase
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('support_tickets')
          .update({ priority, updated_at: new Date().toISOString() })
          .eq('id', ticket.id)
          .select()
          .single();

        if (!error && data) {
          updatedTicket = data;
        }
      } catch (err) {
        console.warn('[SupportService] Supabase priority update fallback:', err.message);
      }
    }

    // 2. Local DB Fallback
    if (!updatedTicket) {
      updatedTicket = db.updateSupportTicketPriority(ticket.id, priority);
    } else {
      try { db.updateSupportTicketPriority(ticket.id, priority); } catch (_) {}
    }

    return updatedTicket;
  }
}

export const supportService = new SupportService();

