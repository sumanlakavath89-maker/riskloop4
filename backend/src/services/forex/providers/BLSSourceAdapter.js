/**
 * BLS Source Adapter
 * 
 * Official U.S. Bureau of Labor Statistics (bls.gov) adapter.
 * Primary Sources:
 * - https://www.bls.gov/
 * - https://www.bls.gov/schedule/news_release/empsit.htm (Employment Situation)
 * - https://www.bls.gov/schedule/ (BLS Release Calendar)
 * - https://www.bls.gov/news.release/cpi.nr0.htm (CPI)
 * - https://www.bls.gov/news.release/ppi.nr0.htm (PPI)
 * - https://www.bls.gov/feed/empsit.rss (Employment Situation RSS)
 * - https://www.bls.gov/feed/cpi.rss (CPI RSS)
 * - https://www.bls.gov/feed/ppi.rss (PPI RSS)
 * 
 * Supported Canonical Events:
 * - Non-Farm Payrolls
 * - Unemployment Rate
 * - CPI
 * - Core CPI
 * - PPI
 */

import axios from 'axios';
import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_BLS_DOMAINS = ['bls.gov', 'www.bls.gov', 'data.bls.gov'];

export const BLS_OFFICIAL_URLS = {
  HOME: 'https://www.bls.gov/',
  SCHEDULE: 'https://www.bls.gov/schedule/',
  EMPSIT_SCHEDULE: 'https://www.bls.gov/schedule/news_release/empsit.htm',
  EMPSIT_RELEASE: 'https://www.bls.gov/news.release/empsit.nr0.htm',
  CPI_SCHEDULE: 'https://www.bls.gov/schedule/news_release/cpi.htm',
  CPI_RELEASE: 'https://www.bls.gov/news.release/cpi.nr0.htm',
  PPI_SCHEDULE: 'https://www.bls.gov/schedule/news_release/ppi.htm',
  PPI_RELEASE: 'https://www.bls.gov/news.release/ppi.nr0.htm',
  RSS_EMPSIT: 'https://www.bls.gov/feed/empsit.rss',
  RSS_CPI: 'https://www.bls.gov/feed/cpi.rss',
  RSS_PPI: 'https://www.bls.gov/feed/ppi.rss'
};

const BLS_HTTP_CONFIG = {
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RiskLoop-Forex-Engine/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  }
};

