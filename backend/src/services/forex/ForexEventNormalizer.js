/**
 * Forex Event Normalizer
 * 
 * Normalizes raw Forex macroeconomic event names and payloads into canonical USD structures.
 * Phase 7.1 USD Foundation.
 */

export const SUPPORTED_USD_EVENTS = [
  'Non-Farm Payrolls',
  'Unemployment Rate',
  'CPI',
  'Core CPI',
  'PPI',
  'GDP',
  'Retail Sales',
  'Initial Jobless Claims',
  'FOMC Interest Rate Decision',
  'PCE',
  'Core PCE'
];

export class ForexEventNormalizer {
  constructor() {
    this.supportedUsdEvents = [...SUPPORTED_USD_EVENTS];
  }

  /**
   * Return list of supported USD canonical events
   */
  getSupportedUsdEvents() {
    return [...this.supportedUsdEvents];
  }

  /**
   * Normalize an incoming event name into one of the canonical USD event types.
   * Rejects unknown events with null (strictly no guessing or incorrect silent mapping).
   * 
   * @param {string} rawName
   * @returns {string|null} Canonical event name or null if unsupported
   */
  normalizeEventName(rawName) {
    if (!rawName || typeof rawName !== 'string') {
      return null;
    }

    const clean = rawName.trim().toLowerCase();
    if (clean.length === 0) return null;

    // 1. Non-Farm Payrolls (NFP)
    if (
      /\b(non[- ]?farm|nfp)\b/i.test(clean) &&
      !/private/i.test(clean) // Avoid confusing private payrolls with total headline NFP
    ) {
      return 'Non-Farm Payrolls';
    }

    // 2. Unemployment Rate
    if (
      /\bunemployment\s+rate\b/i.test(clean) ||
      clean === 'us unemployment rate' ||
      clean === 'civilian unemployment rate'
    ) {
      return 'Unemployment Rate';
    }

    // 3. Core CPI (Check Core CPI before headline CPI to prevent premature match)
    if (
      /core\s+(cpi|consumer\s+price)/i.test(clean) ||
      /cpi\s+ex(cluding)?\s+(food|energy)/i.test(clean)
    ) {
      return 'Core CPI';
    }

    // 4. CPI (Headline Consumer Price Index)
    if (
      /\b(cpi|consumer\s+price\s+index)\b/i.test(clean) &&
      !/core/i.test(clean)
    ) {
      return 'CPI';
    }

    // 5. PPI (Producer Price Index)
    if (
      /\b(ppi|producer\s+price\s+index)\b/i.test(clean)
    ) {
      return 'PPI';
    }

    // 6. GDP (Gross Domestic Product)
    if (
      /\b(gdp|gross\s+domestic\s+product)\b/i.test(clean)
    ) {
      return 'GDP';
    }

    // 7. Retail Sales
    if (
      /\bretail\s+sales\b/i.test(clean)
    ) {
      return 'Retail Sales';
    }

    // 8. Initial Jobless Claims
    if (
      /\b(initial\s+(jobless\s+)?claims|jobless\s+claims)\b/i.test(clean) &&
      !/continuing/i.test(clean) // Distinguish from continuing claims
    ) {
      return 'Initial Jobless Claims';
    }

    // 9. FOMC Interest Rate Decision
    if (
      /\b(fomc|fed)\b.*\b(rate|interest|funds)\b/i.test(clean) ||
      /\bfederal\s+funds\s+(target\s+)?rate\b/i.test(clean) ||
      /\bfed(eral\s+reserve)?\s+interest\s+rate\s+decision\b/i.test(clean) ||
      clean === 'fomc rate decision' ||
      clean === 'fomc interest rate decision'
    ) {
      return 'FOMC Interest Rate Decision';
    }

    // 10. Core PCE (Check Core PCE before headline PCE)
    if (
      /core\s+pce/i.test(clean) ||
      /pce\s+(price\s+index\s+)?ex(cluding)?\s+(food|energy)/i.test(clean) ||
      /core\s+personal\s+consumption/i.test(clean)
    ) {
      return 'Core PCE';
    }

    // 11. PCE (Personal Consumption Expenditures Price Index)
    if (
      /\bpce\b/i.test(clean) ||
      /personal\s+consumption\s+expenditures/i.test(clean) ||
      /personal\s+income\s+and\s+outlays/i.test(clean)
    ) {
      return 'PCE';
    }

    // Reject unrecognized events
    return null;
  }

  /**
   * Normalize a complete Forex event object into the canonical data model
   * 
   * @param {Object} rawEvent
   * @returns {Object|null}
   */
  normalizeForexEvent(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return null;
    }

    const rawName = rawEvent.event_name || rawEvent.name || rawEvent.title || '';
    const canonicalName = this.normalizeEventName(rawName);
    if (!canonicalName) {
      return null;
    }

    const currency = (rawEvent.currency || 'USD').toUpperCase().trim();
    const country = rawEvent.country || (currency === 'USD' ? 'United States' : rawEvent.country || '');
    const countryCode = rawEvent.country_code || (currency === 'USD' ? 'US' : '');

    return {
      country,
      country_code: countryCode,
      currency,
      event_name: rawName.trim(),
      canonical_event_name: canonicalName,
      event_date: rawEvent.event_date || rawEvent.date || null,
      event_time: rawEvent.event_time !== undefined && rawEvent.event_time !== null && String(rawEvent.event_time).trim() !== ''
        ? String(rawEvent.event_time).trim()
        : (rawEvent.time ? String(rawEvent.time).trim() : null),
      timezone: rawEvent.timezone || 'America/New_York',
      previous: rawEvent.previous !== undefined && rawEvent.previous !== null ? String(rawEvent.previous).trim() : null,
      forecast: rawEvent.forecast !== undefined && rawEvent.forecast !== null ? String(rawEvent.forecast).trim() : null,
      actual: rawEvent.actual !== undefined && rawEvent.actual !== null ? String(rawEvent.actual).trim() : null,
      unit: rawEvent.unit || null,
      impact: (rawEvent.impact || 'high').toLowerCase().trim(),
      status: (rawEvent.status || 'upcoming').toLowerCase().trim(),
      source: rawEvent.source || 'forex_source_adapter',
      source_url: rawEvent.source_url || null
    };
  }
}

export const forexEventNormalizer = new ForexEventNormalizer();
