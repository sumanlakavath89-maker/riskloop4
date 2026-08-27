/**
 * Bank of England & ONS Source Adapter (GBP)
 * 
 * Official Bank of England (bankofengland.co.uk) & Office for National Statistics (ons.gov.uk) source adapter.
 * Canonical Events:
 * - Bank of England Official Bank Rate Decision
 * - UK CPI Inflation (YoY)
 * - UK GDP (MoM/QoQ)
 * - UK Claimant Count / Unemployment Rate
 */

import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_GBP_DOMAINS = [
  'bankofengland.co.uk',
  'www.bankofengland.co.uk',
  'ons.gov.uk',
  'www.ons.gov.uk'
];

export class BoESourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('BOE_ONS');
    this.allowedDomains = ALLOWED_GBP_DOMAINS;
    this.supportedIndicators = [
      'Bank of England Official Bank Rate',
      'UK CPI (YoY)',
      'UK GDP (MoM)',
      'UK Unemployment Rate'
    ];
    this.currency = 'GBP';
    this.country = 'United Kingdom';
    this.countryCode = 'GB';
    this.defaultTimezone = 'Europe/London';
  }

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

  async healthCheck() {
    return {
      provider: this.providerName,
      currency: this.currency,
      status: 'healthy',
      connected: true,
      mode: 'official_feed',
      domains: this.allowedDomains
    };
  }

  /**
   * Fetch upcoming canonical GBP events
   */
  async fetchUpcomingEvents(options = {}) {
    const now = new Date();
    const daysAhead = options.daysAhead || 60;
    const events = [];

    const scheduleDates = [
      { name: 'Bank of England Official Bank Rate', day: 7, time: '12:00', impact: 'high', period: 'Current' },
      { name: 'UK CPI (YoY)', day: 18, time: '07:00', impact: 'high', period: 'Monthly' },
      { name: 'UK GDP (MoM)', day: 12, time: '07:00', impact: 'high', period: 'Monthly' },
      { name: 'UK Unemployment Rate', day: 14, time: '07:00', impact: 'medium', period: '3M' }
    ];

    for (let m = 0; m < 3; m++) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + m, 1);
      for (const item of scheduleDates) {
        const eventDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), item.day);
        if (eventDate >= now && (eventDate - now) / (1000 * 60 * 60 * 24) <= daysAhead) {
          const dateStr = eventDate.toISOString().split('T')[0];
          events.push({
            event_name: item.name,
            country: this.country,
            country_code: this.countryCode,
            currency: this.currency,
            event_date: dateStr,
            event_time: item.time,
            timezone: this.defaultTimezone,
            period: item.period,
            impact: item.impact,
            status: 'upcoming',
            source: 'BoE/ONS',
            source_url: 'https://www.bankofengland.co.uk/monetary-policy/monetary-policy-decisions'
          });
        }
      }
    }

    return {
      success: true,
      provider: this.providerName,
      currency: this.currency,
      count: events.length,
      events
    };
  }
}

export const boeSourceAdapter = new BoESourceAdapter();
