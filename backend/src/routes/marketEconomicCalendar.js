/**
 * Market Economic Calendar Route
 * Fetches macroeconomic events exclusively from official Indian government
 * and institutional sources (RBI, MoSPI, Ministry of Finance, DPIIT, PIB, NSE India).
 * 
 * Endpoint: GET /api/market/economic-calendar
 */

import { Router } from 'express';
import { indiaOfficialEconomicCalendarService } from '../services/IndiaOfficialEconomicCalendarService.js';

const router = Router();

// Country code to friendly name, currency, and flag mapping
const COUNTRY_META = {
  'IN': { name: 'India', currency: 'INR', flag: '🇮🇳' },
  'US': { name: 'United States', currency: 'USD', flag: '🇺🇸' },
  'EU': { name: 'Eurozone', currency: 'EUR', flag: '🇪🇺' },
  'GB': { name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
  'UK': { name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
  'JP': { name: 'Japan', currency: 'JPY', flag: '🇯🇵' },
  'CN': { name: 'China', currency: 'CNY', flag: '🇨🇳' },
  'CA': { name: 'Canada', currency: 'CAD', flag: '🇨🇦' },
  'AU': { name: 'Australia', currency: 'AUD', flag: '🇦🇺' },
  'NZ': { name: 'New Zealand', currency: 'NZD', flag: '🇳🇿' },
  'CH': { name: 'Switzerland', currency: 'CHF', flag: '🇨🇭' },
  'DE': { name: 'Germany', currency: 'EUR', flag: '🇩🇪' },
  'FR': { name: 'France', currency: 'EUR', flag: '🇫🇷' },
  'IT': { name: 'Italy', currency: 'EUR', flag: '🇮🇹' },
  'BR': { name: 'Brazil', currency: 'BRL', flag: '🇧🇷' },
  'RU': { name: 'Russia', currency: 'RUB', flag: '🇷🇺' },
  'KR': { name: 'South Korea', currency: 'KRW', flag: '🇰🇷' },
};

/**
 * Helper: Resolve date range based on period name or explicit queries in Asia/Kolkata timezone
 */
function resolveDateRange(period, fromQuery, toQuery) {
  if (fromQuery && toQuery) {
    return { from: fromQuery, to: toQuery };
  }
  if (fromQuery && !toQuery) {
    return { from: fromQuery, to: null };
  }
  if (!fromQuery && toQuery) {
    return { from: null, to: toQuery };
  }

  if (period === 'all') {
    return { from: null, to: null };
  }

  const now = new Date();
  const getISTDate = (d) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  };

  const todayStr = getISTDate(now);

  if (period === 'today') {
    return { from: todayStr, to: todayStr };
  }

  if (period === 'tomorrow') {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = getISTDate(tomorrow);
    return { from: tomorrowStr, to: tomorrowStr };
  }

  if (period === 'week' || period === 'this-week') {
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endStr = getISTDate(endOfWeek);
    return { from: todayStr, to: endStr };
  }

  return { from: null, to: null };
}

/**
 * Helper: Normalize a Supabase record into the frontend event schema
 */
function normalizeSupabaseEvent(raw, index) {
  const countryCode = (raw.country_code || 'IN').toUpperCase().trim();
  const meta = COUNTRY_META[countryCode] || {
    name: raw.country || countryCode,
    currency: 'INR',
    flag: '🇮🇳'
  };

  const dateStr = raw.event_date ? String(raw.event_date).split('T')[0] : '—';
  let timeStr = '—';
  let isoEventTime = null;

  if (raw.event_date) {
    if (raw.event_time) {
      timeStr = raw.event_time;
      const combined = `${dateStr}T${raw.event_time}`;
      const parsed = new Date(combined);
      isoEventTime = isNaN(parsed.getTime()) ? `${dateStr}T00:00:00.000Z` : parsed.toISOString();
    } else {
      isoEventTime = `${dateStr}T00:00:00.000Z`;
    }
  } else {
    isoEventTime = new Date().toISOString();
  }

  let impact = 'Medium';
  if (raw.impact) {
    const imp = String(raw.impact).toLowerCase();
    if (imp.includes('high') || imp === '3') impact = 'High';
    else if (imp.includes('low') || imp === '1') impact = 'Low';
    else impact = 'Medium';
  }

  const unit = raw.unit || '';
  const formatVal = (val) => {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') return '—';
    const str = String(val).trim();
    if (str === '—' || str === '' || str === 'null' || str === 'undefined') return '—';
    const num = parseFloat(str);
    if (isNaN(num)) return str;
    return unit && !str.includes(unit) ? `${num.toLocaleString('en-IN')}${unit}` : str;
  };

  return {
    id: raw.id || `supabase-${countryCode}-${dateStr}-${index}`,
    date: dateStr,
    time: timeStr,
    eventTime: isoEventTime,
    event: raw.event_name || 'Economic Event',
    country: raw.country || meta.name,
    countryCode: countryCode,
    countryFlag: meta.flag || '🇮🇳',
    currency: meta.currency || 'INR',
    impact: impact,
    previous: formatVal(raw.previous),
    forecast: formatVal(raw.forecast),
    actual: formatVal(raw.actual),
    rawPrevious: raw.previous,
    rawForecast: raw.forecast,
    rawActual: raw.actual,
    unit: unit,
    status: raw.status || 'upcoming',
    description: raw.description || null,
    source: raw.source || 'Supabase'
  };
}

/**
 * GET /api/market/economic-calendar
 * Query Parameters:
 *   ?period=today | tomorrow | week | this-week | all
 *   ?from=YYYY-MM-DD
 *   ?to=YYYY-MM-DD
 *   ?country=IN | US | ALL
 *   ?impact=high | medium | low
 *   ?limit=50
 *   ?refresh=true
 */
router.get('/', async (req, res) => {
  try {
    const {
      period = 'today',
      from,
      to,
      impact,
      limit,
      refresh
    } = req.query;

    const forceRefresh = refresh === 'true' || refresh === '1';
    const parsedLimit = limit ? parseInt(limit, 10) : 50;

    const result = await indiaOfficialEconomicCalendarService.getEconomicCalendar({
      period,
      from,
      to,
      impact,
      limit: parsedLimit,
      forceRefresh
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error('[MarketEconomicCalendarRoute] Error processing official economic calendar:', err);
    return res.status(500).json({
      success: false,
      status: 'SERVER_ERROR',
      isAvailable: false,
      source: 'Official Indian Government & Institutional Sources',
      error: 'Failed to retrieve official economic calendar',
      message: err.message,
      events: []
    });
  }
});

import { globalEconomicCalendarService } from '../services/forex/GlobalEconomicCalendarService.js';

/**
 * GET /api/market/economic-calendar/global
 * Unified multi-currency macroeconomic calendar endpoint (INR, USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY)
 * 
 * Query Parameters:
 *   ?currencies=INR,USD,EUR,GBP,JPY or ALL
 *   ?countries=IN,US,EU,GB,JP or ALL
 *   ?from=YYYY-MM-DD
 *   ?to=YYYY-MM-DD
 *   ?impact=high | medium | low | ALL
 *   ?status=upcoming | released | ALL
 *   ?search=CPI
 *   ?userTimezone=Asia/Kolkata | UTC | America/New_York | etc.
 *   ?page=1
 *   ?limit=50
 *   ?sortBy=date | impact | currency | country
 *   ?sortDirection=asc | desc
 */
router.get('/global', async (req, res) => {
  try {
    const {
      period,
      currencies,
      currency,
      countries,
      country,
      countryCode,
      from,
      to,
      impact,
      status,
      search,
      userTimezone,
      page,
      limit,
      sortBy,
      sortDirection
    } = req.query;

    const result = await globalEconomicCalendarService.getGlobalEvents({
      period,
      currencies: currencies || currency,
      countries: countries || country || countryCode,
      from,
      to,
      impact,
      status,
      search,
      userTimezone,
      page,
      limit,
      sortBy,
      sortDirection
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[MarketEconomicCalendarRoute] Global events query error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve global economic calendar',
      message: err.message,
      events: []
    });
  }
});

export default router;

