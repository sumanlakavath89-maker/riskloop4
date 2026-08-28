/**
 * Official Source Poller Service
 * 
 * Manages targeted, windowed polling of approved official government feeds during
 * scheduled macroeconomic release windows:
 *   - Discovers new releases via OfficialSourceDiscoveryService (RSS/XML item parser & article crawler).
 *   - Polls only when an event release window is active (based on event_date & event_time).
 *   - Polling stops immediately upon successful release ingestion or when max attempts are reached.
 *   - Deduplicates active polling jobs in-memory.
 *   - Gracefully handles source timeouts and delayed releases without crashing or mutating production data.
 */

import { officialSourceDiscoveryService, OFFICIAL_DISCOVERY_FEEDS } from './OfficialSourceDiscoveryService.js';
import { officialReleaseIngestionService } from './OfficialReleaseIngestionService.js';

class OfficialSourcePollerService {
  constructor() {
    this.activePollingJobs = new Map(); // Map<eventId, { eventName, eventDate, attempts, maxAttempts, status, startTime, timer }>
  }

  /**
   * Get active polling jobs summary
   */
  getActiveJobs() {
    const jobs = [];
    for (const [eventId, job] of this.activePollingJobs.entries()) {
      jobs.push({
        eventId,
        eventName: job.eventName,
        eventDate: job.eventDate,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        status: job.status,
        startedAt: job.startTime
      });
    }
    return jobs;
  }

  /**
   * Poll for a specific scheduled event during its release window
   * 
   * @param {Object} event Supabase economic_events row
   * @param {Object} [options]
   * @param {number} [options.maxAttempts=6]
   * @param {number} [options.intervalMs=30000]
   * @param {boolean} [options.dryRun=false]
   * @param {Object} [options.discoveryOptions]
   */
  async pollForEvent(event, options = {}) {
    if (!event || !event.id) {
      return { success: false, error: 'INVALID_EVENT', message: 'Event object with id is required' };
    }

    // Prevent duplicate polling job for the same event
    if (this.activePollingJobs.has(event.id)) {
      const existing = this.activePollingJobs.get(event.id);
      return {
        success: true,
        alreadyActive: true,
        message: `Polling job for ${event.event_name} (${event.event_date}) is already active.`,
        job: { eventId: event.id, attempts: existing.attempts, status: existing.status }
      };
    }

    const {
      maxAttempts = 6,
      intervalMs = 30000,
      dryRun = false,
      discoveryOptions = {}
    } = options;

    const jobRecord = {
      eventId: event.id,
      eventName: event.event_name,
      eventDate: event.event_date,
      attempts: 0,
      maxAttempts,
      status: 'polling',
      startTime: new Date().toISOString(),
      dryRun
    };

    this.activePollingJobs.set(event.id, jobRecord);
    console.log(`📡 [OfficialSourcePoller] Activated automated discovery poller for ${event.event_name} (${event.event_date}) [Max attempts: ${maxAttempts}]`);

    // Single attempt executor
    const executeAttempt = async () => {
      jobRecord.attempts++;

      try {
        // Run Real Official Discovery Pipeline
        const discoveryResult = await officialSourceDiscoveryService.discoverAndExtractRelease(
          event,
          discoveryOptions
        );

        const hasActual = discoveryResult.found && discoveryResult.extractedMetric && 
          discoveryResult.extractedMetric.actual !== undefined && 
          discoveryResult.extractedMetric.actual !== null && 
          discoveryResult.extractedMetric.actual !== '' &&
          discoveryResult.extractedMetric.actual !== '—';

        if (hasActual) {
          const metric = discoveryResult.extractedMetric;
          const candidate = discoveryResult.candidate;

          console.log(`🎯 [OfficialSourcePoller] Discovered matching official release: "${candidate.title}" (Actual = ${metric.actual}%)`);

          // Update Supabase record
          const updateRes = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
            {
              eventName: event.event_name,
              actual: metric.actual,
              previous: metric.previous,
              forecast: metric.forecast,
              unit: metric.unit,
              sourceUrl: candidate.sourceUrl,
              source: event.source,
              releaseDate: event.event_date
            },
            { dryRun, targetRow: event }
          );

          if (updateRes.matched) {
            console.log(`✅ [OfficialSourcePoller] Successfully processed & released ${event.event_name} on attempt ${jobRecord.attempts}. Stopping poller.`);
            jobRecord.status = 'completed';
            jobRecord.result = updateRes;
            this.stopPolling(event.id);
            return {
              success: true,
              status: 'completed',
              attempts: jobRecord.attempts,
              discovery: discoveryResult,
              updateRes
            };
          }
        } else {
          console.log(`ℹ️ [OfficialSourcePoller] Attempt ${jobRecord.attempts}/${maxAttempts} for ${event.event_name}: No matching published release found yet (Delayed or not yet published).`);
        }
      } catch (err) {
        console.warn(`⚠️ [OfficialSourcePoller] Attempt ${jobRecord.attempts}/${maxAttempts} encountered warning: ${err.message}`);
      }

      if (jobRecord.attempts >= maxAttempts) {
        console.log(`⏹️ [OfficialSourcePoller] Max attempts reached for ${event.event_name} (${event.event_date}). Event remains scheduled as upcoming for subsequent catch-up.`);
        jobRecord.status = 'max_attempts_reached';
        this.stopPolling(event.id);
        return {
          success: false,
          status: 'max_attempts_reached',
          attempts: jobRecord.attempts,
          message: 'Official release not published during current polling window'
        };
      }

      // Schedule next polling retry
      if (this.activePollingJobs.has(event.id)) {
        jobRecord.timer = setTimeout(async () => {
          if (this.activePollingJobs.has(event.id)) {
            await executeAttempt();
          }
        }, intervalMs);
      }

      return null;
    };

    const firstResult = await executeAttempt();
    if (firstResult) {
      return firstResult;
    }

    return {
      success: true,
      status: 'polling',
      message: `Poller active for ${event.event_name} with ${intervalMs}ms refresh interval`,
      job: { eventId: event.id, attempts: jobRecord.attempts, maxAttempts, intervalMs }
    };
  }

  /**
   * Stop polling for an event
   */
  stopPolling(eventId) {
    if (this.activePollingJobs.has(eventId)) {
      const job = this.activePollingJobs.get(eventId);
      if (job.timer) {
        clearTimeout(job.timer);
      }
      this.activePollingJobs.delete(eventId);
      return true;
    }
    return false;
  }

  /**
   * Stop all polling jobs
   */
  stopAll() {
    const count = this.activePollingJobs.size;
    for (const [id] of this.activePollingJobs.entries()) {
      this.stopPolling(id);
    }
    return count;
  }
}

export const officialSourcePollerService = new OfficialSourcePollerService();
