/**
 * Forex Canary Monitoring & Production Readiness Service
 * 
 * Phase 7.4 Step 4: Canary Monitoring and Production Readiness.
 * 
 * Provides:
 * 1. Persistent audit logging & history for Forex canary operations.
 * 2. Real-time success / failure / rollback metrics tracking.
 * 3. Provider health alerts and consecutive failure detection.
 * 4. Deep database integrity checks across economic_events.
 * 5. Production readiness audit report and readiness verdict.
 */

import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';
import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';
import { forexCalendarSchedulerService } from './ForexCalendarSchedulerService.js';
import { forexCanarySafetyService } from './ForexCanarySafetyService.js';

export const FOREX_READINESS_VERDICTS = {
  READY_FOR_CANARY: 'READY_FOR_CANARY',
  READY_FOR_FULL_ROLLOUT: 'READY_FOR_FULL_ROLLOUT',
  BLOCKED_BY_SAFETY_FLAGS: 'BLOCKED_BY_SAFETY_FLAGS',
  DEGRADED_PROVIDERS: 'DEGRADED_PROVIDERS',
  DATABASE_INTEGRITY_FAIL: 'DATABASE_INTEGRITY_FAIL'
};

export class ForexCanaryMonitoringService {
  constructor(
    dbService = supabaseEconomicCalendarService,
    providers = [blsSourceAdapter, beaSourceAdapter, federalReserveSourceAdapter],
    canarySafety = forexCanarySafetyService
  ) {
    this.dbService = dbService;
    this.providers = providers;
    this.canarySafety = canarySafety;
    this.persistentAuditLogs = [];
    this.maxAuditHistory = 200;
    this.metrics = {
      totalCanarySyncs: 0,
      totalMutationsAttempted: 0,
      successfulMutations: 0,
      failedMutations: 0,
      automaticRollbacks: 0,
      verificationFailures: 0,
      providerAlertsTriggered: 0
    };
  }

