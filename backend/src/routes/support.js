/**
 * Support Routes
 * API endpoints for RiskLoop Support Ticket System & Messages
 * Mount point: /api/support
 */

import { Router } from 'express';
import { supportService, SUPPORT_CATEGORIES } from '../services/SupportService.js';
import { supportTicketLimiter } from '../middleware/rateLimiters.js';

const router = Router();

/**
 * Authentication Middleware:
 * Verifies Supabase Bearer JWT token and extracts authenticated user ID and email.
 * Never trusts user_id or email provided in the request body.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

    // Development-only fallback
    if (
      process.env.NODE_ENV !== 'production' &&
      !authHeader &&
      (req.headers['x-user-id'] || req.headers['x-user-email'])
    ) {
      const devId = req.headers['x-user-id'] || 'dev-user';
      const devEmail = req.headers['x-user-email'] || `${devId}@riskloop.io`;
      req.user = { id: devId, email: devEmail };
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

    const { user, error } = await supportService.verifyUserToken(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired authentication session. Please log in again.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email || user.user_metadata?.email || 'trader@riskloop.io'
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed: ' + (err.message || 'Unknown error')
    });
  }
}

/**
 * POST /api/support/tickets
 * Create a new support ticket (Authenticated Supabase User)
 */
router.post('/tickets', supportTicketLimiter, requireAuth, async (req, res) => {
  try {
    const { category, description, attachments } = req.body || {};

    if (!category) {
      return res.status(400).json({
        success: false,
        error: `Category is required. Valid categories: ${SUPPORT_CATEGORIES.join(', ')}`
      });
    }

    if (!description || String(description).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Description is required (1–2000 characters).'
      });
    }

    if (String(description).trim().length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Description exceeds maximum limit of 2000 characters.'
      });
    }

    const ticket = await supportService.createTicket({
      userId: req.user.id,
      email: req.user.email,
      category,
      description,
      attachments: attachments || []
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: ticket
    });
  } catch (err) {
    console.error('[Support API] POST /tickets error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to create support ticket'
    });
  }
});

/**
 * Compatibility Alias: POST /api/support/ticket
 */
router.post('/ticket', supportTicketLimiter, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    let userId = null;
    let userEmail = req.body?.email || 'guest@riskloop.io';

    if (token) {
      const { user } = await supportService.verifyUserToken(token);
      if (user) {
        userId = user.id;
        userEmail = user.email || userEmail;
      }
    } else if (process.env.NODE_ENV !== 'production' && req.headers['x-user-id']) {
      userId = req.headers['x-user-id'];
      userEmail = req.headers['x-user-email'] || userEmail;
    }

    const { category = 'other', description = '', attachments = [], screenshot } = req.body || {};
    const attachmentList = Array.isArray(attachments) ? attachments : (screenshot ? [screenshot] : []);

    const ticket = await supportService.createTicket({
      userId: userId || 'guest-user',
      email: userEmail,
      category: SUPPORT_CATEGORIES.includes(category) ? category : 'other',
      description: description || 'Support request from RiskLoop terminal',
      attachments: attachmentList
    });

    res.status(201).json({
      success: true,
      ticketRef: ticket.ticket_number,
      message: 'Support ticket created successfully',
      data: ticket
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to create support ticket'
    });
  }
});

/**
 * GET /api/support/tickets
 * Return all tickets belonging to the authenticated user
 */
router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const tickets = await supportService.getUserTickets(req.user.id);
    res.json({
      success: true,
      data: tickets
    });
  } catch (err) {
    console.error('[Support API] GET /tickets error:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve support tickets'
    });
  }
});

/**
 * GET /api/support/tickets/:id
 * Return single ticket with messages (Verifies user ownership)
 */
router.get('/tickets/:id', requireAuth, async (req, res) => {
  try {
    const ticket = await supportService.getTicketById(req.params.id, req.user.id);
    res.json({
      success: true,
      data: ticket
    });
  } catch (err) {
    console.error(`[Support API] GET /tickets/${req.params.id} error:`, err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve support ticket'
    });
  }
});

/**
 * GET /api/support/tickets/:id/messages
 * Return messages for authenticated user's ticket
 */
router.get('/tickets/:id/messages', requireAuth, async (req, res) => {
  try {
    const messages = await supportService.getTicketMessages(req.params.id, req.user.id);
    res.json({
      success: true,
      data: messages
    });
  } catch (err) {
    console.error(`[Support API] GET /tickets/${req.params.id}/messages error:`, err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to retrieve ticket messages'
    });
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * Append a reply message to an existing ticket
 */
router.post('/tickets/:id/messages', requireAuth, async (req, res) => {
  try {
    const { message, attachments } = req.body || {};

    if (!message || String(message).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required (1–2000 characters).'
      });
    }

    if (String(message).trim().length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message exceeds maximum limit of 2000 characters.'
      });
    }

    const createdMessage = await supportService.addTicketMessage({
      ticketId: req.params.id,
      userId: req.user.id,
      message,
      attachments: attachments || []
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: createdMessage
    });
  } catch (err) {
    console.error(`[Support API] POST /tickets/${req.params.id}/messages error:`, err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message || 'Failed to send message'
    });
  }
});

export default router;
