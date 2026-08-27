/**
 * Notifications Routes
 * Protected API endpoints for user notification retrieval and status updates.
 * Mount point: /api/notifications
 */

import { Router } from 'express';
import { notificationService } from '../services/NotificationService.js';

const router = Router();

/**
 * Authentication Middleware:
 * Verifies Supabase Bearer JWT token and attaches authenticated user identity.
 * Never trusts user_id supplied by the frontend body.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

    // Development-only fallback
    if (
      process.env.NODE_ENV !== 'production' &&
      !authHeader &&
      req.headers['x-user-id']
    ) {
      req.user = {
        id: String(req.headers['x-user-id']).trim(),
        email: req.headers['x-user-email'] || `${req.headers['x-user-id']}@riskloop.io`
      };
      return next();
    }

    // Production and normal authentication path
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-supabase-token']) {
      token = String(req.headers['x-supabase-token']).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Authorization Bearer token.'
      });
    }

    const { user, error } = await notificationService.verifyUserToken(token);
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication token. Please log in again.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email || `${user.id}@riskloop.io`
    };

    return next();
  } catch (err) {
    console.error('[NotificationAuth] Middleware error:', err);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/notifications
 * Retrieve notifications for the authenticated user (newest first, max 50 default).
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';

    const result = await notificationService.getUserNotifications(req.user.id, {
      limit,
      unreadOnly
    });

    return res.status(200).json({
      success: true,
      data: result.notifications,
      unreadCount: result.unreadCount
    });
  } catch (err) {
    console.error('[Notifications API] GET / error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve notifications.'
    });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications belonging to the authenticated user as read.
 */
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updatedCount: result.updatedCount
    });
  } catch (err) {
    console.error('[Notifications API] PATCH /read-all error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to mark all notifications as read.'
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a specific notification as read with strict user ownership validation.
 */
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedNotification = await notificationService.markAsRead(id, req.user.id);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: updatedNotification
    });
  } catch (err) {
    console.error(`[Notifications API] PATCH /${req.params.id}/read error:`, err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to mark notification as read.'
    });
  }
});

export default router;
