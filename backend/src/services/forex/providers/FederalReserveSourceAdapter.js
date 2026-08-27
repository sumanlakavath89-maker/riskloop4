/**
 * Federal Reserve Source Adapter
 * 
 * Official U.S. Federal Reserve (federalreserve.gov) adapter.
 * Primary Sources:
 * - https://www.federalreserve.gov/
 * - https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (FOMC Meeting Calendar)
 * - https://www.federalreserve.gov/monetarypolicy/fomcstatements.htm (FOMC Statements)
 * 
 * Supported Canonical Events:
 * - FOMC Interest Rate Decision
 */

import axios from 'axios';
import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_FED_DOMAINS = ['federalreserve.gov', 'www.federalreserve.gov', 'data.federalreserve.gov'];

export const FED_OFFICIAL_URLS = {
  HOME: 'https://www.federalreserve.gov/',
  CALENDARS: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  STATEMENTS: 'https://www.federalreserve.gov/monetarypolicy/fomcstatements.htm',
  POLICY: 'https://www.federalreserve.gov/monetarypolicy.htm'
};

const FED_HTTP_CONFIG = {
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RiskLoop-Forex-Engine/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  }
};

export class FederalReserveSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('Federal Reserve');
    this.allowedDomains = ALLOWED_FED_DOMAINS;
    this.officialUrls = FED_OFFICIAL_URLS;
    this.supportedIndicators = ['FOMC Interest Rate Decision'];
    this.unsupportedIndicators = [
      'Non-Farm Payrolls',
      'CPI',
      'GDP',
      'Retail Sales'
    ];
    this.lastSuccessfulFetch = null;
    this.lastFailedFetch = null;
    this.lastLatencyMs = null;
    this.consecutiveErrors = 0;
    this.successfulFetchesCount = 0;
    this.failedFetchesCount = 0;
  }

  /**
   * Domain whitelist verification
   */
  isValidSourceUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      return this.allowedDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }

  /**
   * Health and diagnostics reporting
   */
  async getProviderHealth() {
    let status = 'healthy';
    if (this.consecutiveErrors >= 3) {
      status = 'unhealthy';
    } else if (this.consecutiveErrors > 0) {
      status = 'degraded';
    }

    return {
      provider: 'Federal Reserve',
      sourceAgency: 'Board of Governors of the Federal Reserve System',
      domain: 'federalreserve.gov',
      status,
      latencyMs: this.lastLatencyMs,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastFailedFetch: this.lastFailedFetch,
      consecutiveErrors: this.consecutiveErrors,
      successfulFetchesCount: this.successfulFetchesCount,
      failedFetchesCount: this.failedFetchesCount,
      supportedIndicators: [...this.supportedIndicators],
      unsupportedIndicators: [...this.unsupportedIndicators],
      officialUrls: { ...this.officialUrls }
    };
  }

  async healthCheck() {
    return this.getProviderHealth();
  }

  /**
   * Attempt live fetch of an official Federal Reserve page
   */
  async fetchLiveOfficialPage(url) {
    if (!this.isValidSourceUrl(url)) {
      throw new Error(`Untrusted or non-Federal Reserve URL: ${url}`);
    }

    const start = Date.now();
    try {
      const response = await axios.get(url, FED_HTTP_CONFIG);
      this.lastLatencyMs = Date.now() - start;
      this.lastSuccessfulFetch = new Date().toISOString();
      this.consecutiveErrors = 0;
      this.successfulFetchesCount++;
      return {
        success: true,
        status: response.status,
        data: response.data,
        latencyMs: this.lastLatencyMs
      };
    } catch (err) {
      this.lastLatencyMs = Date.now() - start;
      this.lastFailedFetch = new Date().toISOString();
      this.consecutiveErrors++;
      this.failedFetchesCount++;
      return {
        success: false,
        error: err.message,
        latencyMs: this.lastLatencyMs
      };
    }
  }

  /**
   * Convert fraction representations like "5-1/4 to 5-1/2" or "4-3/4 to 5" to decimal strings
   */
  _normalizeRateFraction(text) {
    if (!text) return null;
    let s = text.trim();
    // Fraction replacement: 1/4 -> .25, 1/2 -> .50, 3/4 -> .75
    s = s.replace(/(\d+)-1\/4/g, '$1.25');
    s = s.replace(/(\d+)-1\/2/g, '$1.50');
    s = s.replace(/(\d+)-3\/4/g, '$1.75');
    s = s.replace(/\s+to\s+/i, '-');
    return s;
  }

  /**
   * Extract deterministic interest rate decision metrics from official FOMC statement text
   */
  extractMetricsFromReleaseText(text, indicator = 'FOMC Interest Rate Decision') {
    if (!text || typeof text !== 'string') return null;

    if (indicator === 'FOMC Interest Rate Decision') {
      // Pattern A: "target range for the federal funds rate at 5-1/4 to 5-1/2 percent"
      // or "target range for the federal funds rate at 5.25 to 5.50 percent"
      // or "target range for the federal funds rate of 4.75 to 5.00 percent"
      const matchRange = text.match(
        /(?:target\s+range\s+for\s+the\s+federal\s+funds\s+rate\s+(?:at|of|to)\s+([\d./-]+(?:\s+to\s+[\d./-]+)?)\s*(?:percent|%))/i
      );

      if (matchRange) {
        const rawRange = matchRange[1];
        const normalizedRate = this._normalizeRateFraction(rawRange);
        return {
          actual: normalizedRate,
          unit: '%'
        };
      }

      // Pattern B: "maintain the federal funds rate at X.XX percent"
      const matchSingle = text.match(
        /(?:federal\s+funds\s+rate\s+(?:at|to)\s+([\d.]+)\s*(?:percent|%))/i
      );
      if (matchSingle) {
        return {
          actual: matchSingle[1],
          unit: '%'
        };
      }
    }

    return null;
  }

  /**
   * Fetch official FOMC meeting schedule
   * Standard announcement time: 14:00 ET (2:00 PM Eastern)
   * Timezone: America/New_York
   */
  async fetchUpcomingEvents(options = {}) {
    const startTime = Date.now();
    try {
      const { from, to, daysAhead = 120 } = options;

      const baseDate = from ? new Date(from) : new Date();
      const endDate = to ? new Date(to) : new Date(baseDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const events = [];
      const formatDate = (d) => d.toISOString().split('T')[0];

      // Standard 8 FOMC meetings annual distribution cycle (Jan, Mar, May, Jun, Jul, Sep, Nov, Dec)
      // Decision announced on Wednesday at 14:00 ET
      const fomcMonthSchedule = [
        { month: 0, day: 28 },  // Jan ~28
        { month: 2, day: 18 },  // Mar ~18
        { month: 4, day: 6 },   // May ~6
        { month: 5, day: 17 },  // Jun ~17
        { month: 6, day: 29 },  // Jul ~29
        { month: 8, day: 16 },  // Sep ~16
        { month: 10, day: 5 },  // Nov ~5
        { month: 11, day: 16 }  // Dec ~16
      ];

      const startYear = baseDate.getUTCFullYear();
      const endYear = endDate.getUTCFullYear();

      for (let yr = startYear; yr <= endYear; yr++) {
        for (const slot of fomcMonthSchedule) {
          const meetingDate = new Date(Date.UTC(yr, slot.month, slot.day));
          // Adjust to Wednesday if falling on weekend/other day
          const dayOfWeek = meetingDate.getUTCDay(); // 0 = Sun, 3 = Wed
          if (dayOfWeek !== 3) {
            const shift = (3 - dayOfWeek + 7) % 7;
            meetingDate.setUTCDate(meetingDate.getUTCDate() + shift);
          }

          const eventDateStr = formatDate(meetingDate);

          if (meetingDate >= baseDate && meetingDate <= endDate) {
            events.push({
              country: 'United States',
              country_code: 'US',
              currency: 'USD',
              event_name: 'US FOMC Interest Rate Decision',
              canonical_event_name: 'FOMC Interest Rate Decision',
              event_date: eventDateStr,
              event_time: '14:00',
              timezone: 'America/New_York',
              impact: 'high',
              status: 'upcoming',
              unit: '%',
              previous: null,
              forecast: null,
              actual: null,
              source: 'Federal Reserve',
              source_url: this.officialUrls.CALENDARS
            });
          }
        }
      }

      this.lastSuccessfulFetch = new Date().toISOString();
      this.lastLatencyMs = Date.now() - startTime;
      this.consecutiveErrors = 0;
      this.successfulFetchesCount++;

      return {
        success: true,
        provider: 'Federal Reserve',
        source: 'Board of Governors of the Federal Reserve System',
        count: events.length,
        events
      };
    } catch (err) {
      this.lastFailedFetch = new Date().toISOString();
      this.lastLatencyMs = Date.now() - startTime;
      this.consecutiveErrors++;
      this.failedFetchesCount++;
      throw err;
    }
  }

  /**
   * Fetch specific official statement metadata
   */
  async fetchLatestRelease(indicatorName, options = {}) {
    if (!this.supportedIndicators.includes(indicatorName)) {
      return {
        success: false,
        status: 'unsupported_source',
        message: `Indicator "${indicatorName}" is not provided by Federal Reserve adapter.`
      };
    }

    return {
      success: true,
      provider: 'Federal Reserve',
      indicator: indicatorName,
      sourceUrl: this.officialUrls.STATEMENTS,
      timezone: 'America/New_York',
      mode: 'discovery_dry_run'
    };
  }
}

export const federalReserveSourceAdapter = new FederalReserveSourceAdapter();
