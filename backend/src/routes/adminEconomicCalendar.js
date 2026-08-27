/**
 * Admin Economic Calendar Routes
 * Protected API endpoints for RiskLoop Economic Calendar Operations Dashboard
 * Mount point: /api/admin/economic-calendar
 */

import { Router } from 'express';
import { economicCalendarHealthService } from '../services/EconomicCalendarHealthService.js';
import { calendarSchedulerService } from '../services/CalendarSchedulerService.js';
import { schedulerAuditService } from '../services/SchedulerAuditService.js';
import { schedulerLockService } from '../services/SchedulerLockService.js';
import { officialSourcePollerService } from '../services/OfficialSourcePollerService.js';
import { economicCalendarIncidentService } from '../services/EconomicCalendarIncidentService.js';
import { economicCalendarAlertService } from '../services/EconomicCalendarAlertService.js';
import { economicCalendarRolloutService } from '../services/EconomicCalendarRolloutService.js';
import { economicCalendarRolloutGuardService } from '../services/EconomicCalendarRolloutGuardService.js';
import { economicCalendarCanaryActivationService } from '../services/EconomicCalendarCanaryActivationService.js';
import { economicCalendarCanarySafetyService } from '../services/EconomicCalendarCanarySafetyService.js';
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
    return res.status(500).json({
      success: false,
      error: 'Authentication verification failed: ' + err.message
    });
  }
}

// Apply admin authentication to all operational endpoints
router.use(requireAdminAuth);

/**
 * GET /api/admin/economic-calendar/dashboard
 * Aggregated Operations Dashboard State
 */
