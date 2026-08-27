/**
 * Economic Calendar Rollout Guard & Emergency Rollback Service
 * 
 * Provides:
 * 1. Pre-activation readiness verification
 * 2. In-memory high-priority Emergency Rollback Switch
 * 3. Canary activation validation
 */

import { economicCalendarHealthService } from './EconomicCalendarHealthService.js';
import { economicCalendarIncidentService } from './EconomicCalendarIncidentService.js';
import { schedulerLockService } from './SchedulerLockService.js';
import { schedulerAuditService } from './SchedulerAuditService.js';
import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';
import { officialReleaseIngestionService, SUPPORTED_CANARY_INDICATORS } from './OfficialReleaseIngestionService.js';

class EconomicCalendarRolloutGuardService {
  constructor() {
    this.rollbackState = {
      active: false,
      activatedAt: null,
      reason: null,
      activatedBy: null
    };
  }

  /**
   * Check if Emergency Rollback is currently active
   */
  isEmergencyRollbackActive() {
    return this.rollbackState.active === true;
  }

  /**
   * Trigger in-memory Emergency Rollback
   */
  triggerEmergencyRollback(reason = 'Manual emergency rollback triggered', options = {}) {
    this.rollbackState = {
      active: true,
      activatedAt: new Date().toISOString(),
      reason: String(reason),
      activatedBy: options.user || 'admin-action'
    };

    console.warn(`🚨 [EmergencyRollback] EMERGENCY ROLLBACK ACTIVATED: "${this.rollbackState.reason}" by ${this.rollbackState.activatedBy}. All live database writes to economic_events are BLOCKED.`);

    return this.getRollbackStatus();
  }

  /**
   * Reset / Clear Emergency Rollback
   */
  resetEmergencyRollback() {
    const previous = { ...this.rollbackState };
    this.rollbackState = {
      active: false,
      activatedAt: null,
      reason: null,
      activatedBy: null
    };

    console.log('✅ [EmergencyRollback] Emergency rollback has been reset/cleared.');
    return {
      active: false,
      previous
    };
  }

  /**
   * Get current rollback status
   */
  getRollbackStatus() {
    return {
      active: this.rollbackState.active,
      activatedAt: this.rollbackState.activatedAt,
      reason: this.rollbackState.reason,
      activatedBy: this.rollbackState.activatedBy,
      databaseWritesBlocked: this.rollbackState.active
    };
  }

  /**
   * Metadata describing pre-activation checks
   */
  getPreActivationChecks() {
    return [
      { id: 'health_status', name: 'Scheduler Health Status (not unhealthy)' },
      { id: 'database_health', name: 'Supabase Database Connectivity' },
      { id: 'unresolved_incidents', name: 'No Critical Unresolved Incidents' },
      { id: 'distributed_lock', name: 'Distributed Scheduler Lock Not Stuck' },
      { id: 'freshness_sla', name: 'Scheduler Run Within Freshness SLA' },
      { id: 'live_ingestion_flag', name: 'Live Ingestion Master Switch Enabled' },
      { id: 'canonical_indicator', name: 'Indicator is Supported Canonical' },
      { id: 'canary_whitelist', name: 'Indicator Exists in Canary Whitelist' }
    ];
  }

