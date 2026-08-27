/**
 * Unified Forex Discovery Service
 * 
 * Phase 7.3 Step 1: Unified Macroeconomic Source Aggregation.
 * 
 * Combines official USD releases from:
 * 1. BLSSourceAdapter (NFP, Unemployment Rate, CPI, Core CPI, PPI)
 * 2. BEASourceAdapter (GDP, PCE, Core PCE)
 * 3. FederalReserveSourceAdapter (FOMC Interest Rate Decision)
 * 
 * Architecture & Guarantees:
 * - Provider-agnostic aggregation with bounded fault tolerance
 * - Normalization via ForexEventNormalizer
 * - Validation via ForexEventValidator
 * - Deterministic composite deduplication (country_code + event_name + event_date + event_time)
 * - Chronological sorting (event_date ASC, event_time ASC)
 * - Zero database mutations (Strict dry-run / discovery mode)
 */

import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';
import { forexEventNormalizer } from './ForexEventNormalizer.js';
import { forexEventValidator } from './ForexEventValidator.js';
import { forexEconomicCalendarService } from './ForexEconomicCalendarService.js';

export class UnifiedForexDiscoveryService {
  constructor(adapters = [blsSourceAdapter, beaSourceAdapter, federalReserveSourceAdapter]) {
    this.adapters = adapters;
    this.normalizer = forexEventNormalizer;
    this.validator = forexEventValidator;
  }

  /**
   * Return configured official provider adapters
   */
  getAdapters() {
    return [...this.adapters];
  }

  /**
   * Run unified discovery across all official US government sources
   * 
   * @param {Object} [options]
   * @param {number} [options.daysAhead=60]
   * @param {string} [options.from]
   * @param {string} [options.to]
   * @returns {Promise<Object>} Unified discovery report
   */
  async discoverAllForexEvents(options = {}) {
    const diagnostics = [];
    const providerSummaries = {};
    const rawEvents = [];
    const startTime = Date.now();

    // Step 1: Fetch from all provider adapters with isolated fault tolerance
    for (const adapter of this.adapters) {
      const providerName = adapter.getProviderName();
      try {
        const fetchResult = await adapter.fetchUpcomingEvents(options);
        providerSummaries[providerName] = {
          success: true,
          eventsFound: fetchResult.events?.length || 0,
          source: fetchResult.source || providerName
        };

        if (Array.isArray(fetchResult.events)) {
          rawEvents.push(...fetchResult.events);
        }
      } catch (err) {
        console.error(`⚠️ [UnifiedForexDiscovery] Provider "${providerName}" failed:`, err.message);
        providerSummaries[providerName] = {
          success: false,
          eventsFound: 0,
          error: err.message
        };
        diagnostics.push({
          level: 'warn',
          provider: providerName,
          message: `Provider failed: ${err.message}`
        });
      }
    }

    // Step 2: Normalize and validate each raw event
    const validatedEvents = [];
    const rejectedEvents = [];

    for (const raw of rawEvents) {
      const validation = this.validator.validateForexEvent(raw);
      if (validation.valid && validation.normalizedEvent) {
        validatedEvents.push(validation.normalizedEvent);
      } else {
        rejectedEvents.push({
          raw,
          errors: validation.errors
        });
        diagnostics.push({
          level: 'info',
          message: `Event "${raw.event_name || 'unknown'}" rejected: ${validation.errors.join('; ')}`
        });
      }
    }

    // Step 3: Deduplicate deterministically using country_code + event_name + event_date + event_time
    const seenCompositeKeys = new Set();
    const uniqueEvents = [];

    for (const ev of validatedEvents) {
      const canonicalName = ev.canonical_event_name || ev.event_name;
      const compositeKey = `${ev.country_code || 'US'}|${canonicalName}|${ev.event_date}|${ev.event_time || ''}|${ev.release_stage || ''}`;

      if (!seenCompositeKeys.has(compositeKey)) {
        seenCompositeKeys.add(compositeKey);
        uniqueEvents.push(ev);
      } else {
        diagnostics.push({
          level: 'info',
          message: `Duplicate event suppressed: ${compositeKey}`
        });
      }
    }

    // Step 4: Chronological sorting (event_date ASC, event_time ASC)
    uniqueEvents.sort((a, b) => {
      const dateCmp = a.event_date.localeCompare(b.event_date);
      if (dateCmp !== 0) return dateCmp;
      return (a.event_time || '').localeCompare(b.event_time || '');
    });

    const flags = forexEconomicCalendarService.getForexSafetyFlags();

    return {
      success: true,
      service: 'UnifiedForexDiscoveryService',
      mode: 'discovery_only',
      databaseMutation: false,
      safetyFlags: flags,
      summary: {
        totalDiscovered: rawEvents.length,
        totalValidated: validatedEvents.length,
        totalRejected: rejectedEvents.length,
        totalUnique: uniqueEvents.length,
        durationMs: Date.now() - startTime
      },
      providers: providerSummaries,
      events: uniqueEvents,
      rejected: rejectedEvents,
      diagnostics,
      discoveredAt: new Date().toISOString()
    };
  }

  /**
   * Backwards compatible method
   */
  async discoverOfficialEvents(options = {}) {
    return this.discoverAllForexEvents(options);
  }
}

export const unifiedForexDiscoveryService = new UnifiedForexDiscoveryService();
export const forexOfficialSourceDiscoveryService = unifiedForexDiscoveryService;
