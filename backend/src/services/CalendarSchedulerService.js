/**
 * Calendar Scheduler Service
 * 
 * Orchestrates:
 * 1. Daily Indian economic calendar synchronization (2:00 AM IST).
 * 2. Startup catch-up check: queries today's scheduled upcoming events and activates release poller.
 * 3. Windowed release polling execution for today's active releases.
 * 4. Strict concurrency locking (prevents duplicate simultaneous scheduler executions).
 * 5. Feature-flag safety: Disabled by default (ECONOMIC_CALENDAR_SCHEDULER_ENABLED=false).
 */

import { supabaseEconomicCalendarService } from './SupabaseEconomicCalendarService.js';
import { officialSourcePollerService } from './OfficialSourcePollerService.js';
import { schedulerLockService } from './SchedulerLockService.js';
import { schedulerAuditService } from './SchedulerAuditService.js';

class CalendarSchedulerService {
  constructor() {
    this.isEnabled = process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED === 'true';
    this.isLocked = false;
    this.dailyIntervalTimer = null;
    this.activeCheckTimer = null;
    this.lastRun = null;
    this.lastRunSummary = null;
    this.isInitialized = false;
  }

  /**
   * Helper: Get current date & time string in Asia/Kolkata timezone
   */
  getKolkataCurrentTime() {
    const now = new Date();
    // YYYY-MM-DD
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    // HH:MM:SS
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    return {
      date: dateStr,
      time: timeStr,
      iso: now.toISOString(),
      timestamp: now.getTime()
    };
  }

  /**
   * Initialize the scheduler on backend startup
   */
  async init() {
    if (this.isInitialized) {
      return this.getStatus();
    }

    this.isInitialized = true;
    console.log(`🕒 [CalendarSchedulerService] Initialized (Enabled: ${this.isEnabled})`);

    // Run startup catch-up check
    try {
      await this.runStartupCatchUp();
    } catch (e) {
      console.warn(`⚠️ [CalendarSchedulerService] Startup catch-up encountered warning: ${e.message}`);
    }

    // Start background timers only if explicitly enabled
    if (this.isEnabled) {
      this.startBackgroundSchedule();
    } else {
      console.log('ℹ️ [CalendarSchedulerService] Automatic background timers are disabled (ECONOMIC_CALENDAR_SCHEDULER_ENABLED=false). Manual execution is available via /api/dev endpoints.');
    }

    return this.getStatus();
  }

  /**
   * Startup Recovery / Catch-up:
   * Inspects today's scheduled upcoming events in Supabase.
   * If an event's scheduled release time has arrived/passed, activates catch-up polling.
   */
  async runStartupCatchUp(options = {}) {
    const { dryRun = false } = options;
    const kolkata = this.getKolkataCurrentTime();
    console.log(`🔍 [CalendarSchedulerService] Running startup catch-up check for date ${kolkata.date} (${kolkata.time} IST)...`);

    if (!supabaseEconomicCalendarService.supabase) {
      console.warn('⚠️ [CalendarSchedulerService] Supabase not connected; skipping startup catch-up.');
      return { skipped: true, reason: 'SUPABASE_UNAVAILABLE' };
    }

    // Query events for today
    const { data: todayEvents, error } = await supabaseEconomicCalendarService.supabase
      .from('economic_events')
      .select('*')
      .eq('country_code', 'IN')
      .eq('event_date', kolkata.date);

    if (error) {
      console.warn('⚠️ [CalendarSchedulerService] Error checking today\'s events:', error.message);
      return { error: error.message };
    }

    const upcomingToday = (todayEvents || []).filter(e => e.status === 'upcoming');
    console.log(`📋 [CalendarSchedulerService] Found ${upcomingToday.length} upcoming event(s) scheduled for today (${kolkata.date}).`);

    const triggeredJobs = [];

    for (const ev of upcomingToday) {
      const scheduledTime = ev.event_time || '17:30:00';
      const isPastOrDue = kolkata.time >= scheduledTime;

      if (isPastOrDue) {
        console.log(`⚡ [CalendarSchedulerService] Event ${ev.event_name} scheduled time (${scheduledTime} IST) is due or passed. Triggering poller catch-up.`);
        const pollResult = await officialSourcePollerService.pollForEvent(ev, {
          maxAttempts: 3,
          intervalMs: 15000,
          dryRun
        });
        triggeredJobs.push({ eventId: ev.id, eventName: ev.event_name, result: pollResult });
      } else {
        console.log(`⏳ [CalendarSchedulerService] Event ${ev.event_name} scheduled for later today at ${scheduledTime} IST.`);
      }
    }

    return {
      success: true,
      kolkataTime: kolkata,
      todayEventsCount: (todayEvents || []).length,
      upcomingCount: upcomingToday.length,
      triggeredJobs
    };
  }

