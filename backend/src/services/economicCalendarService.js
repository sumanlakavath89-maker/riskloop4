/**
 * Economic Calendar Service — MT5/MQL5 Bridge Foundation
 * Manages ingestion, normalization, validation, and storage of economic calendar events.
 */

class EconomicCalendarService {
  constructor() {
    // In-memory store keyed by event id: Map<string, NormalizedEvent>
    this.events = new Map();
    this._initDefaultSeed();
  }

  /**
   * Seed initial macroeconomic baseline events if empty
   */
  _initDefaultSeed() {
    const seedEvents = [
      {
        id: 'US_CPI_20260817',
        country: 'United States',
        countryCode: 'US',
        currency: 'USD',
        event: 'Consumer Price Index (YoY)',
        eventCode: 'US_CPI_YOY',
        eventTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        impact: 'high',
        actual: '—',
        forecast: '2.9%',
        previous: '3.0%',
        revisedPrevious: '—',
        source: 'MT5'
      },
      {
        id: 'IN_RBI_20260818',
        country: 'India',
        countryCode: 'IN',
        currency: 'INR',
        event: 'RBI Monetary Policy Interest Rate Decision',
        eventCode: 'IN_RBI_REPO',
        eventTime: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
        impact: 'high',
        actual: '—',
        forecast: '6.50%',
        previous: '6.50%',
        revisedPrevious: '—',
        source: 'MT5'
      },
      {
        id: 'EU_ZEW_20260817',
        country: 'Eurozone',
        countryCode: 'EU',
        currency: 'EUR',
        event: 'ZEW Economic Sentiment Index',
        eventCode: 'EU_ZEW_SENTIMENT',
        eventTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        impact: 'medium',
        actual: '31.8',
        forecast: '35.4',
        previous: '43.7',
        revisedPrevious: '—',
        source: 'MT5'
      }
    ];

    for (const ev of seedEvents) {
      this.events.set(ev.id, ev);
    }
  }

  /**
   * Validate bridge authentication secret from header
   * @param {string} headerSecret - Secret provided in x-mt5-bridge-secret header
   * @returns {boolean}
   */
  verifyBridgeSecret(headerSecret) {
    const configuredSecret = process.env.MT5_CALENDAR_BRIDGE_SECRET;
    if (!configuredSecret || !configuredSecret.trim()) {
      // Reject if no secret configured
      return false;
    }
    if (!headerSecret || typeof headerSecret !== 'string') {
      return false;
    }
    return headerSecret.trim() === configuredSecret.trim();
  }

