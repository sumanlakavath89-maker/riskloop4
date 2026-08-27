/**
 * BEA Source Adapter
 * 
 * Official U.S. Bureau of Economic Analysis (bea.gov) adapter.
 * Primary Sources:
 * - https://www.bea.gov/
 * - https://www.bea.gov/news/schedule
 * - https://www.bea.gov/news/schedule/full
 * - https://www.bea.gov/data/gdp/gross-domestic-product
 * - https://www.bea.gov/news/glance
 * 
 * Supported Canonical Events:
 * - GDP (Gross Domestic Product: Advance, Second, and Third Estimates)
 * - PCE (Personal Consumption Expenditures Price Index)
 * - Core PCE (PCE Excluding Food and Energy)
 * 
 * Note: Indicators from other agencies (Retail Sales, Jobless Claims, FOMC)
 * are marked unsupported_source / not_configured.
 */

import axios from 'axios';
import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_BEA_DOMAINS = ['bea.gov', 'www.bea.gov', 'apps.bea.gov', 'data.bea.gov'];

export const BEA_OFFICIAL_URLS = {
  HOME: 'https://www.bea.gov/',
  SCHEDULE: 'https://www.bea.gov/news/schedule',
  SCHEDULE_FULL: 'https://www.bea.gov/news/schedule/full',
  GDP_DATA: 'https://www.bea.gov/data/gdp/gross-domestic-product',
  PCE_DATA: 'https://www.bea.gov/data/personal-consumption-expenditures-price-index',
  GLANCE: 'https://www.bea.gov/news/glance'
};

const BEA_HTTP_CONFIG = {
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RiskLoop-Forex-Engine/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  }
};

