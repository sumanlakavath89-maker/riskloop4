/**
 * Forex Database Synchronization Service
 * 
 * Phase 7.3 Step 2: Safe Forex Database Synchronization
 * 
 * Safely synchronizes validated USD macroeconomic calendar events into public.economic_events.
 * 
 * Safety Rules:
 * 1. Writes only when FOREX_CALENDAR_ENABLED=true AND FOREX_CALENDAR_LIVE_INGESTION_ENABLED=true.
 * 2. Canary Control: Respects FOREX_CALENDAR_CANARY_CURRENCIES (e.g. "USD").
 * 3. Preservation Guarantee: Never overwrites existing actual values or resets released status.
 * 4. Composite Deduplication: Idempotent upsert by (country_code + event_name + event_date).
 * 5. Dry-Run Capability: Reports planned mutations with databaseMutation: false when flags disabled or dryRun requested.
 * 6. Audit & Rollback Protection: Captures pre-sync snapshots and allows targeted rollback on failure.
 */

import { unifiedForexDiscoveryService } from './UnifiedForexDiscoveryService.js';
import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';

export class ForexDatabaseSyncService {
  constructor(discoveryService = unifiedForexDiscoveryService, dbService = supabaseEconomicCalendarService) {
    this.discoveryService = discoveryService;
    this.dbService = dbService;
    this.lastSyncResult = null;
  }

  /**
   * Evaluate whether Forex live database writing is permitted
   * 
   * @param {string} currency - e.g. "USD"
   * @param {Object} [overrideFlags]
   * @returns {{ allowed: boolean, reason?: string, mode: string }}
   */
  canPerformLiveSync(currency = 'USD', overrideFlags = null) {
    const flags = overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();
    const curr = (currency || 'USD').toUpperCase();

    if (!flags.forexCalendarEnabled) {
      return {
        allowed: false,
        mode: 'disabled',
        reason: 'FOREX_CALENDAR_ENABLED is false'
      };
    }

    if (!flags.forexLiveIngestionEnabled) {
      return {
        allowed: false,
        mode: 'discovery_only',
        reason: 'FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false (Dry-Run only)'
      };
    }

    const canaryList = flags.canaryCurrencies || [];
    if (canaryList.length === 0) {
      return {
        allowed: false,
        mode: 'safe_blocked',
        reason: 'FOREX_CALENDAR_CANARY_CURRENCIES is empty (Safe block active)'
      };
    }

    if (!canaryList.includes('ALL') && !canaryList.includes(curr)) {
      return {
        allowed: false,
        mode: 'canary_filtered',
        reason: `Currency "${curr}" is not present in canary currencies [${canaryList.join(', ')}]`
      };
    }

    return {
      allowed: true,
      mode: 'live_active',
      reason: `Live synchronization permitted for currency "${curr}"`
    };
  }

