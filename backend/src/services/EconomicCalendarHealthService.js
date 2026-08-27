/**
 * Economic Calendar Health Service
 * 
 * Evaluates the overall health, freshness, database connectivity, distributed lock,
 * and poller activity of the RiskLoop Economic Calendar subsystems without exposing
 * internal credentials or instance IDs.
 */

import { schedulerAuditService } from './SchedulerAuditService.js';
import { officialSourcePollerService } from './OfficialSourcePollerService.js';
import { schedulerLockService } from './SchedulerLockService.js';
import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';

class EconomicCalendarHealthService {
  /**
   * Evaluate complete health status
   * 
   * @param {Object} [options]
   * @param {boolean} [options.overrideEnabled] Test override for scheduler enabled state
   * @param {number} [options.overrideMaxAgeHours] Test override for max age threshold
   * @param {boolean} [options.simulateDbError] Test simulation for database failure
   * @param {Object} [options.customAuditRuns] Test simulation for audit runs
   */
  async getHealthStatus(options = {}) {
    const checkedAt = new Date().toISOString();
    const reasons = [];

    // 1. Configuration & Threshold
    const isEnabled = options.overrideEnabled !== undefined
      ? options.overrideEnabled
      : process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED === 'true';

    const maxAgeHours = options.overrideMaxAgeHours !== undefined
      ? options.overrideMaxAgeHours
      : (parseFloat(process.env.ECONOMIC_CALENDAR_HEALTH_MAX_AGE_HOURS) || 30);

    // 2. Database Connectivity Check
    let isDbHealthy = false;
    if (options.simulateDbError) {
      isDbHealthy = false;
    } else {
      const supabase = supabaseEconomicCalendarService.supabase;
      if (supabase) {
        try {
          const { error } = await supabase
            .from('economic_events')
            .select('id', { count: 'exact', head: true })
            .limit(1);

          isDbHealthy = !error;
        } catch {
          isDbHealthy = false;
        }
      }
    }

    if (!isDbHealthy) {
      reasons.push('DATABASE_CONNECTION_ERROR');
    }

    // 3. Scheduler Audit & Freshness
    let latestRun = null;
    let latestSuccess = null;

    if (options.customAuditRuns) {
      latestRun = options.customAuditRuns.latestRun || null;
      latestSuccess = options.customAuditRuns.latestSuccess || null;
    } else {
      const recentRuns = await schedulerAuditService.getRecentRuns(1, 'economic_calendar_scheduler');
      latestRun = recentRuns.length > 0 ? recentRuns[0] : null;
      latestSuccess = await schedulerAuditService.getLatestSuccessfulRun('economic_calendar_scheduler');
    }

    const latestRunStatus = latestRun ? latestRun.status : null;
    const lastSuccessfulRun = latestSuccess ? (latestSuccess.completed_at || latestSuccess.started_at) : null;

    let hoursSinceLastSuccess = null;
    if (lastSuccessfulRun) {
      const successTime = new Date(lastSuccessfulRun).getTime();
      const now = new Date().getTime();
      hoursSinceLastSuccess = Math.max(0, Number(((now - successTime) / (1000 * 60 * 60)).toFixed(2)));
    }

    // 4. Determine Health Status
    let overallStatus = 'healthy';

    if (!isDbHealthy) {
      overallStatus = 'unhealthy';
    } else if (!isEnabled) {
      overallStatus = 'disabled';
      reasons.push('SCHEDULER_DISABLED');
    } else if (!lastSuccessfulRun) {
      overallStatus = 'degraded';
      reasons.push('NO_SUCCESSFUL_RUN_FOUND');
    } else if (hoursSinceLastSuccess > maxAgeHours) {
      overallStatus = 'unhealthy';
      reasons.push(`STALE_SCHEDULER_RUN: Last success was ${hoursSinceLastSuccess}h ago (max allowed: ${maxAgeHours}h)`);
    } else if (latestRunStatus === 'failed' && hoursSinceLastSuccess <= maxAgeHours) {
      overallStatus = 'degraded';
      reasons.push('LATEST_RUN_FAILED: Most recent scheduler run failed, but recent success is within SLA');
    } else {
      overallStatus = 'healthy';
    }

    // 5. Poller Status
    const activeJobs = officialSourcePollerService.getActiveJobs().length;

    // 6. Distributed Lock Status (Sanitized for public health response)
    let lockStatus = { locked: false, expiresAt: null };
    try {
      const lockRes = await schedulerLockService.getLockStatus('economic_calendar_scheduler');
      if (lockRes && lockRes.isLocked) {
        lockStatus = {
          locked: true,
          expiresAt: lockRes.lock?.expires_at || null
        };
      }
    } catch {
      // Quiet fallback
    }

    return {
      success: true,
      status: overallStatus,
      checkedAt,
      scheduler: {
        enabled: isEnabled,
        latestRunStatus,
        lastSuccessfulRun,
        hoursSinceLastSuccess
      },
      poller: {
        activeJobs
      },
      distributedLock: lockStatus,
      database: {
        status: isDbHealthy ? 'healthy' : 'unhealthy'
      },
      reasons
    };
  }
}

export const economicCalendarHealthService = new EconomicCalendarHealthService();
