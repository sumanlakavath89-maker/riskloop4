/**
 * India Calendar Schedule Service
 * 
 * Generates upcoming official Indian economic calendar events conforming strictly
 * to the Supabase economic_events schema:
 *   - event_name
 *   - country (India)
 *   - country_code (IN)
 *   - event_date (YYYY-MM-DD)
 *   - event_time (HH:MM:SS)
 *   - timezone (Asia/Kolkata)
 *   - impact (high | medium | low)
 *   - previous
 *   - forecast
 *   - actual (null for upcoming)
 *   - unit
 *   - source
 *   - source_url
 *   - status (upcoming)
 *   - description
 * 
 * Rules and official publication schedules are loaded from configuration.
 */

import { INDIA_ECONOMIC_EVENT_CONFIGS } from '../config/indiaEconomicScheduleConfig.js';

class IndiaCalendarScheduleService {
  constructor(configs = INDIA_ECONOMIC_EVENT_CONFIGS) {
    this.configs = configs;
  }

  /**
   * Helper: Get current date in Asia/Kolkata timezone as YYYY-MM-DD
   */
  getTodayIST() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  /**
   * Helper: Format Date object to YYYY-MM-DD in Asia/Kolkata
   */
  formatDateIST(date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  }

  /**
   * Helper: Roll date to Monday if it falls on Saturday (6) or Sunday (0)
   */
  rollWeekendToMonday(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = d.getUTCDay();

    if (dayOfWeek === 6) {
      // Saturday -> Add 2 days to Monday
      d.setUTCDate(d.getUTCDate() + 2);
    } else if (dayOfWeek === 0) {
      // Sunday -> Add 1 day to Monday
      d.setUTCDate(d.getUTCDate() + 1);
    }

    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /**
   * Helper: Calculate date range (default: today to today + daysAhead)
   */
  resolveRange(options = {}) {
    const todayStr = this.getTodayIST();
    const daysAhead = options.daysAhead ? parseInt(options.daysAhead, 10) : 90;

    const fromDate = options.from || todayStr;

    let toDate = options.to;
    if (!toDate) {
      const fromObj = new Date(fromDate + 'T00:00:00Z');
      const toObj = new Date(fromObj.getTime() + daysAhead * 24 * 60 * 60 * 1000);
      toDate = toObj.toISOString().split('T')[0];
    }

    return { fromDate, toDate, daysAhead };
  }

  /**
   * Generate scheduled events for a specific event configuration within [fromDate, toDate]
   */
  _generateEventsForConfig(cfg, fromDate, toDate) {
    const events = [];
    const seenDates = new Set();

    // 1. Process explicit official Advance Release Calendar dates first (CONFIRMED)
    if (Array.isArray(cfg.officialDates)) {
      for (const item of cfg.officialDates) {
        if (item.date >= fromDate && item.date <= toDate) {
          seenDates.add(item.date);
          events.push({
            event_name: cfg.eventName,
            country: cfg.country || 'India',
            country_code: cfg.countryCode || 'IN',
            event_date: item.date,
            event_time: item.time || cfg.defaultTime || '17:30:00',
            timezone: cfg.timezone || 'Asia/Kolkata',
            impact: cfg.impact || 'medium',
            previous: item.previous || null,
            forecast: item.forecast || null,
            actual: null,
            unit: cfg.unit || '%',
            source: cfg.source,
            source_url: item.sourceUrl || cfg.sourceUrl || null,
            status: 'upcoming',
            schedule_status: 'confirmed',
            schedule_source: 'official',
            schedule_verified_at: item.verifiedAt || null,
            description: item.period ? `${cfg.description} (${item.period})` : cfg.description
          });
        }
      }
    }

    // 2. Dynamic rule-based recurrence for dates not in officialDates (PROVISIONAL)
    if (cfg.recurrence && cfg.recurrence.frequency === 'monthly' && cfg.recurrence.dayOfMonth) {
      const fromYear = parseInt(fromDate.slice(0, 4), 10);
      const toYear = parseInt(toDate.slice(0, 4), 10);

      for (let y = fromYear; y <= toYear; y++) {
        for (let m = 1; m <= 12; m++) {
          const monthStr = String(m).padStart(2, '0');
          let eventDate = `${y}-${monthStr}-${String(cfg.recurrence.dayOfMonth).padStart(2, '0')}`;

          if (cfg.recurrence.rollWeekendToNextWorkingDay) {
            eventDate = this.rollWeekendToMonday(eventDate);
          }

          if (eventDate >= fromDate && eventDate <= toDate && !seenDates.has(eventDate)) {
            seenDates.add(eventDate);
            events.push({
              event_name: cfg.eventName,
              country: cfg.country || 'India',
              country_code: cfg.countryCode || 'IN',
              event_date: eventDate,
              event_time: cfg.defaultTime || '17:30:00',
              timezone: cfg.timezone || 'Asia/Kolkata',
              impact: cfg.impact || 'medium',
              previous: null,
              forecast: null,
              actual: null,
              unit: cfg.unit || '%',
              source: cfg.source,
              source_url: cfg.sourceUrl || null,
              status: 'upcoming',
              schedule_status: 'provisional',
              schedule_source: 'calculated',
              schedule_verified_at: null,
              description: cfg.description
            });
          }
        }
      }
    }

    return events;
  }

  /**
   * Generate all upcoming Indian economic calendar events for the next 90 days (or specified range)
   * 
   * @param {Object} options
   * @param {number} [options.daysAhead=90] Number of days to generate ahead (default 90)
   * @param {string} [options.from] Start date (YYYY-MM-DD)
   * @param {string} [options.to] End date (YYYY-MM-DD)
   * @param {string} [options.eventName] Filter by specific event name
   * @returns {Array} List of scheduled event objects matching Supabase economic_events schema
   */
  generateUpcomingEvents(options = {}) {
    const { fromDate, toDate, daysAhead } = this.resolveRange(options);
    const targetEventName = options.eventName ? options.eventName.toLowerCase().trim() : null;

    let allEvents = [];

    for (const cfg of this.configs) {
      if (targetEventName && cfg.eventName.toLowerCase() !== targetEventName) {
        continue;
      }

      const cfgEvents = this._generateEventsForConfig(cfg, fromDate, toDate);
      allEvents.push(...cfgEvents);
    }

    // Sort chronologically by date and time
    allEvents.sort((a, b) => {
      const dateTimeA = `${a.event_date}T${a.event_time}`;
      const dateTimeB = `${b.event_date}T${b.event_time}`;
      return dateTimeA.localeCompare(dateTimeB);
    });

    const confirmedCount = allEvents.filter(e => e.schedule_status === 'confirmed').length;
    const provisionalCount = allEvents.filter(e => e.schedule_status === 'provisional').length;

    return {
      success: true,
      count: allEvents.length,
      confirmedCount,
      provisionalCount,
      dateRange: {
        from: fromDate,
        to: toDate,
        daysAhead
      },
      events: allEvents
    };
  }
}

export const indiaCalendarScheduleService = new IndiaCalendarScheduleService();
