/**
 * Admin Forex Calendar Routes
 * Protected API endpoints for RiskLoop Forex Economic Calendar Rollout Monitoring
 * Mount point: /api/admin/forex-calendar
 */

import { Router } from 'express';
import { forexCalendarRolloutService } from '../services/forex/ForexCalendarRolloutService.js';
import { supportService } from '../services/SupportService.js';

const router = Router();

const ADMIN_EMAILS = [
  'admin@riskloop.io',
  'support@riskloop.io',
  'admin@riskloop.com',
  'support@riskloop.com'
];

if (process.env.ADMIN_EMAILS) {
  ADMIN_EMAILS.push(...process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()));
}

function isUserAdmin(user, req) {
  if (!user) return false;
  if (user.app_metadata?.role === 'admin' || user.app_metadata?.role === 'support') return true;
  if (user.user_metadata?.role === 'admin' || user.user_metadata?.role === 'support') return true;
  if (user.user_metadata?.is_admin === true || user.is_admin === true) return true;

  const email = (user.email || '').toLowerCase().trim();
  if (email && ADMIN_EMAILS.includes(email)) {
    return true;
  }

  if (process.env.NODE_ENV !== 'production' && (req.headers['x-user-role'] === 'admin' || req.headers['x-user-role'] === 'support')) {
    return true;
  }

  return false;
}

/**
 * Admin Authentication & Authorization Middleware
 */
async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    let token = null;

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (req.headers['x-user-role'] && req.headers['x-user-role'] !== 'admin' && req.headers['x-user-role'] !== 'support') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required'
      });
    }

    // In local dev/test with explicit dev admin key:
    if (process.env.NODE_ENV !== 'production' && req.headers['x-admin-dev-key'] === 'riskloop-dev-admin-key') {
      req.adminUser = {
        id: 'admin-dev-user',
        email: 'admin@riskloop.io',
        role: 'admin'
      };
      return next();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Authentication token is required'
      });
    }

    const { user, error } = await supportService.verifyUserToken(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or expired token'
      });
    }

    if (!isUserAdmin(user, req)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required'
      });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

import { forexCanaryMonitoringService } from '../services/forex/ForexCanaryMonitoringService.js';

/**
 * GET /api/admin/forex-calendar/rollout-status
 * Strictly read-only monitoring endpoint for Forex Economic Calendar rollout
 */
