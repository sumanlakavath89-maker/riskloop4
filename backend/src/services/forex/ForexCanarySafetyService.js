/**
 * Forex Canary Safety Service
 * 
 * Phase 7.4 Step 3: Controlled USD Canary Live Ingestion.
 * 
 * Provides:
 * 1. Controlled small-batch live ingestion for USD canary events.
 * 2. Strict multi-flag safety gate checks.
 * 3. Pre-write state capture and actual/released value preservation.
 * 4. Post-write database verification against Supabase.
 * 5. Automatic per-event rollback on verification failure.
 * 6. Audit logging of every database mutation and rollback.
 * 7. Pre- and post-sync database integrity verification.
 */

import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';
import { unifiedForexDiscoveryService } from './UnifiedForexDiscoveryService.js';

export const FOREX_CANARY_CONFIG = {
  DEFAULT_CANARY_BATCH_SIZE: 5,
  MAX_CANARY_BATCH_SIZE: 10,
  POST_WRITE_TIMEOUT_MS: 3000
};

export class ForexCanarySafetyService {
  constructor(
    dbService = supabaseEconomicCalendarService,
    discoveryService = unifiedForexDiscoveryService
  ) {
    this.dbService = dbService;
    this.discoveryService = discoveryService;
    this.auditLogs = [];
    this.totalCanaryRuns = 0;
    this.successfulMutations = 0;
    this.rolledBackMutations = 0;
    this.verificationFailures = 0;
  }

  /**
   * Evaluate whether USD canary live ingestion is fully authorized
   * 
   * @param {Object} [overrideFlags]
   * @returns {{ authorized: boolean, mode: string, reason: string }}
   */
  isCanaryIngestionAuthorized(overrideFlags = null) {
    const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();

    if (!flags.forexCalendarEnabled) {
      return {
        authorized: false,
        mode: 'disabled',
        reason: 'FOREX_CALENDAR_ENABLED is false'
      };
    }

    if (!flags.forexLiveIngestionEnabled) {
      return {
        authorized: false,
        mode: 'discovery_only',
        reason: 'FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false'
      };
    }

    const canaryList = flags.canaryCurrencies || [];
    if (canaryList.length === 0) {
      return {
        authorized: false,
        mode: 'safe_blocked',
        reason: 'FOREX_CALENDAR_CANARY_CURRENCIES is empty'
      };
    }

    if (!canaryList.includes('ALL') && !canaryList.includes('USD')) {
      return {
        authorized: false,
        mode: 'canary_filtered',
        reason: `Currency "USD" is not present in canary list [${canaryList.join(', ')}]`
      };
    }

    return {
      authorized: true,
      mode: 'canary_active',
      reason: 'USD canary live ingestion explicitly authorized by all safety flags'
    };
  }

