/**
 * AI Support Routes
 * API endpoints for RiskLoop AI Knowledge Assistant
 * Mount point: /api/support/ai
 */

import { Router } from 'express';
import { aiSupportService } from '../services/AiSupportService.js';
import { supportService } from '../services/SupportService.js';
import { aiSupportLimiter } from '../middleware/rateLimiters.js';

const router = Router();

/**
 * Authentication Middleware:
 * Verifies Supabase Bearer JWT token or extracts authenticated session.
 * Rejects unauthenticated requests with 401 Unauthorized.
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
        error: 'Authentication required. Please log in to consult RiskLoop AI Assistant.'
      });
    }

    const { user, error } = await supportService.verifyUserToken(token);
    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session. Please log in again.'
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
      error: 'Authentication failed. Please verify your credentials.'
    });
  }
}

/**
 * POST /api/support/ai/ask & POST /api/support/ai
 * Ask RiskLoop AI Assistant
 */
async function handleAiAsk(req, res) {
  try {
    const { query } = req.body || {};

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid question (1–500 characters).'
      });
    }

    if (query.trim().length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Query exceeds maximum limit of 500 characters.'
      });
    }

    const result = await aiSupportService.ask({
      query: query.trim(),
      user: req.user
    });

    return res.status(200).json({
      success: true,
      answer: result.answer,
      topic: result.topic,
      sources: result.sources || [],
      handoff: !!result.handoff
    });
  } catch (err) {
    console.error('[AiSupportRoute] Error answering query:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to process your request at this time. Please try again or open a support ticket.',
      answer: 'Our AI service is temporarily unavailable. Please try again shortly or contact support.',
      handoff: true
    });
  }
}

router.post('/ask', aiSupportLimiter, requireAuth, handleAiAsk);
router.post('/', aiSupportLimiter, requireAuth, handleAiAsk);

export default router;
