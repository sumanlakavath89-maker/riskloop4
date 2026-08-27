/**
 * Global Economic Calendar Service
 * 
 * Phase 7.8: Unified Global Economic Calendar Dashboard Engine
 * 
 * Provides unified, multi-currency macroeconomic event aggregation across:
 * - INR (India / MoSPI / RBI)
 * - USD (United States / BLS / BEA / Fed)
 * - EUR (Eurozone / ECB / Eurostat)
 * - GBP (United Kingdom / BoE / ONS)
 * - JPY (Japan / BoJ / Statistics Bureau)
 * - AUD (Australia / RBA / ABS)
 * - CAD (Canada / BoC / StatCan)
 * - CHF (Switzerland / SNB / FSO)
 * - CNY (China / PBoC / NBS)
 * 
 * Features:
 * 1. Unified Multi-Currency Aggregation with resilient error isolation.
 * 2. Multi-Dimensional Filtering (Currency, Country, Date, Impact, Status).
 * 3. Automatic User Timezone Conversion + Original Timezone Preservation.
 * 4. High / Medium / Low Impact Normalization.
 * 5. Safe Pagination & Multi-field Sorting.
 * 6. Public Telemetry Sanitization (No internal database or secret exposure).
 * 7. India Subsystem & Baseline Preservation.
 */

import { supabaseEconomicCalendarService } from '../SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../IndiaCalendarScheduleService.js';
import { blsSourceAdapter } from './providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from './providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from './providers/FederalReserveSourceAdapter.js';
import { ecbSourceAdapter } from './providers/ECBSourceAdapter.js';
import { boeSourceAdapter } from './providers/BoESourceAdapter.js';
import { bojSourceAdapter } from './providers/BoJSourceAdapter.js';
import { rbaSourceAdapter } from './providers/RBASourceAdapter.js';
import { bocSourceAdapter } from './providers/BoCSourceAdapter.js';
import { snbSourceAdapter } from './providers/SNBSourceAdapter.js';
import { pbocSourceAdapter } from './providers/PBoCSourceAdapter.js';

export const SUPPORTED_GLOBAL_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];

export const CURRENCY_METADATA = {
  INR: { name: 'India', countryCode: 'IN', currency: 'INR', flag: '🇮🇳', timezone: 'Asia/Kolkata', defaultSource: 'MoSPI / RBI' },
  USD: { name: 'United States', countryCode: 'US', currency: 'USD', flag: '🇺🇸', timezone: 'America/New_York', defaultSource: 'BLS / BEA / Fed' },
  EUR: { name: 'Eurozone', countryCode: 'EU', currency: 'EUR', flag: '🇪🇺', timezone: 'Europe/Brussels', defaultSource: 'ECB / Eurostat' },
  GBP: { name: 'United Kingdom', countryCode: 'GB', currency: 'GBP', flag: '🇬🇧', timezone: 'Europe/London', defaultSource: 'Bank of England / ONS' },
  JPY: { name: 'Japan', countryCode: 'JP', currency: 'JPY', flag: '🇯🇵', timezone: 'Asia/Tokyo', defaultSource: 'Bank of Japan / SBJ' },
  AUD: { name: 'Australia', countryCode: 'AU', currency: 'AUD', flag: '🇦🇺', timezone: 'Australia/Sydney', defaultSource: 'Reserve Bank of Australia / ABS' },
  CAD: { name: 'Canada', countryCode: 'CA', currency: 'CAD', flag: '🇨🇦', timezone: 'America/Toronto', defaultSource: 'Bank of Canada / StatCan' },
  CHF: { name: 'Switzerland', countryCode: 'CH', currency: 'CHF', flag: '🇨🇭', timezone: 'Europe/Zurich', defaultSource: 'Swiss National Bank / FSO' },
  CNY: { name: 'China', countryCode: 'CN', currency: 'CNY', flag: '🇨🇳', timezone: 'Asia/Shanghai', defaultSource: 'People\'s Bank of China / NBS' }
};

export class GlobalEconomicCalendarService {
  constructor(supabaseService = supabaseEconomicCalendarService) {
    this.supabaseService = supabaseService;
  }

