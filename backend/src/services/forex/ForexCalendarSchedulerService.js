/**
 * Forex Calendar Scheduler Service
 * 
 * Phase 7.4 Step 1: Forex Economic Calendar Scheduler in Dry-Run Mode.
 * 
 * Periodically discovers upcoming USD macroeconomic events across official providers
 * (BLS, BEA, Federal Reserve), normalizes/validates them, and processes them
 * via ForexDatabaseSyncService in dry-run mode.
 * 
 * Safety & Reliability:
 * 1. Safe scheduling switches: FOREX_CALENDAR_ENABLED and FOREX_CALENDAR_SCHEDULER_ENABLED.
 * 2. Strict concurrency control: Prevents overlapping executions.
 * 3. Bounded fault tolerance: Isolated provider failure handling without crashing scheduler.
 * 4. Zero database writes: Defaults to dry-run mode (databaseMutation: false).
 * 5. Telemetry & observability: Tracks last run, duration, errors, and cycle summaries.
 */

import { unifiedForexDiscoveryService } from './UnifiedForexDiscoveryService.js';
import { forexDatabaseSyncService } from './ForexDatabaseSyncService.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';

export class ForexCalendarSchedulerService {
  constructor(
    discoveryService = unifiedForexDiscoveryService,
    syncService = forexDatabaseSyncService
  ) {
    this.discoveryService = discoveryService;
    this.syncService = syncService;
    this.isRunning = false;
    this.intervalTimer = null;
    this.lastRunAt = null;
    this.lastCompletedAt = null;
    this.lastDurationMs = null;
    this.lastError = null;
    this.consecutiveFailures = 0;
    this.totalRunsCount = 0;
    this.lastCycleSummary = null;
    this.isInitialized = false;
  }

  /**
   * Determine whether the Forex scheduler is enabled in environment or options
   * 
   * @param {Object} [overrideFlags]
   * @returns {boolean}
   */
  isSchedulerEnabled(overrideFlags = null) {
    if (overrideFlags && overrideFlags.forexSchedulerEnabled !== undefined) {
      return Boolean(overrideFlags.forexSchedulerEnabled);
    }
    const calendarEnabled = process.env.FOREX_CALENDAR_ENABLED === 'true';
    const schedulerEnabled = process.env.FOREX_CALENDAR_SCHEDULER_ENABLED === 'true';
    return calendarEnabled && schedulerEnabled;
  }

  /**
   * Initialize Forex scheduler
   */
  async init(options = {}) {
    if (this.isInitialized) {
      return this.getSchedulerStatus();
    }
    this.isInitialized = true;
    const enabled = this.isSchedulerEnabled(options.overrideFlags);

    if (enabled) {
      this.startBackgroundScheduler(options.intervalMinutes || 60);
    }

    return this.getSchedulerStatus();
  }