router.get('/rollout-status', requireAdminAuth, async (req, res) => {
  try {
    const status = await forexCalendarRolloutService.getRolloutStatus();
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('Forex rollout status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve Forex rollout status',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/readiness
 * Production readiness evaluation report
 */
router.get('/readiness', requireAdminAuth, async (req, res) => {
  try {
    const report = await forexCanaryMonitoringService.generateProductionReadinessReport();
    return res.status(200).json({
      success: true,
      ...report
    });
  } catch (err) {
    console.error('Forex readiness report error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate readiness report',
      message: err.message
    });
  }
});

import { forexRolloutControllerService } from '../services/forex/ForexRolloutControllerService.js';

/**
 * GET /api/admin/forex-calendar/rollout-stage
 * Retrieve current rollout stage and summary
 */
router.get('/rollout-stage', requireAdminAuth, async (req, res) => {
  try {
    const stageInfo = await forexRolloutControllerService.getRolloutStage();
    return res.status(200).json({
      success: true,
      ...stageInfo
    });
  } catch (err) {
    console.error('Forex rollout stage error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve rollout stage',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/rollout-readiness
 * Evaluate and return detailed rollout readiness report and verdict
 */
router.get('/rollout-readiness', requireAdminAuth, async (req, res) => {
  try {
    const readiness = await forexRolloutControllerService.evaluateRolloutReadiness();
    return res.status(200).json({
      success: true,
      ...readiness
    });
  } catch (err) {
    console.error('Forex rollout readiness error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate rollout readiness',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/rollout-history
 * Retrieve persistent rollout stage transition history
 */
router.get('/rollout-history', requireAdminAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = forexRolloutControllerService.getRolloutHistory(limit);
    return res.status(200).json({
      success: true,
      count: history.length,
      rolloutHistory: history
    });
  } catch (err) {
    console.error('Forex rollout history error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve rollout history',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/rollout-stage
 * Set or advance rollout stage with explicit administrative authorization
 */
router.post('/rollout-stage', requireAdminAuth, async (req, res) => {
  try {
    const { targetStage, explicitApproval, reason } = req.body || {};
    const result = await forexRolloutControllerService.setRolloutStage(targetStage, {
      explicitApproval,
      reason
    });
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('Forex set rollout stage error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update rollout stage',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/emergency-stop
 * Immediate emergency stop switch halting ingestion and scheduling
 */
router.post('/emergency-stop', requireAdminAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = forexRolloutControllerService.emergencyStop(reason);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Forex emergency stop error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to execute emergency stop',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/reset-circuit-breaker
 * Reset tripped circuit breaker after resolving underlying issues
 */
router.post('/reset-circuit-breaker', requireAdminAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = forexRolloutControllerService.resetCircuitBreaker(reason);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Forex circuit breaker reset error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breaker',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/provider-health
 * Real-time health status of all official Forex providers (BLS, BEA, Federal Reserve)
 */
router.get('/provider-health', requireAdminAuth, async (req, res) => {
  try {
    const health = await forexCanaryMonitoringService.checkProviderAlerts();
    return res.status(200).json({
      success: true,
      ...health
    });
  } catch (err) {
    console.error('Provider health endpoint error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve provider health',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/database-integrity
 * Deep database integrity audit and anomaly check
 */
router.get('/database-integrity', requireAdminAuth, async (req, res) => {
  try {
    const integrity = await forexCanaryMonitoringService.verifyDatabaseIntegrity();
    return res.status(200).json({
      success: true,
      ...integrity
    });
  } catch (err) {
    console.error('Database integrity endpoint error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify database integrity',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/production-activation
 * Protected production activation gate requiring explicit confirmation and authorization
 */
router.post('/production-activation', requireAdminAuth, async (req, res) => {
  try {
    const { targetStage, explicitApproval, confirmationToken, reason } = req.body || {};

    if (!explicitApproval) {
      return res.status(400).json({
        success: false,
        error: 'EXPLICIT_APPROVAL_REQUIRED',
        message: 'Production activation requires explicitApproval: true.'
      });
    }

    if (confirmationToken !== 'CONFIRM_USD_PRODUCTION_ACTIVATION') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CONFIRMATION_TOKEN',
        message: 'Production activation requires valid confirmationToken: "CONFIRM_USD_PRODUCTION_ACTIVATION".'
      });
    }

    const result = await forexRolloutControllerService.setRolloutStage(
      targetStage || 'STAGE_4_FULL_ROLLOUT',
      { explicitApproval: true, reason: reason || 'Explicit production activation authorized by admin' }
    );

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('Production activation endpoint error:', err);
    return res.status(500).json({
      success: false,
      error: 'Production activation failed',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/audit-history
 * Persistent canary audit history
 */
router.get('/audit-history', requireAdminAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const action = req.query.action || null;
    const history = forexCanaryMonitoringService.getAuditHistory({ limit, action });
    return res.status(200).json({
      success: true,
      count: history.length,
      auditHistory: history
    });
  } catch (err) {
    console.error('Forex audit history error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit history',
      message: err.message
    });
  }
});

import { multiCurrencyRolloutService } from '../services/forex/MultiCurrencyRolloutService.js';

/**
 * GET /api/admin/forex-calendar/currencies
 * Retrieve overview summary of all currencies and their rollout stages
 */
router.get('/currencies', requireAdminAuth, async (req, res) => {
  try {
    const summary = await multiCurrencyRolloutService.getCurrenciesSummary();
    return res.status(200).json({
      success: true,
      ...summary
    });
  } catch (err) {
    console.error('Multi-currency summary error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve multi-currency summary',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/currency/:currency/status
 * Retrieve detailed status of a specific currency
 */
router.get('/currency/:currency/status', requireAdminAuth, async (req, res) => {
  try {
    const status = await multiCurrencyRolloutService.getCurrencyStatus(req.params.currency);
    if (status.error) {
      return res.status(404).json({ success: false, ...status });
    }
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('Currency status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve currency status',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/forex-calendar/currency/:currency/history
 * Retrieve persistent history for a specific currency
 */
router.get('/currency/:currency/history', requireAdminAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = multiCurrencyRolloutService.getCurrencyHistory(req.params.currency, limit);
    return res.status(200).json({
      success: true,
      currency: (req.params.currency || '').toUpperCase(),
      count: history.length,
      history
    });
  } catch (err) {
    console.error('Currency history error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve currency history',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/currency/:currency/advance
 * Advance rollout stage for a specific currency
 */
router.post('/currency/:currency/advance', requireAdminAuth, async (req, res) => {
  try {
    const { targetStage, explicitApproval, reason } = req.body || {};
    const result = await multiCurrencyRolloutService.advanceCurrencyStage(req.params.currency, targetStage, {
      explicitApproval,
      reason
    });
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('Currency advance error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to advance currency stage',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/currency/:currency/rollback
 * Rollback a specific currency to DISABLED
 */
router.post('/currency/:currency/rollback', requireAdminAuth, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = await multiCurrencyRolloutService.rollbackCurrency(req.params.currency, reason);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('Currency rollback error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to rollback currency',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/forex-calendar/currency/:currency/reset-circuit-breaker
 * Reset circuit breaker for a specific currency
 */
router.post('/currency/:currency/reset-circuit-breaker', requireAdminAuth, (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = multiCurrencyRolloutService.resetCurrencyCircuitBreaker(req.params.currency, reason);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('Currency circuit breaker reset error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset currency circuit breaker',
      message: err.message
    });
  }
});

import { globalForexDashboardService } from '../services/forex/GlobalForexDashboardService.js';

/**
 * GET /api/admin/forex-calendar/global-dashboard
 * Retrieve comprehensive global admin dashboard state
 */
router.get('/global-dashboard', requireAdminAuth, async (req, res) => {
  try {
    const dashboard = await globalForexDashboardService.getGlobalDashboardState();
    return res.status(200).json(dashboard);
  } catch (err) {
    console.error('Global Forex Dashboard error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve global forex dashboard state',
      message: err.message
    });
  }
});

export default router;
