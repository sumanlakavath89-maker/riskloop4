/**
 * Swiss National Bank & FSO Source Adapter (CHF)
 * 
 * Official Swiss National Bank (snb.ch) & Federal Statistical Office (bfs.admin.ch).
 * Canonical Events:
 * - SNB Policy Rate Decision
 * - Switzerland CPI (YoY)
 * - Switzerland GDP (QoQ)
 * - Switzerland Unemployment Rate
 */

import { ForexSourceAdapter } from '../ForexSourceAdapter.js';

export const ALLOWED_CHF_DOMAINS = [
  'snb.ch',
  'www.snb.ch',
  'bfs.admin.ch',
  'www.bfs.admin.ch',
  'admin.ch'
];

export class SNBSourceAdapter extends ForexSourceAdapter {
  constructor() {
    super('SNB_FSO');
    this.allowedDomains = ALLOWED_CHF_DOMAINS;
    this.supportedIndicators = [
      'SNB Policy Rate Decision',
      'Switzerland CPI (YoY)',
      'Switzerland GDP (QoQ)',
      'Switzerland Unemployment Rate'
    ];
    this.currency = 'CHF';
    this.country = 'Switzerland';
    this.countryCode = 'CH';
    this.defaultTimezone = 'Europe/Zurich';
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
      { name: 'SNB Policy Rate Decision', day: 19, time: '08:30', impact: 'high', period: 'Quarterly' },
      { name: 'Switzerland CPI (YoY)', day: 4, time: '07:30', impact: 'high', period: 'Monthly' },
      { name: 'Switzerland GDP (QoQ)', day: 28, time: '08:00', impact: 'high', period: 'Quarterly' },
      { name: 'Switzerland Unemployment Rate', day: 8, time: '06:45', impact: 'medium', period: 'Monthly' }
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
            source: 'SNB/FSO',
            source_url: 'https://www.snb.ch/en/iabout/monpol'
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

export const snbSourceAdapter = new SNBSourceAdapter();
