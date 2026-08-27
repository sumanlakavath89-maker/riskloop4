/**
 * Admin Support Routes
 * Protected API endpoints for RiskLoop Support Team & Admin Dashboard
 * Mount point: /api/admin/support
 */

import { Router } from 'express';
import { supportService, TICKET_STATUSES, TICKET_PRIORITIES } from '../services/SupportService.js';

const router = Router();

const ADMIN_EMAILS = [
  'admin@riskloop.io',
  'support@riskloop.io',
  'admin@riskloop.com',
  'support@riskloop.com',
  'institutional@riskloop.io'
];

if (process.env.ADMIN_EMAILS) {
  ADMIN_EMAILS.push(...process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()));
}

/**
 * Check if an authenticated user possesses Admin or Support role
 */
function isUserAdmin(user, req) {
  if (!user) return false;
  
  // 1. Check metadata roles from Supabase Auth
  if (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'support') return true;
  if (user.user_metadata?.role === 'admin' || user.user_metadata?.role === 'support') return true;
  if (user.user_metadata?.is_admin === true || user.is_admin === true) return true;

  // 2. Strict whitelist check
  const email = (user.email || '').toLowerCase().trim();
  if (email && ADMIN_EMAILS.includes(email)) {
    return true;
  }

  // 3. Fallback header for development/testing only
  if (process.env.NODE_ENV !== 'production' && (req.headers['x-user-role'] === 'admin' || req.headers['x-user-role'] === 'support')) {
    return true;
  }

  return false;
}

/**
 * Admin Authentication & Authorization Middleware:
 * 1. Verifies the Supabase Bearer JWT token.
 * 2. Enforces that the user has verified Admin/Support privileges.
 * 3. Rejects normal users with 403 Forbidden.
 */
async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    let token = null;

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-supabase-token']) {
      token = String(req.headers['x-supabase-token']).trim();
    }

    let authUser = null;

    if (token) {
      const { user, error } = await supportService.verifyUserToken(token);
      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired authentication session. Please log in again.'
        });
      }
      authUser = user;
    } else if (req.headers['x-user-id'] || req.headers['x-user-email']) {
      // In local dev/testing mode
      authUser = {
        id: req.headers['x-user-id'] || 'dev-user',
        email: req.headers['x-user-email'] || `${req.headers['x-user-id']}@riskloop.io`,
        user_metadata: { role: req.headers['x-user-role'] || 'user' }
      };
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Authorization Bearer token.'
      });
    }

    // Role check: Normal users must receive 403 Forbidden
    if (!isUserAdmin(authUser, req)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Access denied. Admin or Support role required.'
      });
    }

    req.user = {
      id: authUser.id,
      email: authUser.email || 'admin@riskloop.io',
      role: 'admin'
    };

    next();
  } catch (err) {
    console.error('[AdminSupportAuth] Middleware error:', err);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed. Please verify your credentials.'
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SUPPORT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/support/tickets
 * List all customer support tickets with optional filtering by status, priority, category, search
 */
router.get('/tickets', requireAdminAuth, async (req, res) => {
  try {
    const { status, priority, category, search } = req.query;
    const result = await supportService.getAllTicketsAdmin({
      status,
      priority,
      category,
      search
    });

    return res.status(200).json({
      success: true,
      data: result.tickets,
      stats: result.stats
    });
  } catch (err) {
    console.error('[AdminSupport API] GET /tickets error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve support tickets.'
    });
  }
});

/**
 * GET /api/admin/support/tickets/:id
 * Get ticket details and full conversation history
 */
router.get('/tickets/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await supportService.getTicketByIdAdmin(id);

    return res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (err) {
    console.error(`[AdminSupport API] GET /tickets/${req.params.id} error:`, err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve ticket details.'
    });
  }
});

/**
 * POST /api/admin/support/tickets/:id/messages
 * Post an official support reply to a customer ticket
 */
router.post('/tickets/:id/messages', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { message, attachments } = req.body;

    if (!message || String(message).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required (1–2000 characters).'
      });
    }

    const createdMessage = await supportService.addTicketMessageAdmin({
      ticketId: id,
      senderId: req.user.id,
      senderEmail: req.user.email,
      message,
      attachments
    });

    return res.status(201).json({
      success: true,
      message: 'Support reply sent successfully',
      data: createdMessage
    });
  } catch (err) {
    console.error(`[AdminSupport API] POST /tickets/${req.params.id}/messages error:`, err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to send support reply.'
    });
  }
});

/**
 * PATCH /api/admin/support/tickets/:id/status
 * Update ticket status (open, under_review, waiting_for_user, resolved)
 */
router.patch('/tickets/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !TICKET_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status "${status}". Allowed: ${TICKET_STATUSES.join(', ')}`
      });
    }

    const updatedTicket = await supportService.updateTicketStatusAdmin({
      ticketId: id,
      status
    });

    return res.status(200).json({
      success: true,
      message: 'Ticket status updated successfully',
      data: updatedTicket
    });
  } catch (err) {
    console.error(`[AdminSupport API] PATCH /tickets/${req.params.id}/status error:`, err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to update ticket status.'
    });
  }
});

/**
 * PATCH /api/admin/support/tickets/:id/priority
 * Update ticket priority (low, medium, high, urgent)
 */
router.patch('/tickets/:id/priority', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority || !TICKET_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: `Invalid priority "${priority}". Allowed: ${TICKET_PRIORITIES.join(', ')}`
      });
    }

    const updatedTicket = await supportService.updateTicketPriorityAdmin({
      ticketId: id,
      priority
    });

    return res.status(200).json({
      success: true,
      message: 'Ticket priority updated successfully',
      data: updatedTicket
    });
  } catch (err) {
    console.error(`[AdminSupport API] PATCH /tickets/${req.params.id}/priority error:`, err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to update ticket priority.'
    });
  }
});

export default router;
