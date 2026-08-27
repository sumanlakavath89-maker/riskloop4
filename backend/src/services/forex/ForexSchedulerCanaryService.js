/**
 * Forex Scheduler Canary Service
 * 
 * Phase 7.5 Step 1: Controlled Scheduler Canary.
 * 
 * Orchestrates scheduled live USD canary ingestion under strict multi-flag safety switches:
 * 1. Multi-Flag Gate: Requires FOREX_CALENDAR_ENABLED, FOREX_CALENDAR_SCHEDULER_ENABLED,
 *    FOREX_CALENDAR_LIVE_INGESTION_ENABLED, and FOREX_CALENDAR_CANARY_CURRENCIES='USD'.
 * 2. Pre-Cycle Readiness Gate: Validates database integrity and provider health before any write.
 * 3. Controlled Small Batch: Enforces max 5 events per scheduled cycle.
 * 4. Strict Concurrency Lock: Prevents overlapping scheduled runs.
 * 5. Immediate Post-Write Verification & Automatic Rollback.
 * 6. Automatic Circuit Breaker: Halts further runs if 3 consecutive failures occur.
 * 7. Comprehensive Audit Logging for every scheduled cycle.
 */

import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';
import { forexCanarySafetyService } from './ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from './ForexCanaryMonitoringService.js';

export const FOREX_SCHEDULER_CANARY_CONFIG = {
  DEFAULT_INTERVAL_MINUTES: 60,
  MIN_INTERVAL_MINUTES: 15,
  MAX_BATCH_SIZE: 5,
  CONSECUTIVE_FAILURE_THRESHOLD: 3
};

export class ForexSchedulerCanaryService {
  constructor(
    canarySafety = forexCanarySafetyService,
    monitoringService = forexCanaryMonitoringService
  ) {
    this.canarySafety = canarySafety;
    this.monitoringService = monitoringService;
    this.isRunning = false;
    this.intervalTimer = null;
    this.consecutiveFailures = 0;
    this.circuitBreakerTripped = false;
    this.lastCycleAt = null;
    this.lastCompletedAt = null;
    this.lastDurationMs = null;
    this.lastCycleSummary = null;
    this.totalCyclesExecuted = 0;
  }

  /**
   * Evaluate whether scheduled USD canary live ingestion is authorized
   * 
   * @param {Object} [overrideFlags]
   * @returns {{ authorized: boolean, mode: string, reason: string }}
   */
  isCanaryExecutionAuthorized(overrideFlags = null) {
    const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();

    const schedulerFlag = overrideFlags?.forexSchedulerEnabled !== undefined
      ? Boolean(overrideFlags.forexSchedulerEnabled)
      : (process.env.FOREX_CALENDAR_SCHEDULER_ENABLED === 'true');

    if (!flags.forexCalendarEnabled) {
      return {
        authorized: false,
        mode: 'disabled',
        reason: 'FOREX_CALENDAR_ENABLED is false'
      };
    }

    if (!schedulerFlag) {
      return {
        authorized: false,
        mode: 'scheduler_disabled',
        reason: 'FOREX_CALENDAR_SCHEDULER_ENABLED is false'
      };
    }

    if (!flags.forexLiveIngestionEnabled) {
      return {
        authorized: false,
        mode: 'discovery_only',
        reason: 'FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false (Dry-run mode only)'
      };
    }

    const canaryList = flags.canaryCurrencies || [];
    if (canaryList.length === 0) {
      return {
        authorized: false,
        mode: 'safe_blocked',
        reason: 'FOREX_CALENDAR_CANARY_CURRENCIES is empty (Safe block active)'
      };
    }

    if (!canaryList.includes('ALL') && !canaryList.includes('USD')) {
      return {
        authorized: false,
        mode: 'canary_filtered',
        reason: `Currency "USD" is not in configured canary list [${canaryList.join(', ')}]`
      };
    }

    return {
      authorized: true,
      mode: 'scheduled_canary_active',
      reason: 'Scheduled USD canary execution authorized across all safety flags'
    };
  }

  /**
   * Reset the consecutive failure circuit breaker
   */
  resetCircuitBreaker() {
    this.consecutiveFailures = 0;
    this.circuitBreakerTripped = false;
    return { success: true, circuitBreakerTripped: false };
  }