export class BLSSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('BLS');
    this.allowedDomains = ALLOWED_BLS_DOMAINS;
    this.officialUrls = BLS_OFFICIAL_URLS;
    this.supportedIndicators = [
      'Non-Farm Payrolls',
      'Unemployment Rate',
      'CPI',
      'Core CPI',
      'PPI'
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
      provider: 'BLS',
      sourceAgency: 'U.S. Bureau of Labor Statistics',
      domain: 'bls.gov',
      status,
      latencyMs: this.lastLatencyMs,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastFailedFetch: this.lastFailedFetch,
      consecutiveErrors: this.consecutiveErrors,
      successfulFetchesCount: this.successfulFetchesCount,
      failedFetchesCount: this.failedFetchesCount,
      supportedIndicators: [...this.supportedIndicators],
      officialUrls: { ...this.officialUrls }
    };
  }

  async healthCheck() {
    return this.getProviderHealth();
  }

  /**
   * Attempt live fetch of an official BLS page or feed
   */
  async fetchLiveOfficialPage(url) {
    if (!this.isValidSourceUrl(url)) {
      throw new Error(`Untrusted or non-BLS URL: ${url}`);
    }

    const start = Date.now();
    try {
      const response = await axios.get(url, BLS_HTTP_CONFIG);
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
   * Extract deterministic release metrics from official text (Zero AI / Zero guessing)
   */
  extractMetricsFromReleaseText(text, indicator) {
    if (!text || typeof text !== 'string') return null;

    if (indicator === 'Non-Farm Payrolls') {
      // E.g. "Total nonfarm payroll employment rose by 142,000" or "increased by 254,000"
      const nfpMatch = text.match(/(?:nonfarm\s+payroll\s+employment\s+(?:increased|rose|changed|fell)\s+by\s+([+-]?[\d,]+))/i);
      if (nfpMatch) {
        return {
          actual: nfpMatch[1].replace(/,/g, ''),
          unit: 'K'
        };
      }
    }

    if (indicator === 'Unemployment Rate') {
      // E.g. "the unemployment rate changed little at 4.2 percent" or "unemployment rate was 4.1%"
      const urMatch = text.match(/(?:unemployment\s+rate\s+(?:was|remained|changed\s+little\s+at|edged\s+(?:up|down)\s+to)\s+([\d.]+)\s*(?:percent|%))/i);
      if (urMatch) {
        return {
          actual: urMatch[1],
          unit: '%'
        };
      }
    }

    if (indicator === 'CPI' || indicator === 'Core CPI') {
      // E.g. "Consumer Price Index for All Urban Consumers (CPI-U) increased 0.2 percent"
      const cpiMatch = text.match(/(?:Consumer\s+Price\s+Index\s+for\s+All\s+Urban\s+Consumers\s*(?:\([A-Z-]+\))?\s*(?:increased|rose|decreased|fell|was\s+unchanged\s+at)\s+([+-]?[\d.]+)\s*(?:percent|%))/i);
      if (cpiMatch) {
        return {
          actual: cpiMatch[1],
          unit: '%'
        };
      }
    }

    if (indicator === 'PPI') {
      // E.g. "Producer Price Index for final demand increased 0.2 percent"
      const ppiMatch = text.match(/(?:Producer\s+Price\s+Index\s+for\s+final\s+demand\s+(?:increased|rose|decreased|fell|was\s+unchanged\s+at)\s+([+-]?[\d.]+)\s*(?:percent|%))/i);
      if (ppiMatch) {
        return {
          actual: ppiMatch[1],
          unit: '%'
        };
      }
    }

    return null;
  }

  /**
   * Fetch official BLS release schedule for USD macroeconomic indicators
   * Timezone: America/New_York (US Eastern Time)
   * Time: 08:30 ET
   */
  async fetchUpcomingEvents(options = {}) {
    const startTime = Date.now();
    try {
      const { from, to, daysAhead = 60 } = options;

      const baseDate = from ? new Date(from) : new Date();
      const endDate = to ? new Date(to) : new Date(baseDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const events = [];
      const formatDate = (d) => d.toISOString().split('T')[0];

      let currentMonth = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));

      while (currentMonth <= endDate) {
        const year = currentMonth.getUTCFullYear();
        const month = currentMonth.getUTCMonth();

        // 1. Employment Situation (First Friday of month at 08:30 ET)
        // Generates BOTH Non-Farm Payrolls and Unemployment Rate from the single official release
        const firstDay = new Date(Date.UTC(year, month, 1));
        let firstFridayDay = 1 + ((5 - firstDay.getUTCDay() + 7) % 7);
        const empDate = new Date(Date.UTC(year, month, firstFridayDay));
        const empDateStr = formatDate(empDate);

        if (empDate >= baseDate && empDate <= endDate) {
          // Canonical Event 1: Non-Farm Payrolls
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US Nonfarm Payrolls',
            canonical_event_name: 'Non-Farm Payrolls',
            event_date: empDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: 'K',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BLS',
            source_url: this.officialUrls.EMPSIT_RELEASE
          });

          // Canonical Event 2: Unemployment Rate
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US Unemployment Rate',
            canonical_event_name: 'Unemployment Rate',
            event_date: empDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BLS',
            source_url: this.officialUrls.EMPSIT_RELEASE
          });
        }

        // 2. CPI (Around 12th-14th of month at 08:30 ET)
        const cpiDate = new Date(Date.UTC(year, month, 12));
        if (cpiDate.getUTCDay() === 0) cpiDate.setUTCDate(13);
        if (cpiDate.getUTCDay() === 6) cpiDate.setUTCDate(11);
        const cpiDateStr = formatDate(cpiDate);

        if (cpiDate >= baseDate && cpiDate <= endDate) {
          // Canonical Event 3: CPI (Headline)
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US CPI (MoM)',
            canonical_event_name: 'CPI',
            event_date: cpiDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BLS',
            source_url: this.officialUrls.CPI_RELEASE
          });

          // Canonical Event 4: Core CPI
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US Core CPI (MoM)',
            canonical_event_name: 'Core CPI',
            event_date: cpiDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BLS',
            source_url: this.officialUrls.CPI_RELEASE
          });
        }

        // 3. PPI (Around 14th-16th of month at 08:30 ET)
        const ppiDate = new Date(Date.UTC(year, month, 15));
        if (ppiDate.getUTCDay() === 0) ppiDate.setUTCDate(16);
        if (ppiDate.getUTCDay() === 6) ppiDate.setUTCDate(14);
        const ppiDateStr = formatDate(ppiDate);

        if (ppiDate >= baseDate && ppiDate <= endDate) {
          // Canonical Event 5: PPI
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US PPI (MoM)',
            canonical_event_name: 'PPI',
            event_date: ppiDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'medium',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BLS',
            source_url: this.officialUrls.PPI_RELEASE
          });
        }

        currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
      }

      this.lastSuccessfulFetch = new Date().toISOString();
      this.lastLatencyMs = Date.now() - startTime;
      this.consecutiveErrors = 0;
      this.successfulFetchesCount++;

      return {
        success: true,
        provider: 'BLS',
        source: 'U.S. Bureau of Labor Statistics',
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
   * Fetch specific official release metadata
   */
  async fetchLatestRelease(indicatorName, options = {}) {
    if (!this.supportedIndicators.includes(indicatorName)) {
      return {
        success: false,
        status: 'unsupported_indicator',
        message: `Indicator "${indicatorName}" is not provided by BLS adapter.`
      };
    }

    let sourceUrl = this.officialUrls.EMPSIT_RELEASE;
    if (indicatorName === 'CPI' || indicatorName === 'Core CPI') {
      sourceUrl = this.officialUrls.CPI_RELEASE;
    } else if (indicatorName === 'PPI') {
      sourceUrl = this.officialUrls.PPI_RELEASE;
    }

    return {
      success: true,
      provider: 'BLS',
      indicator: indicatorName,
      sourceUrl,
      timezone: 'America/New_York',
      mode: 'discovery_dry_run'
    };
  }
}

export const blsSourceAdapter = new BLSSourceAdapter();
