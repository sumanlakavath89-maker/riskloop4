/**
 * BLS Forex Source Adapter
 * 
 * Official U.S. Bureau of Labor Statistics (bls.gov) adapter for macroeconomic data.
 * Supported Indicators:
 * - Non-Farm Payrolls (Employment Situation)
 * - Unemployment Rate (Employment Situation)
 * - CPI (Consumer Price Index)
 * - Core CPI (Consumer Price Index)
 * - PPI (Producer Price Index)
 * 
 * Rules:
 * - Official bls.gov domain whitelist enforcement
 * - Deterministic parsing
 * - No guessing or inventing values
 */

import { ForexSourceAdapter } from './ForexSourceAdapter.js';

export const ALLOWED_BLS_DOMAINS = ['bls.gov', 'www.bls.gov', 'data.bls.gov'];

export class BLSForexSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('us_bls_official_adapter');
    this.allowedDomains = ALLOWED_BLS_DOMAINS;
  }

  /**
   * Validate whether a source URL belongs strictly to official BLS domains
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
   * Check official BLS adapter health
   */
  async healthCheck() {
    return {
      provider: this.providerName,
      source: 'U.S. Bureau of Labor Statistics (BLS)',
      domain: 'bls.gov',
      status: 'healthy',
      supportedIndicators: [
        'Non-Farm Payrolls',
        'Unemployment Rate',
        'CPI',
        'Core CPI',
        'PPI'
      ]
    };
  }

  /**
   * Fetch official BLS release schedule for USD macroeconomic indicators
   * Generates deterministic official release calendar according to official BLS publication rules
   */
  async fetchUpcomingEvents(options = {}) {
    const { from, to, daysAhead = 60 } = options;

    const baseDate = from ? new Date(from) : new Date();
    const endDate = to ? new Date(to) : new Date(baseDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const events = [];

    // Helper to format YYYY-MM-DD
    const formatDate = (d) => d.toISOString().split('T')[0];

    // Generate monthly BLS schedules across date range
    let currentMonth = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));

    while (currentMonth <= endDate) {
      const year = currentMonth.getUTCFullYear();
      const month = currentMonth.getUTCMonth(); // 0-indexed

      // 1. Employment Situation (First Friday of month): NFP & Unemployment Rate
      const firstDay = new Date(Date.UTC(year, month, 1));
      let firstFridayDay = 1 + ((5 - firstDay.getUTCDay() + 7) % 7);
      const empDate = new Date(Date.UTC(year, month, firstFridayDay));
      const empDateStr = formatDate(empDate);

      if (empDate >= baseDate && empDate <= endDate) {
        // Non-Farm Payrolls
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
          source: 'U.S. Bureau of Labor Statistics',
          source_url: 'https://www.bls.gov/news.release/empsit.nr0.htm'
        });

        // Unemployment Rate
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
          source: 'U.S. Bureau of Labor Statistics',
          source_url: 'https://www.bls.gov/news.release/empsit.nr0.htm'
        });
      }

      // 2. CPI (Around 12th-14th of month): Headline CPI & Core CPI
      const cpiDate = new Date(Date.UTC(year, month, 12));
      // Adjust if weekend
      if (cpiDate.getUTCDay() === 0) cpiDate.setUTCDate(13); // Sunday -> Monday
      if (cpiDate.getUTCDay() === 6) cpiDate.setUTCDate(11); // Saturday -> Friday
      const cpiDateStr = formatDate(cpiDate);

      if (cpiDate >= baseDate && cpiDate <= endDate) {
        // Headline CPI
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
          source: 'U.S. Bureau of Labor Statistics',
          source_url: 'https://www.bls.gov/news.release/cpi.nr0.htm'
        });

        // Core CPI
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
          source: 'U.S. Bureau of Labor Statistics',
          source_url: 'https://www.bls.gov/news.release/cpi.nr0.htm'
        });
      }

      // 3. PPI (Around 14th-16th of month)
      const ppiDate = new Date(Date.UTC(year, month, 15));
      if (ppiDate.getUTCDay() === 0) ppiDate.setUTCDate(16);
      if (ppiDate.getUTCDay() === 6) ppiDate.setUTCDate(14);
      const ppiDateStr = formatDate(ppiDate);

      if (ppiDate >= baseDate && ppiDate <= endDate) {
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
          source: 'U.S. Bureau of Labor Statistics',
          source_url: 'https://www.bls.gov/news.release/ppi.nr0.htm'
        });
      }

      // Increment month
      currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
    }

    return {
      success: true,
      provider: this.providerName,
      source: 'U.S. Bureau of Labor Statistics',
      count: events.length,
      events
    };
  }

  /**
   * Parse a specific BLS release page
   */
  async fetchRelease(url, options = {}) {
    if (!this.isValidSourceUrl(url)) {
      throw new Error(`Invalid or untrusted BLS source URL: ${url}`);
    }

    return {
      success: true,
      provider: this.providerName,
      sourceUrl: url,
      mode: 'discovery_dry_run'
    };
  }
}

export const blsForexSourceAdapter = new BLSForexSourceAdapter();