  /**
   * Execute one complete scheduler cycle:
   * 1. Acquires in-process mutex lock.
   * 2. Acquires Supabase distributed lock (economic_calendar_scheduler, 300s TTL).
   * 3. Creates persistent audit log in scheduler_runs.
   * 4. Syncs 90-day official calendar into Supabase.
   * 5. Checks today's events and triggers release poller if due.
   * 6. Updates audit log (status: 'completed' / 'failed').
   * 7. Releases locks cleanly.
   */
  async runSchedulerCycle(options = {}) {
    const { dryRun = false, isManual = true } = options;

    // 1. In-process mutex lock
    if (this.isLocked) {
      console.warn('⚠️ [CalendarSchedulerService] Scheduler cycle is already running. Execution locked.');
      return {
        success: false,
        error: 'LOCKED',
        message: 'A scheduler execution cycle is currently in progress on this process.',
        lastRun: this.lastRun
      };
    }

    this.isLocked = true;

    // 2. Distributed Supabase lock (Multi-instance safety)
    const lockResult = await schedulerLockService.acquireLock('economic_calendar_scheduler', undefined, 300);
    if (!lockResult.success) {
      console.warn('⚠️ [CalendarSchedulerService] Distributed lock is currently held by another server instance. Execution blocked.');
      this.isLocked = false;
      return {
        success: false,
        error: 'DISTRIBUTED_LOCKED',
        message: 'Another server instance currently holds the distributed scheduler lock.',
        lockDetails: lockResult,
        lastRun: this.lastRun
      };
    }

    // 3. Create persistent audit record (Failure must not crash scheduler)
    let auditRun = null;
    try {
      auditRun = await schedulerAuditService.startRun({
        schedulerName: 'economic_calendar_scheduler',
        instanceId: schedulerLockService.instanceId,
        metadata: { dryRun, isManual }
      });
    } catch (auditErr) {
      console.warn('⚠️ [CalendarSchedulerService] Warning starting audit record:', auditErr.message);
    }

    const startTime = new Date();
    const kolkata = this.getKolkataCurrentTime();

    console.log(`\n🚀 [CalendarSchedulerService] Starting scheduler cycle at ${kolkata.date} ${kolkata.time} IST (DryRun: ${dryRun}, Manual: ${isManual})...`);

    const cycleSummary = {
      startedAt: startTime.toISOString(),
      kolkataTime: `${kolkata.date} ${kolkata.time} IST`,
      dryRun,
      isManual,
      syncResult: null,
      catchUpResult: null,
      activePollingJobs: []
    };

    try {
      // 1. Synchronize 90-day Indian calendar
      if (!dryRun) {
        cycleSummary.syncResult = await supabaseEconomicCalendarService.syncUpcomingIndiaEvents(90);
      } else {
        cycleSummary.syncResult = { dryRun: true, message: 'Simulated 90-day sync without database mutation' };
      }

      // 2. Perform catch-up on today's releases
      cycleSummary.catchUpResult = await this.runStartupCatchUp({ dryRun });

      // 3. Capture active polling jobs
      cycleSummary.activePollingJobs = officialSourcePollerService.getActiveJobs();

      this.lastRun = new Date().toISOString();
      this.lastRunSummary = cycleSummary;

      // 4. Update audit log on success
      if (auditRun?.id) {
        try {
          const eventsChecked = (cycleSummary.syncResult?.summary?.totalGenerated || 0) + (cycleSummary.catchUpResult?.todayEventsCount || 0);
          const eventsReleased = (cycleSummary.catchUpResult?.triggeredJobs || []).filter(j => j.result?.status === 'completed').length;

          await schedulerAuditService.completeRun(auditRun.id, {
            eventsChecked,
            eventsReleased,
            metadata: {
              dryRun,
              isManual,
              durationMs: Date.now() - startTime.getTime(),
              syncSummary: cycleSummary.syncResult,
              catchUpSummary: cycleSummary.catchUpResult
            }
          });
        } catch (auditCompErr) {
          console.warn('⚠️ [CalendarSchedulerService] Warning completing audit log:', auditCompErr.message);
        }
      }

      console.log(`✅ [CalendarSchedulerService] Completed scheduler cycle in ${Date.now() - startTime.getTime()}ms.\n`);
      return {
        success: true,
        summary: cycleSummary
      };
    } catch (err) {
      console.error('❌ [CalendarSchedulerService] Scheduler cycle error:', err);

      // Update audit log on failure
      if (auditRun?.id) {
        try {
          await schedulerAuditService.failRun(auditRun.id, err, {
            metadata: { dryRun, isManual, durationMs: Date.now() - startTime.getTime() }
          });
        } catch (auditFailErr) {
          console.warn('⚠️ [CalendarSchedulerService] Warning recording failure in audit log:', auditFailErr.message);
        }
      }

      return {
        success: false,
        error: err.message,
        summary: cycleSummary
      };
    } finally {
      // Always release distributed lock and in-process mutex
      try {
        await schedulerLockService.releaseLock('economic_calendar_scheduler');
      } catch (relErr) {
        console.warn('⚠️ [CalendarSchedulerService] Error releasing distributed lock:', relErr.message);
      }
      this.isLocked = false;
    }
  }