router.get('/dashboard', async (req, res) => {
  try {
    const health = await economicCalendarHealthService.getHealthStatus();
    const recentRuns = await schedulerAuditService.getRecentRuns(10, 'economic_calendar_scheduler');
    const latestSuccess = await schedulerAuditService.getLatestSuccessfulRun('economic_calendar_scheduler');
    const activeIncidents = await economicCalendarIncidentService.getActiveIncidents();
    const recentIncidents = await economicCalendarIncidentService.getIncidentHistory(15);
    const activeJobs = officialSourcePollerService.getActiveJobs();
    const alertHistory = economicCalendarAlertService.getAlertHistory(10);
    const lockStatus = await schedulerLockService.getLockStatus('economic_calendar_scheduler');

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      health,
      scheduler: {
        enabled: process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED === 'true',
        staleThresholdHours: parseFloat(process.env.ECONOMIC_CALENDAR_HEALTH_MAX_AGE_HOURS) || 30,
        alertCooldownMinutes: parseFloat(process.env.ECONOMIC_CALENDAR_ALERT_COOLDOWN_MINUTES) || 60,
        latestSuccessfulRun: latestSuccess,
        recentRuns
      },
      poller: {
        activeJobCount: activeJobs.length,
        jobs: activeJobs
      },
      distributedLock: {
        isLocked: lockStatus.isLocked,
        expiresAt: lockStatus.lock?.expires_at || null
      },
      incidents: {
        activeCount: activeIncidents.length,
        active: activeIncidents,
        recent: recentIncidents
      },
      alerts: {
        recentCount: alertHistory.length,
        history: alertHistory
      }
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Dashboard error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve operations dashboard data',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/rollout-status
 * Read-only Production Rollout Status & Indicator Permissions
 */
router.get('/rollout-status', (req, res) => {
  try {
    const status = economicCalendarRolloutService.getRolloutStatus();
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Rollout status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve rollout status: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/rollout-readiness
 * Pre-activation validation checks before canary rollout
 */
router.get('/rollout-readiness', async (req, res) => {
  try {
    const indicator = req.query.indicator || null;
    const readiness = await economicCalendarRolloutGuardService.validateRolloutReadiness({ indicator });
    return res.status(200).json({
      success: true,
      ...readiness
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Rollout readiness error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to evaluate rollout readiness: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/emergency-rollback
 * Immediately trigger in-memory emergency rollback to block all live database writes
 */
router.post('/emergency-rollback', (req, res) => {
  try {
    const { reason = 'Manual emergency rollback triggered' } = req.body;
    const user = req.adminUser?.email || req.adminUser?.id || 'admin';
    const status = economicCalendarRolloutGuardService.triggerEmergencyRollback(reason, { user });

    return res.status(200).json({
      success: true,
      message: 'Emergency rollback activated successfully. All live database writes to economic_events are blocked.',
      ...status
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Emergency rollback error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger emergency rollback: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/rollback-status
 * Query current emergency rollback status
 */
router.get('/rollback-status', (req, res) => {
  try {
    const status = economicCalendarRolloutGuardService.getRollbackStatus();
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Rollback status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve rollback status: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/emergency-rollback/reset
 * Reset / clear active emergency rollback (Protected admin action)
 */
router.post('/emergency-rollback/reset', (req, res) => {
  try {
    const result = economicCalendarRolloutGuardService.resetEmergencyRollback();
    return res.status(200).json({
      success: true,
      message: 'Emergency rollback has been reset.',
      ...result
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Emergency rollback reset error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset emergency rollback: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/canary/prepare
 * Prepare canary activation and retrieve readiness requirements
 */
router.get('/canary/prepare', (req, res) => {
  try {
    const indicator = req.query.indicator;
    const result = economicCalendarCanaryActivationService.prepareCanaryActivation(indicator);
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary prepare error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to prepare canary: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/canary/validate
 * Validate pre-activation readiness for a specific indicator
 */
router.get('/canary/validate', async (req, res) => {
  try {
    const indicator = req.query.indicator;
    const result = await economicCalendarCanaryActivationService.validateCanaryActivation(indicator);
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary validate error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate canary activation: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/canary/activate
 * Activate runtime canary mode for an indicator (in-memory only)
 */
router.post('/canary/activate', async (req, res) => {
  try {
    const { indicator } = req.body;
    const user = req.adminUser?.email || req.adminUser?.id || 'admin';
    const result = await economicCalendarCanaryActivationService.activateCanary(indicator, { user });
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary activate error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to activate canary: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/canary/status
 * Query current runtime canary activation status
 */
router.get('/canary/status', (req, res) => {
  try {
    const status = economicCalendarCanaryActivationService.getCanaryActivationStatus();
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve canary status: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/canary/deactivate
 * Deactivate runtime canary mode
 */
router.post('/canary/deactivate', (req, res) => {
  try {
    const { reason = 'manual deactivation' } = req.body;
    const user = req.adminUser?.email || req.adminUser?.id || 'admin';
    const result = economicCalendarCanaryActivationService.deactivateCanary(reason, { user });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary deactivate error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to deactivate canary: ' + err.message
    });
  }
});

/**
 * GET /api/admin/economic-calendar/canary-safety/status
 * Query canary safety service circuit breaker & validation counters
 */
router.get('/canary-safety/status', (req, res) => {
  try {
    const status = economicCalendarCanarySafetyService.getSafetyStatus();
    return res.status(200).json({
      success: true,
      ...status
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary safety status error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve canary safety status: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/canary-safety/reset
 * Reset canary safety failure counters and circuit breaker
 */
router.post('/canary-safety/reset', (req, res) => {
  try {
    economicCalendarCanarySafetyService.reset();
    return res.status(200).json({
      success: true,
      message: 'Canary safety counters and circuit breaker reset successfully.'
    });
  } catch (err) {
    console.error('[AdminEconomicCalendar] Canary safety reset error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset canary safety: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/incidents
 * Create or report an incident
 */
router.post('/incidents', async (req, res) => {
  try {
    const { incidentKey, severity = 'warning', title, description = '', reasons = [] } = req.body;
    if (!incidentKey || !title) {
      return res.status(400).json({ success: false, error: 'incidentKey and title are required' });
    }

    const result = await economicCalendarIncidentService.openOrUpdateIncident({
      incidentKey,
      severity,
      title,
      description,
      reasons,
      healthSnapshot: { reportedBy: req.adminUser?.email || 'admin' }
    });

    return res.status(201).json({
      success: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to create incident: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/incidents/:id/acknowledge
 * Protected Incident Acknowledgment
 */
router.post('/incidents/:id/acknowledge', async (req, res) => {
  try {
    const adminEmail = req.adminUser?.email || 'admin@riskloop.io';
    const incident = await economicCalendarIncidentService.acknowledgeIncident(req.params.id, adminEmail);

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Incident ${req.params.id} acknowledged by ${adminEmail}`,
      incident
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to acknowledge incident: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/incidents/:id/resolve
 * Protected Incident Resolution
 */
router.post('/incidents/:id/resolve', async (req, res) => {
  try {
    const notes = req.body?.notes || `Manually resolved by administrator (${req.adminUser?.email || 'admin@riskloop.io'})`;
    const incident = await economicCalendarIncidentService.resolveIncident(req.params.id, notes);

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Incident ${req.params.id} resolved successfully`,
      incident
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to resolve incident: ' + err.message
    });
  }
});

/**
 * POST /api/admin/economic-calendar/scheduler/trigger
 * Manually Trigger Scheduler Cycle
 */
router.post('/scheduler/trigger', async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
    const result = await calendarSchedulerService.runSchedulerCycle({ dryRun, isManual: true });

    return res.status(200).json({
      success: result.success,
      message: result.success ? 'Scheduler cycle executed successfully' : 'Scheduler cycle execution blocked',
      result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger scheduler cycle: ' + err.message
    });
  }
});

export default router;