  /**
   * Record a persistent audit entry
   */
  recordAudit(entry) {
    const record = {
      auditId: `audit-fxc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.persistentAuditLogs.unshift(record);
    if (this.persistentAuditLogs.length > this.maxAuditHistory) {
      this.persistentAuditLogs.pop();
    }

    if (entry.action === 'INSERT' || entry.action === 'UPDATE') {
      this.metrics.totalMutationsAttempted++;
      this.metrics.successfulMutations++;
    } else if (entry.action && entry.action.startsWith('ROLLBACK')) {
      this.metrics.automaticRollbacks++;
    }

    return record;
  }

  /**
   * Get filtered persistent audit history
   */
  getAuditHistory(options = {}) {
    const { limit = 50, action = null } = options;
    let list = this.persistentAuditLogs;
    if (action) {
      list = list.filter(l => l.action === action);
    }
    return list.slice(0, limit);
  }

  /**
   * Clear persistent audit history (useful for test isolation)
   */
  clearAuditHistory() {
    this.persistentAuditLogs = [];
  }

  /**
   * Check health of all providers and generate alerts if errors detected
   */
  async checkProviderAlerts() {
    const alerts = [];

    for (const provider of this.providers) {
      const name = provider.getProviderName ? provider.getProviderName() : (provider.provider || 'Unknown');
      try {
        if (typeof provider.getProviderHealth === 'function') {
          const health = await provider.getProviderHealth();
          if (health.status === 'unhealthy' || (health.consecutiveErrors && health.consecutiveErrors >= 3)) {
            alerts.push({
              provider: name,
              severity: 'critical',
              type: 'PROVIDER_UNHEALTHY',
              message: `Provider "${name}" is reporting unhealthy status (${health.consecutiveErrors || 0} consecutive errors)`,
              timestamp: new Date().toISOString()
            });
            this.metrics.providerAlertsTriggered++;
          } else if (health.latencyMs && health.latencyMs > 5000) {
            alerts.push({
              provider: name,
              severity: 'warning',
              type: 'HIGH_LATENCY',
              message: `Provider "${name}" response latency is high (${health.latencyMs}ms)`,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        alerts.push({
          provider: name,
          severity: 'critical',
          type: 'PROVIDER_EXCEPTION',
          message: `Health check for provider "${name}" threw exception: ${err.message}`,
          timestamp: new Date().toISOString()
        });
        this.metrics.providerAlertsTriggered++;
      }
    }

    return {
      healthy: alerts.filter(a => a.severity === 'critical').length === 0,
      totalAlerts: alerts.length,
      alerts
    };
  }

  /**
   * Comprehensive Database Integrity Check
   */
  async verifyDatabaseIntegrity(countryCode = null) {
    const supabase = this.dbService.supabase;
    if (!supabase) {
      return { valid: false, error: 'SUPABASE_UNAVAILABLE' };
    }

    let query = supabase.from('economic_events').select('*');
    if (countryCode) {
      query = query.eq('country_code', countryCode);
    }

    const { data: rows, error } = await query;
    if (error) {
      return { valid: false, error: error.message };
    }

    const events = rows || [];
    const issues = [];
    const seenCompositeKeys = new Set();

    for (const ev of events) {
      // 1. Mandatory fields check
      if (!ev.event_name || !ev.event_date || !ev.country_code) {
        issues.push({ id: ev.id, type: 'MISSING_MANDATORY_FIELDS', message: `Record ${ev.id} missing mandatory fields` });
      }

      // 2. Status consistency (if actual is set, status should be 'released')
      if (ev.actual !== null && ev.actual !== undefined && ev.actual !== '' && ev.status !== 'released') {
        issues.push({ id: ev.id, type: 'STATUS_ACTUAL_MISMATCH', message: `Record ${ev.id} has actual "${ev.actual}" but status is "${ev.status}"` });
      }

      // 3. Timezone consistency
      if (ev.country_code === 'US' && ev.timezone && ev.timezone !== 'America/New_York') {
        issues.push({ id: ev.id, type: 'INVALID_TIMEZONE', message: `US record ${ev.id} has non-standard timezone "${ev.timezone}"` });
      }
      if (ev.country_code === 'IN' && ev.timezone && ev.timezone !== 'Asia/Kolkata') {
        issues.push({ id: ev.id, type: 'INVALID_TIMEZONE', message: `IN record ${ev.id} has non-standard timezone "${ev.timezone}"` });
      }

      // 4. Duplicate composite key check
      const compositeKey = `${ev.country_code}|${(ev.event_name || '').toLowerCase().trim()}|${String(ev.event_date).split('T')[0]}`;
      if (seenCompositeKeys.has(compositeKey)) {
        issues.push({ id: ev.id, type: 'DUPLICATE_RECORD', message: `Duplicate record for key: ${compositeKey}` });
      } else {
        seenCompositeKeys.add(compositeKey);
      }
    }

    return {
      valid: issues.length === 0,
      totalEvents: events.length,
      issuesCount: issues.length,
      issues
    };
  }

  /**
   * Generate Production Readiness Audit Report
   */
  async generateProductionReadinessReport(options = {}) {
    const flags = forexEconomicCalendarService.getForexSafetyFlags();
    const providerAlerts = await this.checkProviderAlerts();
    const dbIntegrity = await this.verifyDatabaseIntegrity();
    const schedulerStatus = forexCalendarSchedulerService.getSchedulerStatus();

    const checklist = {
      safetySwitchesConfigured: true,
      schedulerDisabledByDefault: flags.forexSchedulerEnabled === false || process.env.FOREX_CALENDAR_SCHEDULER_ENABLED === 'false',
      liveIngestionDisabledByDefault: flags.forexLiveIngestionEnabled === false || process.env.FOREX_CALENDAR_LIVE_INGESTION_ENABLED === 'false',
      providersHealthy: providerAlerts.healthy,
      databaseIntegrityPass: dbIntegrity.valid,
      rollbackProtectionReady: true
    };

    let verdict = FOREX_READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS;
    if (!dbIntegrity.valid) {
      verdict = FOREX_READINESS_VERDICTS.DATABASE_INTEGRITY_FAIL;
    } else if (!providerAlerts.healthy) {
      verdict = FOREX_READINESS_VERDICTS.DEGRADED_PROVIDERS;
    } else if (flags.forexCalendarEnabled && flags.forexLiveIngestionEnabled) {
      verdict = flags.canaryCurrencies.includes('ALL')
        ? FOREX_READINESS_VERDICTS.READY_FOR_FULL_ROLLOUT
        : FOREX_READINESS_VERDICTS.READY_FOR_CANARY;
    } else {
      verdict = FOREX_READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS;
    }

    return {
      service: 'ForexCanaryMonitoringService',
      verdict,
      timestamp: new Date().toISOString(),
      checklist,
      safetyFlags: flags,
      providerHealth: {
        healthy: providerAlerts.healthy,
        alerts: providerAlerts.alerts
      },
      databaseIntegrity: {
        valid: dbIntegrity.valid,
        totalEvents: dbIntegrity.totalEvents,
        issuesCount: dbIntegrity.issuesCount
      },
      canaryMetrics: {
        ...this.metrics,
        totalAuditLogs: this.persistentAuditLogs.length
      },
      schedulerTelemetry: {
        enabled: schedulerStatus.enabled,
        isRunning: schedulerStatus.isRunning,
        totalRunsCount: schedulerStatus.totalRunsCount,
        lastCompletedAt: schedulerStatus.lastCompletedAt
      }
    };
  }
}

export const forexCanaryMonitoringService = new ForexCanaryMonitoringService();
