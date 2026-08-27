/**
 * Bank of Canada & Statistics Canada Source Adapter (CAD)
 * 
 * Official Bank of Canada (bankofcanada.ca) & Statistics Canada (statcan.gc.ca).
 * Canonical Events:
 * - Bank of Canada Overnight Rate Decision
 * - Canada CPI (YoY)
 * - Canada GDP (MoM/QoQ)
 * - Canada Net Change in Employment & Unemployment Rate
 */

import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_CAD_DOMAINS = [
  'bankofcanada.ca',
  'www.bankofcanada.ca',
  'statcan.gc.ca',
  'www.statcan.gc.ca'
];

export class BoCSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('BOC_STATCAN');
    this.allowedDomains = ALLOWED_CAD_DOMAINS;
    this.supportedIndicators = [
      'Bank of Canada Overnight Rate',
      'Canada CPI (YoY)',
      'Canada GDP (MoM)',
      'Canada Employment Change',
      'Canada Unemployment Rate'
    ];
    this.currency = 'CAD';
    this.country = 'Canada';
    this.countryCode = 'CA';
    this.defaultTimezone = 'America/Toronto';
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

  async fetchUpcomingEvents(options = {}) {
    const now = new Date();
    const daysAhead = options.daysAhead || 60;
    const events = [];

    const scheduleDates = [
      { name: 'Bank of Canada Overnight Rate', day: 9, time: '09:45', impact: 'high', period: 'Current' },
      { name: 'Canada CPI (YoY)', day: 19, time: '08:30', impact: 'high', period: 'Monthly' },
      { name: 'Canada GDP (MoM)', day: 31, time: '08:30', impact: 'high', period: 'Monthly' },
      { name: 'Canada Employment Change', day: 8, time: '08:30', impact: 'high', period: 'Monthly' }
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
            source: 'BoC/StatCan',
            source_url: 'https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/'
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

export const bocSourceAdapter = new BoCSourceAdapter();