  /**
   * Log an audit entry for tracking
   */
  logAudit(entry) {
    const auditRecord = {
      id: `audit-forex-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.auditLogs.push(auditRecord);
    return auditRecord;
  }

  /**
   * Get recorded audit logs
   */
  getAuditLogs() {
    return [...this.auditLogs];
  }

  /**
   * Capture exact state of an existing record
   */
  captureState(row) {
    if (!row) return null;
    return {
      id: row.id,
      event_name: row.event_name,
      country_code: row.country_code,
      event_date: row.event_date,
      event_time: row.event_time,
      timezone: row.timezone,
      status: row.status,
      actual: row.actual,
      previous: row.previous,
      forecast: row.forecast,
      unit: row.unit,
      impact: row.impact,
      source: row.source,
      source_url: row.source_url,
      updated_at: row.updated_at
    };
  }

  /**
   * Post-write verification: immediately query Supabase and verify record integrity
   * 
   * @param {string} recordId
   * @param {Object} expected
   * @returns {Promise<{ verified: boolean, error?: string, record?: Object }>}
   */
  async verifyPostWrite(recordId, expected) {
    const supabase = this.dbService.supabase;
    if (!supabase) {
      return { verified: false, error: 'SUPABASE_UNAVAILABLE' };
    }

    try {
      const { data, error } = await supabase
        .from('economic_events')
        .select('*')
        .eq('id', recordId)
        .single();

      if (error || !data) {
        return {
          verified: false,
          error: error ? error.message : 'RECORD_NOT_FOUND'
        };
      }

      // Verify essential fields match expected
      if (data.event_name !== expected.event_name) {
        return {
          verified: false,
          error: `Event name mismatch: expected "${expected.event_name}", found "${data.event_name}"`,
          record: data
        };
      }

      if (data.country_code !== expected.country_code) {
        return {
          verified: false,
          error: `Country code mismatch: expected "${expected.country_code}", found "${data.country_code}"`,
          record: data
        };
      }

      if (expected.status && data.status !== expected.status) {
        return {
          verified: false,
          error: `Status mismatch: expected "${expected.status}", found "${data.status}"`,
          record: data
        };
      }

      return { verified: true, record: data };
    } catch (err) {
      return { verified: false, error: err.message };
    }
  }

  /**
   * Rollback an event to its previous state (or delete if newly created)
   * 
   * @param {Object} previousSnapshot
   * @param {string} recordId
   * @returns {Promise<Object>}
   */
  async rollbackEvent(previousSnapshot, recordId) {
    const supabase = this.dbService.supabase;
    if (!supabase) {
      throw new Error('Supabase client unavailable for rollback');
    }

    this.rolledBackMutations++;

    if (!previousSnapshot) {
      // Newly created record -> Delete it
      const { error } = await supabase
        .from('economic_events')
        .delete()
        .eq('id', recordId);

      this.logAudit({
        action: 'ROLLBACK_DELETE',
        recordId,
        success: !error,
        error: error?.message || null
      });

      return { action: 'deleted', recordId, success: !error };
    } else {
      // Existing record -> Restore previous snapshot
      const restorePayload = {
        event_name: previousSnapshot.event_name,
        country_code: previousSnapshot.country_code,
        event_date: previousSnapshot.event_date,
        event_time: previousSnapshot.event_time,
        timezone: previousSnapshot.timezone,
        status: previousSnapshot.status,
        actual: previousSnapshot.actual,
        previous: previousSnapshot.previous,
        forecast: previousSnapshot.forecast,
        unit: previousSnapshot.unit,
        impact: previousSnapshot.impact,
        source: previousSnapshot.source,
        source_url: previousSnapshot.source_url,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('economic_events')
        .update(restorePayload)
        .eq('id', previousSnapshot.id);

      this.logAudit({
        action: 'ROLLBACK_RESTORE',
        recordId: previousSnapshot.id,
        previousSnapshot,
        success: !error,
        error: error?.message || null
      });

      return { action: 'restored', recordId: previousSnapshot.id, success: !error };
    }
  }

  /**
   * Execute controlled USD canary batch live synchronization
   * 
   * @param {Object} [options]
   * @param {number} [options.batchSize=5]
   * @param {Object} [options.overrideFlags]
   * @param {Array} [options.events]
   * @param {boolean} [options.dryRun=false]
   * @returns {Promise<Object>}
   */
  async executeCanarySync(options = {}) {
    const startTime = Date.now();
    this.totalCanaryRuns++;

    const gate = this.isCanaryIngestionAuthorized(options.overrideFlags);
    const isDryRun = options.dryRun === true || !gate.authorized;
    const batchLimit = Math.min(
      options.batchSize || FOREX_CANARY_CONFIG.DEFAULT_CANARY_BATCH_SIZE,
      FOREX_CANARY_CONFIG.MAX_CANARY_BATCH_SIZE
    );

    if (!gate.authorized && !options.dryRun) {
      return {
        success: false,
        authorized: false,
        reason: gate.reason,
        mode: gate.mode,
        databaseMutation: false,
        summary: { inserted: 0, updated: 0, skipped: 0, rolledBack: 0 }
      };
    }

    // Step 1: Pre-sync baseline database integrity check
    const supabase = this.dbService.supabase;
    let initialCount = 0;
    if (supabase) {
      const { count } = await supabase
        .from('economic_events')
        .select('*', { count: 'exact', head: true });
      initialCount = count || 0;
    }

    // Step 2: Discover / fetch events
    let candidateEvents = options.events;
    if (!Array.isArray(candidateEvents)) {
      const discovery = await this.discoveryService.discoverAllForexEvents({ daysAhead: 60 });
      candidateEvents = discovery.events || [];
    }

    // Slice to controlled canary batch size
    const batchEvents = candidateEvents.slice(0, batchLimit);

    // Fetch existing USD rows to compare
    let existingUsdRows = [];
    if (supabase) {
      const { data } = await supabase
        .from('economic_events')
        .select('*')
        .eq('country_code', 'US');
      existingUsdRows = data || [];
    }

    const existingMap = new Map();
    for (const row of existingUsdRows) {
      const key = `${row.country_code}|${(row.event_name || '').toLowerCase().trim()}|${String(row.event_date).split('T')[0]}`;
      existingMap.set(key, row);
    }

    const inserted = [];
    const updated = [];
    const skipped = [];
    const rolledBack = [];
    const syncErrors = [];

    for (const ev of batchEvents) {
      const canonicalName = ev.canonical_event_name || ev.event_name;
      const key = `${ev.country_code || 'US'}|${(ev.event_name || canonicalName).toLowerCase().trim()}|${ev.event_date}`;
      const existing = existingMap.get(key);

      const recordToSave = {
        event_name: ev.event_name || canonicalName,
        country: ev.country || 'United States',
        country_code: ev.country_code || 'US',
        event_date: ev.event_date,
        event_time: ev.event_time,
        timezone: ev.timezone || 'America/New_York',
        impact: ev.impact || 'high',
        previous: ev.previous || null,
        forecast: ev.forecast || null,
        actual: null,
        unit: ev.unit || '%',
        source: ev.source || 'US Government',
        source_url: ev.source_url || null,
        status: ev.status || 'upcoming',
        updated_at: new Date().toISOString()
      };

      if (existing) {
        // Strict preservation: never overwrite actual value or reset released status
        if (existing.actual !== null && existing.actual !== undefined && existing.actual !== '') {
          recordToSave.actual = existing.actual;
        }
        if (existing.status === 'released') {
          recordToSave.status = 'released';
        }
        if (existing.source_url && !recordToSave.source_url) {
          recordToSave.source_url = existing.source_url;
        }
        if (existing.previous && !recordToSave.previous) {
          recordToSave.previous = existing.previous;
        }
        if (existing.forecast && !recordToSave.forecast) {
          recordToSave.forecast = existing.forecast;
        }

        const isIdentical =
          existing.event_time === recordToSave.event_time &&
          existing.impact === recordToSave.impact &&
          existing.previous === recordToSave.previous &&
          existing.forecast === recordToSave.forecast &&
          existing.actual === recordToSave.actual &&
          existing.status === recordToSave.status;

        if (isIdentical) {
          skipped.push(existing);
          continue;
        }

        if (isDryRun) {
          updated.push({ ...existing, ...recordToSave, _dryRun: true });
          continue;
        }

        // Live update with previous state capture and post-write verification
        const previousSnapshot = this.captureState(existing);
        recordToSave.id = existing.id;

        const { data: updateData, error: updateErr } = await supabase
          .from('economic_events')
          .update(recordToSave)
          .eq('id', existing.id)
          .select();

        if (updateErr) {
          syncErrors.push({ event: recordToSave.event_name, error: updateErr.message });
          continue;
        }

        const updatedRow = updateData?.[0] || recordToSave;

        // Post-write verification
        const verification = await this.verifyPostWrite(existing.id, recordToSave);
        if (!verification.verified) {
          this.verificationFailures++;
          console.error(`⚠️ [CanarySafety] Post-write verification failed for updated event ${recordToSave.event_name}:`, verification.error);
          await this.rollbackEvent(previousSnapshot, existing.id);
          rolledBack.push({ id: existing.id, event_name: recordToSave.event_name, reason: verification.error });
        } else {
          this.successfulMutations++;
          this.logAudit({
            action: 'UPDATE',
            recordId: existing.id,
            eventName: recordToSave.event_name,
            previousSnapshot,
            newState: recordToSave
          });
          updated.push(updatedRow);
        }
      } else {
        // New record insertion
        if (isDryRun) {
          inserted.push({ ...recordToSave, _dryRun: true });
          continue;
        }

        const { data: insertData, error: insertErr } = await supabase
          .from('economic_events')
          .insert([recordToSave])
          .select();

        if (insertErr) {
          syncErrors.push({ event: recordToSave.event_name, error: insertErr.message });
          continue;
        }

        const insertedRow = insertData?.[0] || recordToSave;
        const insertedId = insertedRow.id;

        // Post-write verification
        const verification = await this.verifyPostWrite(insertedId, recordToSave);
        if (!verification.verified) {
          this.verificationFailures++;
          console.error(`⚠️ [CanarySafety] Post-write verification failed for inserted event ${recordToSave.event_name}:`, verification.error);
          await this.rollbackEvent(null, insertedId);
          rolledBack.push({ id: insertedId, event_name: recordToSave.event_name, reason: verification.error });
        } else {
          this.successfulMutations++;
          this.logAudit({
            action: 'INSERT',
            recordId: insertedId,
            eventName: recordToSave.event_name,
            newState: recordToSave
          });
          inserted.push(insertedRow);
          existingMap.set(key, insertedRow);
        }
      }
    }

    // Step 3: Post-sync baseline database integrity check
    let postCount = 0;
    if (supabase) {
      const { count } = await supabase
        .from('economic_events')
        .select('*', { count: 'exact', head: true });
      postCount = count || 0;
    }

    return {
      success: syncErrors.length === 0 && rolledBack.length === 0,
      service: 'ForexCanarySafetyService',
      mode: isDryRun ? 'dry_run' : 'live_canary',
      databaseMutation: !isDryRun && (inserted.length > 0 || updated.length > 0),
      batchLimit,
      initialDatabaseCount: initialCount,
      postDatabaseCount: postCount,
      summary: {
        totalProcessed: batchEvents.length,
        inserted: inserted.length,
        updated: updated.length,
        skipped: skipped.length,
        rolledBack: rolledBack.length,
        errors: syncErrors.length,
        durationMs: Date.now() - startTime
      },
      inserted,
      updated,
      rolledBack,
      errors: syncErrors.length > 0 ? syncErrors : null,
      timestamp: new Date().toISOString()
    };
  }
}

export const forexCanarySafetyService = new ForexCanarySafetyService();