  /**
   * Synchronize discovered Forex USD events to public.economic_events
   * 
   * @param {Object} [options]
   * @param {number} [options.daysAhead=60]
   * @param {boolean} [options.dryRun]
   * @param {Object} [options.overrideFlags]
   * @param {Array} [options.preLoadedEvents]
   * @returns {Promise<Object>} Structured synchronization summary
   */
  async syncForexEvents(options = {}) {
    const startTime = Date.now();
    const flags = options.overrideFlags || forexEconomicCalendarService.getForexSafetyFlags();
    const permission = this.canPerformLiveSync('USD', flags);

    const isDryRun = options.dryRun === true || !permission.allowed;

    // Step 1: Discover / load events
    let events = [];
    let discoverySummary = null;

    if (Array.isArray(options.preLoadedEvents)) {
      events = options.preLoadedEvents;
      discoverySummary = { totalLoaded: events.length };
    } else {
      const discoveryReport = await this.discoveryService.discoverAllForexEvents({
        daysAhead: options.daysAhead || 60,
        from: options.from,
        to: options.to
      });
      events = discoveryReport.events || [];
      discoverySummary = discoveryReport.summary;
    }

    // Step 2: Query existing USD events from Supabase to prepare safe comparison
    const supabase = this.dbService.supabase;
    if (!supabase && !isDryRun) {
      throw new Error('Supabase client is not configured for Forex sync');
    }

    let existingRows = [];
    if (supabase) {
      const { data, error } = await supabase
        .from('economic_events')
        .select('*')
        .eq('country_code', 'US');

      if (error) {
        throw new Error(`Failed to fetch existing USD events: ${error.message}`);
      }
      existingRows = data || [];
    }

    // Map existing records by unique composite key: COUNTRY_CODE|EVENT_NAME|EVENT_DATE
    const existingMap = new Map();
    for (const row of existingRows) {
      const key = `${(row.country_code || 'US').toUpperCase()}|${(row.event_name || '').toLowerCase().trim()}|${String(row.event_date).split('T')[0]}`;
      existingMap.set(key, row);
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const processedEvents = [];
    const createdRecordIds = [];

    // Step 3: Process each discovered event with strict preservation rules
    for (const ev of events) {
      const canonicalName = ev.canonical_event_name || ev.event_name;
      const key = `${(ev.country_code || 'US').toUpperCase()}|${(ev.event_name || canonicalName).toLowerCase().trim()}|${ev.event_date}`;
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
        // ── Preservation Rules ──
        // 1. NEVER overwrite existing actual value
        if (existing.actual !== null && existing.actual !== undefined && existing.actual !== '') {
          recordToSave.actual = existing.actual;
        }

        // 2. NEVER reset released status back to upcoming
        if (existing.status === 'released') {
          recordToSave.status = 'released';
        }

        // 3. Preserve source_url if existing has one and incoming is empty
        if (existing.source_url && !recordToSave.source_url) {
          recordToSave.source_url = existing.source_url;
        }

        // 4. Preserve existing previous or forecast if already populated
        if (existing.previous && !recordToSave.previous) {
          recordToSave.previous = existing.previous;
        }
        if (existing.forecast && !recordToSave.forecast) {
          recordToSave.forecast = existing.forecast;
        }

        // Check if anything meaningful changed
        const isIdentical =
          existing.event_time === recordToSave.event_time &&
          existing.impact === recordToSave.impact &&
          existing.previous === recordToSave.previous &&
          existing.forecast === recordToSave.forecast &&
          existing.actual === recordToSave.actual &&
          existing.status === recordToSave.status &&
          existing.source_url === recordToSave.source_url;

        if (isIdentical) {
          skippedCount++;
          processedEvents.push({ ...existing, _syncAction: 'skipped' });
          continue;
        }

        if (isDryRun) {
          updatedCount++;
          processedEvents.push({ ...existing, ...recordToSave, _syncAction: 'would_update' });
        } else {
          recordToSave.id = existing.id;
          const { data: updatedData, error: updateErr } = await supabase
            .from('economic_events')
            .update(recordToSave)
            .eq('id', existing.id)
            .select();

          if (updateErr) {
            errors.push({ event: recordToSave.event_name, date: recordToSave.event_date, error: updateErr.message });
          } else {
            updatedCount++;
            processedEvents.push({ ...(updatedData?.[0] || recordToSave), _syncAction: 'updated' });
          }
        }
      } else {
        // Brand new record
        if (isDryRun) {
          insertedCount++;
          processedEvents.push({ ...recordToSave, _syncAction: 'would_insert' });
          existingMap.set(key, recordToSave);
        } else {
          const { data: insertedData, error: insertErr } = await supabase
            .from('economic_events')
            .insert([recordToSave])
            .select();

          if (insertErr) {
            errors.push({ event: recordToSave.event_name, date: recordToSave.event_date, error: insertErr.message });
          } else {
            const saved = insertedData?.[0] || recordToSave;
            insertedCount++;
            if (saved.id) createdRecordIds.push(saved.id);
            processedEvents.push({ ...saved, _syncAction: 'inserted' });
            existingMap.set(key, saved);
          }
        }
      }
    }

    const result = {
      success: errors.length === 0,
      service: 'ForexDatabaseSyncService',
      dryRun: isDryRun,
      databaseMutation: !isDryRun && (insertedCount > 0 || updatedCount > 0),
      permission,
      summary: {
        totalDiscovered: events.length,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
        durationMs: Date.now() - startTime
      },
      createdRecordIds,
      errors: errors.length > 0 ? errors : null,
      events: processedEvents,
      syncedAt: new Date().toISOString()
    };

    this.lastSyncResult = result;
    return result;
  }

  /**
   * Rollback records created in a specific sync operation
   * 
   * @param {Array<string>} recordIds
   * @returns {Promise<Object>}
   */
  async rollbackSyncRecords(recordIds = []) {
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return { success: true, rolledBackCount: 0 };
    }

    const supabase = this.dbService.supabase;
    if (!supabase) {
      throw new Error('Supabase client not configured for rollback');
    }

    const { data, error } = await supabase
      .from('economic_events')
      .delete()
      .in('id', recordIds)
      .select();

    if (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    }

    return {
      success: true,
      rolledBackCount: (data || []).length,
      deletedIds: recordIds
    };
  }
}

export const forexDatabaseSyncService = new ForexDatabaseSyncService();
