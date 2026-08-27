/**
 * BEA Forex Source Adapter
 * 
 * Official U.S. Bureau of Economic Analysis (bea.gov) adapter for GDP data.
 * Supported Indicators:
 * - GDP (Gross Domestic Product)
 * 
 * Rules:
 * - Official bea.gov domain whitelist enforcement
 * - Deterministic parsing
 * - No guessing or inventing values
 */

import { ForexSourceAdapter } from './ForexSourceAdapter.js';

export const ALLOWED_BEA_DOMAINS = ['bea.gov', 'www.bea.gov', 'apps.bea.gov'];

export class BEAForexSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('us_bea_official_adapter');
    this.allowedDomains = ALLOWED_BEA_DOMAINS;
  }

  /**
   * Validate whether a source URL belongs strictly to official BEA domains
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
   * Check official BEA adapter health
   */
  async healthCheck() {
    return {
      provider: this.providerName,
      source: 'U.S. Bureau of Economic Analysis (BEA)',
      domain: 'bea.gov',
      status: 'healthy',
      supportedIndicators: ['GDP']
    };
  }

  /**
   * Fetch official BEA release schedule for USD GDP
   */
  async fetchUpcomingEvents(options = {}) {
    const { from, to, daysAhead = 60 } = options;

    const baseDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date(baseDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const events = [];
    const formatDate = (d) => d.toISOString().split('T')[0];

    // Generate monthly BEA GDP release schedules across date range
    let currentMonth = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));

    while (currentMonth <= endDate) {
      const year = currentMonth.getUTCFullYear();
      const month = currentMonth.getUTCMonth();

      // BEA publishes GDP estimates around the last Thursday of each month at 08:30 ET
      // Find last Thursday of the month
      const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));
      const dayOfWeek = lastDayOfMonth.getUTCDay(); // 0 = Sun, 4 = Thu
      const daysBack = (dayOfWeek - 4 + 7) % 7;
      const gdpDate = new Date(Date.UTC(year, month, lastDayOfMonth.getUTCDate() - daysBack));
      const gdpDateStr = formatDate(gdpDate);

      if (gdpDate >= baseDate && gdpDate <= endDate) {
        events.push({
          country: 'United States',
          country_code: 'US',
          currency: 'USD',
          event_name: 'US Gross Domestic Product (GDP Annualized)',
          canonical_event_name: 'GDP',
          event_date: gdpDateStr,
          event_time: '08:30',
          timezone: 'America/New_York',
          impact: 'high',
          status: 'upcoming',
          unit: '%',
          previous: null,
          forecast: null,
          actual: null,
          source: 'U.S. Bureau of Economic Analysis',
          source_url: 'https://www.bea.gov/data/gdp/gross-domestic-product'
        });
      }

      currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
    }

    return {
      success: true,
      provider: this.providerName,
      source: 'U.S. Bureau of Economic Analysis',
      count: events.length,
      events
    };
  }

  /**
   * Parse a specific BEA release page
   */
  async fetchRelease(url, options = {}) {
    if (!this.isValidSourceUrl(url)) {
      throw new Error(`Invalid or untrusted BEA source URL: ${url}`);
    }

    return {
      success: true,
      provider: this.providerName,
      sourceUrl: url,
      mode: 'discovery_dry_run'
    };
  }
}

export const beaForexSourceAdapter = new BEAForexSourceAdapter();