  /**
   * Record a failure incrementing consecutive failure count and checking threshold
   */
  recordFailure(reason = 'Failure recorded') {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= FOREX_SCHEDULER_CANARY_CONFIG.CONSECUTIVE_FAILURE_THRESHOLD) {
      this.circuitBreakerTripped = true;
    }
    return {
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerTripped: this.circuitBreakerTripped
    };
  }

  /**
   * Execute a controlled scheduler canary cycle
   * 
   * @param {Object} [options]
   * @param {boolean} [options.force=false]
   * @param {boolean} [options.dryRun]
   * @param {number} [options.batchSize=5]
   * @param {Object} [options.overrideFlags]
   * @returns {Promise<Object>}
   */
  async runCanaryCycle(options = {}) {
    const startTime = Date.now();
    const flags = options.overrideFlags || null;
    const gate = this.isCanaryExecutionAuthorized(flags);
    const isDryRun = options.dryRun !== undefined ? options.dryRun : !gate.authorized;

    // 1. Circuit breaker check (if tripped, halted regardless of environment flags)
    if (this.circuitBreakerTripped && !options.force) {
      return {
        success: false,
        skipped: true,
        reason: 'CIRCUIT_BREAKER_TRIPPED',
        message: `Forex scheduler canary halted: tripped after ${this.consecutiveFailures} consecutive failures`,
        databaseMutation: false
      };
    }

    // 2. Authorization check
    if (!gate.authorized && !options.force) {
      return {
        success: false,
        skipped: true,
        reason: gate.reason,
        mode: gate.mode,
        databaseMutation: false
      };
    }

    // 3. Concurrency lock
    if (this.isRunning) {
      return {
        success: false,
        skipped: true,
        reason: 'CONCURRENT_RUN_IN_PROGRESS',
        message: 'A Forex scheduler canary cycle is already in progress. Overlapping cycle skipped.',
        databaseMutation: false
      };
    }

    this.isRunning = true;
    this.lastCycleAt = new Date().toISOString();

    try {
      // 4. Pre-cycle production readiness and database integrity gate
      const dbIntegrity = await this.monitoringService.verifyDatabaseIntegrity();
      if (!dbIntegrity.valid) {
        throw new Error(`Pre-cycle database integrity failed: ${dbIntegrity.issuesCount} anomalies found`);
      }

      const providerHealth = await this.monitoringService.checkProviderAlerts();
      if (!providerHealth.healthy) {
        throw new Error(`Pre-cycle provider health check failed: ${providerHealth.alerts[0]?.message}`);
      }

      // 5. Execute controlled USD canary sync (with post-write validation & rollback)
      const canaryResult = await this.canarySafety.executeCanarySync({
        batchSize: options.batchSize || FOREX_SCHEDULER_CANARY_CONFIG.MAX_BATCH_SIZE,
        overrideFlags: flags || {
          forexCalendarEnabled: true,
          forexSchedulerEnabled: true,
          forexLiveIngestionEnabled: !isDryRun,
          canaryCurrencies: ['USD']
        },
        dryRun: isDryRun,
        events: options.events
      });

      if (!canaryResult.success) {
        throw new Error(`Canary sync encountered errors or rollbacks (errors: ${canaryResult.summary?.errors}, rolledBack: ${canaryResult.summary?.rolledBack})`);
      }

      // Success
      this.consecutiveFailures = 0;
      this.lastCompletedAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;
      this.totalCyclesExecuted++;

      const summary = {
        cycleId: `fsc-${Date.now()}`,
        status: 'completed',
        dryRun: isDryRun,
        databaseMutation: canaryResult.databaseMutation,
        batchLimit: canaryResult.batchLimit,
        inserted: canaryResult.summary?.inserted || 0,
        updated: canaryResult.summary?.updated || 0,
        skipped: canaryResult.summary?.skipped || 0,
        rolledBack: canaryResult.summary?.rolledBack || 0,
        durationMs: this.lastDurationMs,
        completedAt: this.lastCompletedAt
      };

      this.lastCycleSummary = summary;

      this.monitoringService.recordAudit({
        action: 'SCHEDULER_CANARY_CYCLE_SUCCESS',
        cycleId: summary.cycleId,
        dryRun: isDryRun,
        summary
      });

      return {
        success: true,
        service: 'ForexSchedulerCanaryService',
        mode: isDryRun ? 'dry_run' : 'live_canary',
        databaseMutation: canaryResult.databaseMutation,
        summary,
        canaryResult
      };
    } catch (err) {
      this.consecutiveFailures++;
      this.lastCompletedAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;

      if (this.consecutiveFailures >= FOREX_SCHEDULER_CANARY_CONFIG.CONSECUTIVE_FAILURE_THRESHOLD) {
        this.circuitBreakerTripped = true;
        console.error(`🚨 [ForexSchedulerCanary] Circuit breaker TRIPPED after ${this.consecutiveFailures} consecutive failures! Further cycles halted.`);
      }

      this.monitoringService.recordAudit({
        action: 'SCHEDULER_CANARY_CYCLE_FAILURE',
        error: err.message,
        consecutiveFailures: this.consecutiveFailures,
        circuitBreakerTripped: this.circuitBreakerTripped
      });

      return {
        success: false,
        service: 'ForexSchedulerCanaryService',
        error: err.message,
        consecutiveFailures: this.consecutiveFailures,
        circuitBreakerTripped: this.circuitBreakerTripped,
        databaseMutation: false,
        durationMs: this.lastDurationMs
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start recurring background interval schedule
   */
  startCanarySchedule(intervalMinutes = 60) {
    this.stopCanarySchedule();
    const intervalMs = Math.max(intervalMinutes, FOREX_SCHEDULER_CANARY_CONFIG.MIN_INTERVAL_MINUTES) * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      this.runCanaryCycle().catch(err => {
        console.error('⚠️ [ForexSchedulerCanary] Background cycle error:', err.message);
      });
    }, intervalMs);
  }

  /**
   * Stop recurring background interval schedule
   */
  stopCanarySchedule() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Return status telemetry
   */
  getStatus() {
    return {
      service: 'ForexSchedulerCanaryService',
      isRunning: this.isRunning,
      circuitBreakerTripped: this.circuitBreakerTripped,
      consecutiveFailures: this.consecutiveFailures,
      totalCyclesExecuted: this.totalCyclesExecuted,
      lastCycleAt: this.lastCycleAt,
      lastCompletedAt: this.lastCompletedAt,
      lastDurationMs: this.lastDurationMs,
      lastCycleSummary: this.lastCycleSummary
    };
  }
}

export const forexSchedulerCanaryService = new ForexSchedulerCanaryService();