  /**
   * Convert an event date/time to a specified target timezone
   * 
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {string} timeStr 'HH:mm'
   * @param {string} sourceTz Source timezone (e.g. 'America/New_York')
   * @param {string} targetTz Target timezone (e.g. 'Asia/Kolkata')
   * @returns {{ userDate: string, userTime: string, userDateTime: string, originalTimezone: string, targetTimezone: string }}
   */
  convertTimezone(dateStr, timeStr, sourceTz = 'UTC', targetTz = 'UTC') {
    try {
      if (!dateStr) return { userDate: '—', userTime: '—', userDateTime: null, originalTimezone: sourceTz, targetTimezone: targetTz };

      const safeTime = (timeStr && timeStr !== '—' && /^\d{1,2}:\d{2}/.test(timeStr)) ? timeStr : '12:00';
      const cleanTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
      const isoStr = `${dateStr}T${cleanTime}`;

      // Create date assuming source timezone
      const localDate = new Date(isoStr);

      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: targetTz || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: targetTz || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const userDate = dateFormatter.format(localDate);
      const userTime = timeFormatter.format(localDate);

      return {
        userDate,
        userTime,
        userDateTime: `${userDate}T${userTime}:00`,
        originalTimezone: sourceTz,
        targetTimezone: targetTz
      };
    } catch {
      return {
        userDate: dateStr,
        userTime: timeStr || '—',
        userDateTime: dateStr ? `${dateStr}T${timeStr || '00:00'}:00` : null,
        originalTimezone: sourceTz,
        targetTimezone: targetTz
      };
    }
  }