  /**
   * Normalize an individual record into standardized schema
   * @param {Object} raw - Raw calendar item from MT5 payload
   * @returns {Object} Normalized record
   */
  normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Record must be a non-null object');
    }

    const eventName = (raw.event || raw.eventName || raw.title || raw.name || '').trim();
    const eventCode = (raw.eventCode || raw.code || raw.symbol || '').trim();

    if (!eventName && !eventCode) {
      throw new Error('Record missing required field: "event" or "eventCode"');
    }

    // Validate eventTime
    let parsedTime;
    const rawTime = raw.eventTime || raw.time || raw.timestamp || raw.date;
    if (!rawTime) {
      throw new Error('Record missing required field: "eventTime"');
    }

    if (typeof rawTime === 'number') {
      // If unix timestamp in seconds, convert to milliseconds
      parsedTime = rawTime < 10000000000 ? new Date(rawTime * 1000) : new Date(rawTime);
    } else {
      parsedTime = new Date(rawTime);
    }

    if (isNaN(parsedTime.getTime())) {
      throw new Error(`Invalid eventTime date format: "${rawTime}"`);
    }

    const countryCode = (raw.countryCode || raw.country || 'GLOBAL').trim().toUpperCase();
    const country = (raw.country || raw.countryName || countryCode).trim();
    const currency = (raw.currency || raw.curr || '').trim().toUpperCase();

    // Standardize impact: 'high' | 'medium' | 'low' | 'none'
    let rawImpact = String(raw.impact || 'medium').toLowerCase().trim();
    if (rawImpact === '3' || rawImpact === 'h' || rawImpact.includes('high')) rawImpact = 'high';
    else if (rawImpact === '2' || rawImpact === 'm' || rawImpact.includes('med')) rawImpact = 'medium';
    else if (rawImpact === '1' || rawImpact === 'l' || rawImpact.includes('low')) rawImpact = 'low';
    else if (rawImpact === '0' || rawImpact.includes('none')) rawImpact = 'none';
    else rawImpact = 'medium';

    // Generate unique ID if missing
    const generatedId = raw.id || `${countryCode}_${(eventCode || eventName).replace(/[^a-zA-Z0-9]/g, '_')}_${parsedTime.getTime()}`;

    const formatVal = (val) => {
      if (val === undefined || val === null || val === '') return '—';
      return String(val).trim();
    };

    return {
      id: String(generatedId),
      country: country,
      countryCode: countryCode,
      currency: currency,
      event: eventName || eventCode,
      eventCode: eventCode || eventName,
      eventTime: parsedTime.toISOString(),
      impact: rawImpact,
      actual: formatVal(raw.actual),
      forecast: formatVal(raw.forecast),
      previous: formatVal(raw.previous),
      revisedPrevious: formatVal(raw.revisedPrevious || raw.revised || raw.rev_previous),
      source: (raw.source || 'MT5').trim()
    };
  }

  /**
   * Process & store incoming MT5 calendar records
   * @param {Object|Array} payload - Ingest payload from MT5 POST
   * @returns {Object} Result summary with processed count and records
   */
  ingestMT5Records(payload) {
    let rawList = [];

    if (Array.isArray(payload)) {
      rawList = payload;
    } else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.events)) {
        rawList = payload.events;
      } else if (Array.isArray(payload.records)) {
        rawList = payload.records;
      } else if (Array.isArray(payload.data)) {
        rawList = payload.data;
      } else {
        // Single record object
        rawList = [payload];
      }
    } else {
      throw new Error('Invalid request payload. Expected JSON object or array of calendar records.');
    }

    if (rawList.length === 0) {
      throw new Error('Payload contains 0 records.');
    }

    const processed = [];
    const errors = [];

    for (let i = 0; i < rawList.length; i++) {
      try {
        const normalized = this.normalizeRecord(rawList[i]);
        const existing = this.events.get(normalized.id);

        if (existing) {
          // Preserve existing published actual if incoming is missing/dash
          if (normalized.actual === '—' && existing.actual && existing.actual !== '—') {
            normalized.actual = existing.actual;
          }
          // Preserve existing previous if incoming is missing/dash
          if (normalized.previous === '—' && existing.previous && existing.previous !== '—') {
            normalized.previous = existing.previous;
          }
          // Preserve existing forecast if incoming is missing/dash
          if (normalized.forecast === '—' && existing.forecast && existing.forecast !== '—') {
            normalized.forecast = existing.forecast;
          }
        }

        this.events.set(normalized.id, normalized);
        processed.push(normalized);
      } catch (err) {
        errors.push(`Record index ${i}: ${err.message}`);
      }
    }

    if (processed.length === 0 && errors.length > 0) {
      const err = new Error(`Malformed records: ${errors.join('; ')}`);
      err.status = 400;
      err.details = errors;
      throw err;
    }

    return {
      count: processed.length,
      errorsCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      records: processed
    };
  }

  /**
   * Query calendar records with filters & chronological sorting
   * @param {Object} filters - Query parameters
   * @returns {Array} Filtered and sorted records
   */
  getCalendarEvents(filters = {}) {
    let list = Array.from(this.events.values());

    const {
      country,
      countryCode,
      currency,
      impact,
      from,
      to,
      limit
    } = filters;

    // Filter by country or countryCode
    const targetCountry = (countryCode || country || '').trim().toUpperCase();
    if (targetCountry) {
      list = list.filter(e => {
        const cCode = (e.countryCode || '').toUpperCase();
        const cName = (e.country || '').toUpperCase();
        if (targetCountry.length <= 3) {
          return cCode === targetCountry || cName === targetCountry;
        }
        return cCode === targetCountry || cName === targetCountry || cName.includes(targetCountry);
      });
    }

    // Filter by currency
    if (currency && currency.trim()) {
      const targetCurr = currency.trim().toUpperCase();
      list = list.filter(e => e.currency === targetCurr);
    }

    // Filter by impact
    if (impact && impact.trim()) {
      const targetImpact = impact.trim().toLowerCase();
      list = list.filter(e => e.impact === targetImpact);
    }

    // Filter by date range (from / to)
    if (from) {
      const fromTime = new Date(from).getTime();
      if (!isNaN(fromTime)) {
        list = list.filter(e => new Date(e.eventTime).getTime() >= fromTime);
      }
    }

    if (to) {
      const toTime = new Date(to).getTime();
      if (!isNaN(toTime)) {
        list = list.filter(e => new Date(e.eventTime).getTime() <= toTime);
      }
    }

    // Sort chronologically by eventTime (ascending)
    list.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    // Apply limit if specified
    if (limit && !isNaN(parseInt(limit, 10))) {
      const n = parseInt(limit, 10);
      if (n > 0) list = list.slice(0, n);
    }

    return list;
  }

  /**
   * Clear all records (useful for testing)
   */
  clear() {
    this.events.clear();
  }
}

export const economicCalendarService = new EconomicCalendarService();