  /**
   * Start recurring background schedule timers (Runs every 1 hour to check for due 2:00 AM sync or window polling)
   */
  startBackgroundSchedule() {
    if (this.activeCheckTimer) {
      clearInterval(this.activeCheckTimer);
    }

    // Check hourly for 2:00 AM IST daily sync or release windows
    this.activeCheckTimer = setInterval(async () => {
      const kolkata = this.getKolkataCurrentTime();
      const hour = parseInt(kolkata.time.split(':')[0], 10);

      // Daily sync at 2:00 AM IST
      if (hour === 2) {
        console.log('⏰ [CalendarSchedulerService] 2:00 AM IST cron trigger: executing daily calendar sync.');
        await this.runSchedulerCycle({ dryRun: false, isManual: false });
      } else {
        // Window check
        await this.runStartupCatchUp({ dryRun: false });
      }
    }, 60 * 60 * 1000); // 1 hour interval

    console.log('⏱️ [CalendarSchedulerService] Background schedule timers started.');
  }

  /**
   * Stop background schedule timers
   */
  stop() {
    if (this.activeCheckTimer) {
      clearInterval(this.activeCheckTimer);
      this.activeCheckTimer = null;
    }
    officialSourcePollerService.stopAll();
    console.log('🛑 [CalendarSchedulerService] Background schedule timers stopped.');
  }

  /**
   * Get current scheduler status
   */
  getStatus() {
    const kolkata = this.getKolkataCurrentTime();
    return {
      enabled: this.isEnabled,
      initialized: this.isInitialized,
      isLocked: this.isLocked,
      kolkataTime: `${kolkata.date} ${kolkata.time} IST`,
      lastRun: this.lastRun,
      lastRunSummary: this.lastRunSummary,
      activePollingJobs: officialSourcePollerService.getActiveJobs()
    };
  }
}

export const calendarSchedulerService = new CalendarSchedulerService();