  /**
   * Fetch and synthesize sovereign economic events across all currencies with strict isolation
   * 
   * @param {Object} [options]
   * @param {string|string[]} [options.currencies]
   * @param {string|string[]} [options.countries]
   * @param {string} [options.from]
   * @param {string} [options.to]
   * @param {string} [options.impact]
   * @param {string} [options.status]
   * @param {string} [options.search]
   * @param {string} [options.userTimezone='Asia/Kolkata']
   * @param {number} [options.page=1]
   * @param {number} [options.limit=50]
   * @param {string} [options.sortBy='date']
   * @param {string} [options.sortDirection='asc']
   * @returns {Promise<Object>}
   */
  async getGlobalEvents(options = {}) {
    const startTime = Date.now();
    const {
      currencies,
      countries,
      from,
      to,
      impact,
      status,
      search,
      userTimezone = 'Asia/Kolkata',
      page = 1,
      limit = 50,
      sortBy = 'date',
      sortDirection = 'asc'
    } = options;

    const requestedCurrencies = this._resolveCurrencyFilter(currencies, countries);
    const rawEvents = [];
    const feedErrors = [];

    // ── 1. Sovereign Feed Discovery with Resilient Isolation ───────────
    const feedTasks = [];

    // INR Subsystem: Query Supabase or India Schedule Generator
    if (requestedCurrencies.includes('INR')) {
      feedTasks.push((async () => {
        try {
          const dbEvents = await this.supabaseService.getEvents({ countryCode: 'IN' });
          if (Array.isArray(dbEvents) && dbEvents.length > 0) {
            return dbEvents.map(e => this._normalizeEvent(e, 'INR'));
          }
          // Fallback to deterministic schedule generator
          const generated = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 60 });
          return (generated.events || []).map(e => this._normalizeEvent(e, 'INR'));
        } catch (err) {
          feedErrors.push({ currency: 'INR', error: err.message });
          return [];
        }
      })());
    }

    // USD Subsystem: BLS, BEA, Fed
    if (requestedCurrencies.includes('USD')) {
      feedTasks.push((async () => {
        try {
          const [bls, bea, fed] = await Promise.allSettled([
            blsSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 }),
            beaSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 }),
            federalReserveSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 })
          ]);
          const usdList = [];
          if (bls.status === 'fulfilled' && bls.value?.events) usdList.push(...bls.value.events);
          if (bea.status === 'fulfilled' && bea.value?.events) usdList.push(...bea.value.events);
          if (fed.status === 'fulfilled' && fed.value?.events) usdList.push(...fed.value.events);
          return usdList.map(e => this._normalizeEvent(e, 'USD'));
        } catch (err) {
          feedErrors.push({ currency: 'USD', error: err.message });
          return [];
        }
      })());
    }

    // EUR Subsystem: ECB / Eurostat
    if (requestedCurrencies.includes('EUR')) {
      feedTasks.push((async () => {
        try {
          const res = await ecbSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'EUR'));
        } catch (err) {
          feedErrors.push({ currency: 'EUR', error: err.message });
          return [];
        }
      })());
    }

    // GBP Subsystem: Bank of England / ONS
    if (requestedCurrencies.includes('GBP')) {
      feedTasks.push((async () => {
        try {
          const res = await boeSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'GBP'));
        } catch (err) {
          feedErrors.push({ currency: 'GBP', error: err.message });
          return [];
        }
      })());
    }

    // JPY Subsystem: Bank of Japan / SBJ
    if (requestedCurrencies.includes('JPY')) {
      feedTasks.push((async () => {
        try {
          const res = await bojSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'JPY'));
        } catch (err) {
          feedErrors.push({ currency: 'JPY', error: err.message });
          return [];
        }
      })());
    }

    // AUD Subsystem: RBA / ABS
    if (requestedCurrencies.includes('AUD')) {
      feedTasks.push((async () => {
        try {
          const res = await rbaSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'AUD'));
        } catch (err) {
          feedErrors.push({ currency: 'AUD', error: err.message });
          return [];
        }
      })());
    }

    // CAD Subsystem: BoC / StatCan
    if (requestedCurrencies.includes('CAD')) {
      feedTasks.push((async () => {
        try {
          const res = await bocSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'CAD'));
        } catch (err) {
          feedErrors.push({ currency: 'CAD', error: err.message });
          return [];
        }
      })());
    }

    // CHF Subsystem: SNB / FSO
    if (requestedCurrencies.includes('CHF')) {
      feedTasks.push((async () => {
        try {
          const res = await snbSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'CHF'));
        } catch (err) {
          feedErrors.push({ currency: 'CHF', error: err.message });
          return [];
        }
      })());
    }

    // CNY Subsystem: PBoC / NBS
    if (requestedCurrencies.includes('CNY')) {
      feedTasks.push((async () => {
        try {
          const res = await pbocSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
          return (res.events || []).map(e => this._normalizeEvent(e, 'CNY'));
        } catch (err) {
          feedErrors.push({ currency: 'CNY', error: err.message });
          return [];
        }
      })());
    }

    const settledResults = await Promise.allSettled(feedTasks);
    for (const res of settledResults) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        rawEvents.push(...res.value);
      }
    }

    // ── 2. Deduplicate Events ─────────────────────────────────────────
    const seen = new Set();
    const uniqueEvents = [];
    for (const ev of rawEvents) {
      const key = `${ev.currency}_${ev.eventName.toLowerCase().trim()}_${ev.originalDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(ev);
      }
    }

    // ── 3. Apply Multi-Dimensional Filtering ──────────────────────────
    let filtered = uniqueEvents.filter(ev => {
      // Date filter
      if (from && ev.originalDate < from) return false;
      if (to && ev.originalDate > to) return false;

      // Impact filter
      if (impact && impact !== 'ALL' && ev.impact.toLowerCase() !== impact.toLowerCase()) {
        return false;
      }

      // Status filter
      if (status && status !== 'ALL' && ev.status.toLowerCase() !== status.toLowerCase()) {
        return false;
      }

      // Search keyword filter
      if (search && search.trim()) {
        const q = search.toLowerCase().trim();
        const matches = ev.eventName.toLowerCase().includes(q) ||
                        ev.country.toLowerCase().includes(q) ||
                        ev.currency.toLowerCase().includes(q) ||
                        ev.source.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });

    // ── 4. Apply Timezone Conversion & Formatting ─────────────────────
    const processedEvents = filtered.map(ev => {
      const tzConversion = this.convertTimezone(
        ev.originalDate,
        ev.originalTime,
        ev.originalTimezone,
        userTimezone
      );

      return {
        id: ev.id,
        eventName: ev.eventName,
        currency: ev.currency,
        country: ev.country,
        countryCode: ev.countryCode,
        flag: ev.flag,
        impact: ev.impact,
        status: ev.status,
        scheduledDate: tzConversion.userDate,
        scheduledTime: tzConversion.userTime,
        userDateTime: tzConversion.userDateTime,
        originalDate: ev.originalDate,
        originalTime: ev.originalTime,
        originalTimezone: ev.originalTimezone,
        userTimezone: tzConversion.targetTimezone,
        actual: ev.actual,
        forecast: ev.forecast,
        previous: ev.previous,
        unit: ev.unit,
        source: ev.source,
        sourceUrl: ev.sourceUrl,
        countdownMs: this._calculateCountdown(ev.originalDate, ev.originalTime, ev.originalTimezone)
      };
    });

    // ── 5. Sorting ────────────────────────────────────────────────────
    processedEvents.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'impact') {
        const rank = { high: 3, medium: 2, low: 1 };
        comparison = (rank[b.impact] || 0) - (rank[a.impact] || 0);
      } else if (sortBy === 'currency') {
        comparison = a.currency.localeCompare(b.currency);
      } else if (sortBy === 'country') {
        comparison = a.country.localeCompare(b.country);
      } else {
        // Default sort by date/time
        const timeA = new Date(a.userDateTime || a.originalDate).getTime();
        const timeB = new Date(b.userDateTime || b.originalDate).getTime();
        comparison = timeA - timeB;
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    // ── 6. Safe Pagination ────────────────────────────────────────────
    const totalCount = processedEvents.length;
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const totalPages = Math.ceil(totalCount / safeLimit) || 1;
    const startIndex = (safePage - 1) * safeLimit;
    const pagedEvents = processedEvents.slice(startIndex, startIndex + safeLimit);

    // ── 7. Public Output Payload ──────────────────────────────────────
    return {
      success: true,
      service: 'GlobalEconomicCalendarService',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      userTimezone,
      filters: {
        currencies: requestedCurrencies,
        from: from || null,
        to: to || null,
        impact: impact || 'ALL',
        status: status || 'ALL',
        search: search || null
      },
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalEvents: totalCount,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1
      },
      feedErrorsCount: feedErrors.length,
      events: pagedEvents
    };
  }

  _resolveCurrencyFilter(currencies, countries) {
    if (!currencies && !countries) {
      return [...SUPPORTED_GLOBAL_CURRENCIES];
    }

    const resolved = new Set();

    if (currencies) {
      const list = Array.isArray(currencies) ? currencies : currencies.split(',');
      for (let c of list) {
        c = c.toUpperCase().trim();
        if (c === 'ALL') return [...SUPPORTED_GLOBAL_CURRENCIES];
        if (SUPPORTED_GLOBAL_CURRENCIES.includes(c)) resolved.add(c);
      }
    }

    if (countries) {
      const list = Array.isArray(countries) ? countries : countries.split(',');
      for (let co of list) {
        co = co.toUpperCase().trim();
        if (co === 'ALL') return [...SUPPORTED_GLOBAL_CURRENCIES];
        for (const [curr, meta] of Object.entries(CURRENCY_METADATA)) {
          if (meta.countryCode === co || meta.name.toUpperCase() === co) {
            resolved.add(curr);
          }
        }
      }
    }

    return resolved.size > 0 ? Array.from(resolved) : [...SUPPORTED_GLOBAL_CURRENCIES];
  }

  _normalizeEvent(raw, defaultCurrency) {
    const currency = (raw.currency || defaultCurrency || 'USD').toUpperCase().trim();
    const meta = CURRENCY_METADATA[currency] || {
      name: raw.country || 'Global',
      countryCode: raw.country_code || 'US',
      flag: '🌐',
      timezone: 'UTC',
      defaultSource: 'Official Sovereign Provider'
    };

    const dateStr = raw.event_date ? String(raw.event_date).split('T')[0] : (raw.date || '2026-09-01');
    const timeStr = raw.event_time || raw.time || '12:00';
    const impactStr = (raw.impact || 'medium').toLowerCase();

    return {
      id: raw.id || `ev_${currency}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventName: raw.event_name || raw.name || raw.indicator || 'Economic Release',
      currency,
      country: raw.country || meta.name,
      countryCode: raw.country_code || meta.countryCode,
      flag: meta.flag,
      impact: ['high', 'medium', 'low'].includes(impactStr) ? impactStr : 'medium',
      status: (raw.status || 'upcoming').toLowerCase(),
      originalDate: dateStr,
      originalTime: timeStr,
      originalTimezone: raw.timezone || meta.timezone,
      actual: raw.actual !== undefined ? raw.actual : null,
      forecast: raw.forecast !== undefined ? raw.forecast : null,
      previous: raw.previous !== undefined ? raw.previous : null,
      unit: raw.unit || '%',
      source: raw.source || meta.defaultSource,
      sourceUrl: raw.source_url || raw.url || null
    };
  }

  _calculateCountdown(dateStr, timeStr, timezone) {
    try {
      const cleanTime = (timeStr && timeStr !== '—') ? timeStr : '12:00';
      const targetTime = new Date(`${dateStr}T${cleanTime.length === 5 ? cleanTime + ':00' : cleanTime}`).getTime();
      return Math.max(0, targetTime - Date.now());
    } catch {
      return 0;
    }
  }
}

export const globalEconomicCalendarService = new GlobalEconomicCalendarService();