  /**
   * Execute a single scheduler cycle
   * 
   * @param {Object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {boolean} [options.force=false]
   * @param {number} [options.daysAhead=90]
   * @param {Object} [options.overrideFlags]
   * @returns {Promise<Object>} Cycle execution summary
   */
  async runSchedulerCycle(options = {}) {
    const startTime = Date.now();
    const enabled = this.isSchedulerEnabled(options.overrideFlags);
    const isDryRun = options.dryRun !== undefined ? options.dryRun : true;

    // Check enablement unless forced
    if (!enabled && !options.force) {
      return {
        success: false,
        skipped: true,
        reason: 'FOREX_SCHEDULER_DISABLED',
        message: 'Forex calendar scheduler is disabled (FOREX_CALENDAR_SCHEDULER_ENABLED=false)',
        databaseMutation: false
      };
    }

    // Overlap prevention (Concurrency lock)
    if (this.isRunning) {
      return {
        success: false,
        skipped: true,
        reason: 'CONCURRENT_RUN_IN_PROGRESS',
        message: 'A Forex scheduler cycle is already in progress. Overlapping run skipped.',
        databaseMutation: false
      };
    }

    this.isRunning = true;
    this.lastRunAt = new Date().toISOString();

    try {
      // Step 1: Run multi-provider unified discovery
      const discoveryReport = await this.discoveryService.discoverAllForexEvents({
        daysAhead: options.daysAhead || 90
      });

      const discoveredEvents = discoveryReport.events || [];

      // Step 2: Pass discovered events to safe sync service in dry-run mode
      const syncResult = await this.syncService.syncForexEvents({
        dryRun: isDryRun,
        preLoadedEvents: discoveredEvents,
        overrideFlags: options.overrideFlags
      });

      this.lastCompletedAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.totalRunsCount++;

      const totalDiscovered = discoveryReport.summary?.totalDiscovered || 0;
      const totalValidated = discoveryReport.summary?.totalValidated || 0;
      const totalRejected = discoveryReport.summary?.totalRejected || 0;
      const totalUnique = discoveryReport.summary?.totalUnique || 0;
      const duplicatesDetected = Math.max(0, totalValidated - totalUnique);

      const summary = {
        cycleId: `forex-cycle-${Date.now()}`,
        status: 'completed',
        dryRun: syncResult.dryRun,
        databaseMutation: syncResult.databaseMutation,
        totalDiscovered,
        totalValidated,
        totalRejected,
        duplicatesDetected,
        totalUnique,
        plannedInserts: syncResult.summary?.inserted || 0,
        plannedUpdates: syncResult.summary?.updated || 0,
        skipped: syncResult.summary?.skipped || 0,
        providers: discoveryReport.providers,
        durationMs: this.lastDurationMs,
        completedAt: this.lastCompletedAt
      };

      this.lastCycleSummary = summary;

      return {
        success: true,
        service: 'ForexCalendarSchedulerService',
        mode: isDryRun ? 'dry_run' : 'live',
        databaseMutation: syncResult.databaseMutation,
        summary,
        diagnostics: discoveryReport.diagnostics || []
      };
    } catch (err) {
      this.lastError = err.message;
      this.lastCompletedAt = new Date().toISOString();
      this.lastDurationMs = Date.now() - startTime;
      this.consecutiveFailures++;

      console.error('❌ [ForexCalendarSchedulerService] Cycle failed:', err.message);

      return {
        success: false,
        service: 'ForexCalendarSchedulerService',
        error: err.message,
        databaseMutation: false,
        durationMs: this.lastDurationMs,
        consecutiveFailures: this.consecutiveFailures
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Trigger an on-demand manual dry-run cycle
   */
  async triggerManualRun(options = {}) {
    return this.runSchedulerCycle({
      ...options,
      force: true,
      dryRun: options.dryRun !== undefined ? options.dryRun : true
    });
  }

  /**
   * Production Forex Dry-Run Validation (Phase 7.4 Step 2)
   * Executes official discovery & synchronization in strictly dry-run mode
   * with zero database mutations guaranteed.
   */
  async validateProductionDryRun(options = {}) {
    return this.runSchedulerCycle({
      ...options,
      force: true,
      dryRun: true
    });
  }

  /**
   * Start recurring background interval timer
   */
  startBackgroundScheduler(intervalMinutes = 60) {
    this.stopBackgroundScheduler();
    const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      this.runSchedulerCycle({ dryRun: true }).catch(err => {
        console.error('⚠️ [ForexScheduler] Background cycle error:', err.message);
      });
    }, intervalMs);
  }

  /**
   * Stop background interval timer
   */
  stopBackgroundScheduler() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Sanitize and return scheduler telemetry & status
   */
  getSchedulerStatus() {
    const flags = forexEconomicCalendarService.getForexSafetyFlags();
    const enabled = this.isSchedulerEnabled();

    return {
      service: 'ForexCalendarSchedulerService',
      enabled,
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      forexCalendarEnabled: flags.forexCalendarEnabled,
      forexLiveIngestionEnabled: flags.forexLiveIngestionEnabled,
      schedulerProductionFlag: process.env.FOREX_CALENDAR_SCHEDULER_ENABLED === 'true',
      lastRunAt: this.lastRunAt,
      lastCompletedAt: this.lastCompletedAt,
      lastDurationMs: this.lastDurationMs,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      totalRunsCount: this.totalRunsCount,
      lastCycleSummary: this.lastCycleSummary
    };
  }
}

export const forexCalendarSchedulerService = new ForexCalendarSchedulerService();