  /**
   * Validate full rollout readiness
   */
  async validateRolloutReadiness(options = {}) {
    const checks = [];
    const failures = [];
    const warnings = [];

    const indicator = options.indicator || null;
    const overrideHealth = options.overrideHealth;
    const overrideDbStatus = options.overrideDbStatus;
    const overrideIncidents = options.overrideIncidents;
    const overrideLock = options.overrideLock;
    const overrideLatestRun = options.overrideLatestRun;
    const overrideLiveIngestion = options.overrideLiveIngestion !== undefined
      ? options.overrideLiveIngestion
      : (process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED === 'true');
    const overrideCanaryList = options.overrideCanaryList !== undefined
      ? options.overrideCanaryList
      : (process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || '');

    // 1. Emergency Rollback check
    if (this.isEmergencyRollbackActive()) {
      failures.push({
        id: 'emergency_rollback',
        name: 'Emergency Rollback Active',
        reason: `Emergency rollback active: ${this.rollbackState.reason}`
      });
    }

    // 2. Database connectivity
    let dbHealthy = false;
    try {
      if (overrideDbStatus !== undefined) {
        dbHealthy = overrideDbStatus === 'healthy';
      } else {
        const { data, error } = await supabaseEconomicCalendarService.supabase
          .from('economic_events')
          .select('id')
          .limit(1);
        dbHealthy = !error && !!data;
      }
    } catch (e) {
      dbHealthy = false;
    }

    checks.push({
      id: 'database_health',
      name: 'Supabase Database Connectivity',
      passed: dbHealthy
    });
    if (!dbHealthy) {
      failures.push({
        id: 'database_health',
        name: 'Supabase Database Connectivity',
        reason: 'Unable to query public.economic_events table'
      });
    }

    // 3. Subsystem Health
    let health = null;
    try {
      health = overrideHealth || await economicCalendarHealthService.getHealthStatus();
    } catch (e) {
      health = { status: 'unhealthy', error: e.message };
    }

    const healthPassed = health.status !== 'unhealthy';
    checks.push({
      id: 'health_status',
      name: 'Subsystem Health Status',
      passed: healthPassed,
      status: health.status
    });
    if (!healthPassed) {
      failures.push({
        id: 'health_status',
        name: 'Subsystem Health Status',
        reason: `Subsystem health reported "${health.status}"`
      });
    }

    // 4. Critical Unresolved Incidents
    let activeIncidents = [];
    try {
      activeIncidents = overrideIncidents || await economicCalendarIncidentService.getActiveIncidents();
    } catch (e) {
      activeIncidents = [];
    }

    const hasCriticalIncidents = activeIncidents.some(i => i.severity === 'critical' && i.status === 'open');
    checks.push({
      id: 'unresolved_incidents',
      name: 'No Critical Unresolved Incidents',
      passed: !hasCriticalIncidents,
      activeCount: activeIncidents.length
    });
    if (hasCriticalIncidents) {
      failures.push({
        id: 'unresolved_incidents',
        name: 'No Critical Unresolved Incidents',
        reason: `${activeIncidents.filter(i => i.severity === 'critical').length} critical incident(s) currently open`
      });
    }

    // 5. Distributed Lock State
    let lockStatus = null;
    try {
      lockStatus = overrideLock || await schedulerLockService.getLockStatus('economic_calendar_scheduler');
    } catch (e) {
      lockStatus = { isLocked: false };
    }

    const lockOk = !lockStatus.isLocked || lockStatus.lockedBy === 'current-runner';
    checks.push({
      id: 'distributed_lock',
      name: 'Distributed Scheduler Lock Not Stuck',
      passed: lockOk
    });
    if (!lockOk) {
      warnings.push({
        id: 'distributed_lock',
        name: 'Distributed Scheduler Lock Active',
        reason: `Lock held by ${lockStatus.lockedBy}`
      });
    }

    // 6. Freshness SLA
    let latestRun = null;
    try {
      latestRun = overrideLatestRun || await schedulerAuditService.getLatestSuccessfulRun('economic_calendar_scheduler');
    } catch (e) {
      latestRun = null;
    }

    const maxAgeHours = parseFloat(process.env.ECONOMIC_CALENDAR_HEALTH_MAX_AGE_HOURS) || 30;
    let fresh = true;
    if (latestRun && latestRun.started_at) {
      const ageHours = (Date.now() - new Date(latestRun.started_at).getTime()) / (1000 * 3600);
      if (ageHours > maxAgeHours) {
        fresh = false;
      }
    }

    checks.push({
      id: 'freshness_sla',
      name: 'Scheduler Run Within Freshness SLA',
      passed: fresh,
      maxAgeHours
    });
    if (!fresh) {
      failures.push({
        id: 'freshness_sla',
        name: 'Scheduler Run Within Freshness SLA',
        reason: `Latest successful run exceeded SLA (${maxAgeHours} hours)`
      });
    }

    // 7. Live Ingestion Master Switch
    checks.push({
      id: 'live_ingestion_flag',
      name: 'Live Ingestion Master Switch',
      passed: overrideLiveIngestion === true,
      enabled: overrideLiveIngestion === true
    });
    if (!overrideLiveIngestion) {
      failures.push({
        id: 'live_ingestion_flag',
        name: 'Live Ingestion Master Switch',
        reason: 'ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED is not enabled (false)'
      });
    }

    // 8. Indicator-specific checks if indicator provided
    if (indicator) {
      const canonical = officialReleaseIngestionService.getCanonicalIndicatorName(indicator);
      const isCanonical = !!canonical && SUPPORTED_CANARY_INDICATORS.includes(canonical);
      checks.push({
        id: 'canonical_indicator',
        name: `Canonical Indicator Check (${indicator})`,
        passed: isCanonical,
        canonical
      });
      if (!isCanonical) {
        failures.push({
          id: 'canonical_indicator',
          name: `Canonical Indicator Check (${indicator})`,
          reason: `Indicator "${indicator}" is not supported`
        });
      }

      const isWhitelisted = isCanonical && officialReleaseIngestionService.isIndicatorCanaryAllowed(indicator, overrideCanaryList);
      checks.push({
        id: 'canary_whitelist',
        name: `Canary Whitelist Check (${indicator})`,
        passed: isWhitelisted
      });
      if (!isWhitelisted) {
        failures.push({
          id: 'canary_whitelist',
          name: `Canary Whitelist Check (${indicator})`,
          reason: `Indicator "${indicator}" is not in configured canary list "${overrideCanaryList || '(empty)'}"`
        });
      }
    }

    const ready = failures.length === 0;

    return {
      ready,
      checks,
      failures,
      warnings,
      checkedAt: new Date().toISOString()
    };
  }

  /**
   * Determine if specific indicator can be activated
   */
  async canActivateCanary(indicator, options = {}) {
    const readiness = await this.validateRolloutReadiness({ ...options, indicator });
    return {
      canActivate: readiness.ready,
      indicator,
      failures: readiness.failures,
      warnings: readiness.warnings,
      checkedAt: readiness.checkedAt
    };
  }
}

export const economicCalendarRolloutGuardService = new EconomicCalendarRolloutGuardService();