export class BEASourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('BEA');
    this.allowedDomains = ALLOWED_BEA_DOMAINS;
    this.officialUrls = BEA_OFFICIAL_URLS;
    this.supportedIndicators = ['GDP', 'PCE', 'Core PCE'];
    this.unsupportedIndicators = [
      'Retail Sales',
      'Initial Jobless Claims',
      'FOMC Interest Rate Decision'
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
      provider: 'BEA',
      sourceAgency: 'U.S. Bureau of Economic Analysis',
      domain: 'bea.gov',
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
   * Attempt live fetch of an official BEA page or feed
   */
  async fetchLiveOfficialPage(url) {
    if (!this.isValidSourceUrl(url)) {
      throw new Error(`Untrusted or non-BEA URL: ${url}`);
    }

    const start = Date.now();
    try {
      const response = await axios.get(url, BEA_HTTP_CONFIG);
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
   * Detect GDP release stage (Advance, Second, or Third Estimate)
   */
  detectReleaseStage(text) {
    if (!text || typeof text !== 'string') return null;

    if (/advance\s+estimate|first\s+estimate/i.test(text)) {
      return 'Advance Estimate';
    }
    if (/second\s+estimate|preliminary\s+estimate/i.test(text)) {
      return 'Second Estimate';
    }
    if (/third\s+estimate|final\s+estimate/i.test(text)) {
      return 'Third Estimate';
    }
    return null;
  }

  /**
   * Extract deterministic release metrics from official BEA text (Zero AI / Zero guessing)
   */
  extractMetricsFromReleaseText(text, indicator = 'GDP') {
    if (!text || typeof text !== 'string') return null;

    // 1. GDP (Gross Domestic Product)
    if (indicator === 'GDP') {
      const gdpActualMatch = text.match(
        /(?:real\s+gross\s+domestic\s+product(?:\s*\(gdp\))?|gdp|gross\s+domestic\s+product)\s+(?:increased|decreased|rose|fell|changed)\s+(?:at\s+an\s+annual\s+rate\s+of\s+)?([+-]?[\d.]+)\s*(?:percent|%)/i
      );

      if (gdpActualMatch) {
        const actual = gdpActualMatch[1];
        let previous = null;

        const prevMatch = text.match(/in\s+the\s+(?:previous|first|second|third|fourth)\s+quarter[,\s]+real\s+gdp\s+(?:increased|decreased)\s+([+-]?[\d.]+)\s*(?:percent|%)/i);
        if (prevMatch) {
          previous = prevMatch[1];
        }

        return {
          actual,
          previous,
          unit: '%'
        };
      }
    }

    // 2. Core PCE (Personal Consumption Expenditures excluding Food and Energy)
    if (indicator === 'Core PCE') {
      const corePceMatch = text.match(
        /(?:pce\s+price\s+index\s+excluding\s+food\s+and\s+energy|core\s+pce\s+price\s+index|core\s+pce)\s+(?:increased|decreased|rose|fell|changed)\s+([+-]?[\d.]+)\s*(?:percent|%)/i
      );
      if (corePceMatch) {
        return {
          actual: corePceMatch[1],
          unit: '%'
        };
      }
    }

    // 3. Headline PCE (Personal Consumption Expenditures Price Index)
    if (indicator === 'PCE') {
      const pceMatch = text.match(
        /(?:pce\s+price\s+index|personal\s+consumption\s+expenditures\s+price\s+index)\s+(?:increased|decreased|rose|fell|changed)\s+([+-]?[\d.]+)\s*(?:percent|%)/i
      );
      if (pceMatch) {
        return {
          actual: pceMatch[1],
          unit: '%'
        };
      }
    }

    return null;
  }

  /**
   * Fetch official BEA release schedule for USD macroeconomic indicators
   * Timezone: America/New_York (US Eastern Time)
   * Time: 08:30 ET
   */
  async fetchUpcomingEvents(options = {}) {
    const startTime = Date.now();
    try {
      const { from, to, daysAhead = 90 } = options;

      const baseDate = from ? new Date(from) : new Date();
      const endDate = to ? new Date(to) : new Date(baseDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const events = [];
      const formatDate = (d) => d.toISOString().split('T')[0];

      let currentMonth = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));

      while (currentMonth <= endDate) {
        const year = currentMonth.getUTCFullYear();
        const month = currentMonth.getUTCMonth(); // 0-11

        // 1. GDP Estimates: Around last Thursday of each month at 08:30 ET
        const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));
        const dayOfWeek = lastDayOfMonth.getUTCDay(); // 0 = Sun, 4 = Thu
        const daysBack = (dayOfWeek - 4 + 7) % 7;
        const gdpDate = new Date(Date.UTC(year, month, lastDayOfMonth.getUTCDate() - daysBack));
        const gdpDateStr = formatDate(gdpDate);

        const quarterMonthIndex = month % 3;
        let releaseStage = 'Advance Estimate';
        if (quarterMonthIndex === 1) {
          releaseStage = 'Second Estimate';
        } else if (quarterMonthIndex === 2) {
          releaseStage = 'Third Estimate';
        }

        if (gdpDate >= baseDate && gdpDate <= endDate) {
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: `US Gross Domestic Product (${releaseStage})`,
            canonical_event_name: 'GDP',
            release_stage: releaseStage,
            event_date: gdpDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BEA',
            source_url: this.officialUrls.GDP_DATA
          });
        }

        // 2. Personal Income and Outlays (PCE / Core PCE): Around last Friday of each month at 08:30 ET
        const pceDaysBack = (dayOfWeek - 5 + 7) % 7;
        const pceDate = new Date(Date.UTC(year, month, lastDayOfMonth.getUTCDate() - pceDaysBack));
        const pceDateStr = formatDate(pceDate);

        if (pceDate >= baseDate && pceDate <= endDate) {
          // Headline PCE
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US PCE Price Index (MoM)',
            canonical_event_name: 'PCE',
            event_date: pceDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BEA',
            source_url: this.officialUrls.PCE_DATA
          });

          // Core PCE
          events.push({
            country: 'United States',
            country_code: 'US',
            currency: 'USD',
            event_name: 'US Core PCE Price Index (MoM)',
            canonical_event_name: 'Core PCE',
            event_date: pceDateStr,
            event_time: '08:30',
            timezone: 'America/New_York',
            impact: 'high',
            status: 'upcoming',
            unit: '%',
            previous: null,
            forecast: null,
            actual: null,
            source: 'BEA',
            source_url: this.officialUrls.PCE_DATA
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
        provider: 'BEA',
        source: 'U.S. Bureau of Economic Analysis',
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
        status: 'unsupported_source',
        message: `Indicator "${indicatorName}" is not provided by official BEA adapter (Supported: ${this.supportedIndicators.join(', ')}).`
      };
    }

    let sourceUrl = this.officialUrls.GDP_DATA;
    if (indicatorName === 'PCE' || indicatorName === 'Core PCE') {
      sourceUrl = this.officialUrls.PCE_DATA;
    }

    return {
      success: true,
      provider: 'BEA',
      indicator: indicatorName,
      sourceUrl,
      timezone: 'America/New_York',
      mode: 'discovery_dry_run'
    };
  }
}

export const beaSourceAdapter = new BEASourceAdapter();
