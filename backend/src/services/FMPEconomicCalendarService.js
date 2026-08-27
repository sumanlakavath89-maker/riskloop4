/**
 * Financial Modeling Prep (FMP) Economic Calendar Service
 * Secure backend service to fetch, normalize, and cache macroeconomic events from FMP.
 * 
 * SECURITY:
 * FMP_API_KEY is read strictly from backend process.env and NEVER exposed to the frontend.
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure backend .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Country code to friendly name and currency mapping
const COUNTRY_META = {
  'US': { name: 'United States', currency: 'USD', flag: '🇺🇸' },
  'IN': { name: 'India', currency: 'INR', flag: '🇮🇳' },
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

class FMPEconomicCalendarService {
  constructor() {
    this.baseUrl = 'https://financialmodelingprep.com/api/v3';

    // In-memory cache: key -> { data, timestamp }
    this.cache = new Map();
    this.cacheTTLMs = 5 * 60 * 1000; // 5 minutes TTL to respect API limits

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 12000,
      headers: {
        'Accept': 'application/json',
      }
    });
  }

  /**
   * Check if FMP API Key is set in process.env
   */
  hasApiKey() {
    return Boolean(process.env.FMP_API_KEY && process.env.FMP_API_KEY.trim().length > 0);
  }

  /**
   * Helper: Format a Date object to YYYY-MM-DD in IST/Local timezone
   */
  _formatDate(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Calculate date range based on period name ('today', 'tomorrow', 'week', 'this-week')
   */
  _resolveDateRange(period, fromQuery, toQuery) {
    const now = new Date();

    if (fromQuery && toQuery) {
      return { from: fromQuery, to: toQuery };
    }

    if (period === 'today') {
      const todayStr = this._formatDate(now);
      return { from: todayStr, to: todayStr };
    }

    if (period === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = this._formatDate(tomorrow);
      return { from: tomorrowStr, to: tomorrowStr };
    }

    if (period === 'week' || period === 'this-week') {
      // Current day to 7 days ahead
      const todayStr = this._formatDate(now);
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const endStr = this._formatDate(endOfWeek);
      return { from: todayStr, to: endStr };
    }

    // Default: Today to 7 days ahead
    const fromStr = fromQuery || this._formatDate(now);
    const toDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const toStr = toQuery || this._formatDate(toDate);

    return { from: fromStr, to: toStr };
  }

  /**
   * Normalize an event record from FMP into RiskLoop standard format
   */
  _normalizeFMPEvent(raw, index) {
    const rawCountry = (raw.country || 'GLOBAL').toUpperCase().trim();
    const meta = COUNTRY_META[rawCountry] || {
      name: rawCountry,
      currency: 'USD',
      flag: '🌐'
    };

    // Parse date & time
    let dateStr = '—';
    let timeStr = '—';
    let isoEventTime = null;

    if (raw.date) {
      const parsedDate = new Date(raw.date);
      if (!isNaN(parsedDate.getTime())) {
        isoEventTime = parsedDate.toISOString();
        dateStr = this._formatDate(parsedDate);
        timeStr = parsedDate.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      } else if (typeof raw.date === 'string') {
        const parts = raw.date.split(' ');
        dateStr = parts[0] || '—';
        timeStr = parts[1] || '—';
        isoEventTime = raw.date;
      }
    }

    // Format impact
    let impact = 'Medium';
    if (raw.impact) {
      const imp = String(raw.impact).toLowerCase();
      if (imp.includes('high') || imp === '3') impact = 'High';
      else if (imp.includes('low') || imp === '1') impact = 'Low';
      else impact = 'Medium';
    }

    // Format value with unit if applicable
    const unit = raw.unit || '';
    const formatVal = (val) => {
      if (val === null || val === undefined || val === '') return '—';
      const num = parseFloat(val);
      if (isNaN(num)) return String(val);
      return unit ? `${num.toLocaleString('en-IN')}${unit}` : num.toLocaleString('en-IN');
    };

    const previousFormatted = formatVal(raw.previous);
    const forecastFormatted = formatVal(raw.estimate !== undefined ? raw.estimate : raw.forecast);
    const actualFormatted = formatVal(raw.actual);

    return {
      id: raw.id || `fmp-${rawCountry}-${dateStr}-${index}`,
      date: dateStr,
      time: timeStr,
      eventTime: isoEventTime || new Date().toISOString(),
      event: raw.event || 'Economic Event',
      country: meta.name,
      countryCode: rawCountry,
      countryFlag: meta.flag,
      currency: meta.currency,
      impact: impact,
      previous: previousFormatted,
      forecast: forecastFormatted,
      actual: actualFormatted,
      rawPrevious: raw.previous,
      rawForecast: raw.estimate !== undefined ? raw.estimate : raw.forecast,
      rawActual: raw.actual,
      unit: unit,
      change: raw.change,
      changePercentage: raw.changePercentage,
      source: 'FMP'
    };
  }

  /**
   * Fetch Economic Calendar events from FMP API
   */
  async getEconomicCalendar(options = {}) {
    const {
      period = 'week',
      from: fromQuery,
      to: toQuery,
      country,
      impact,
      limit = 50,
      forceRefresh = false
    } = options;

    const { from, to } = this._resolveDateRange(period, fromQuery, toQuery);
    const cacheKey = `${from}_${to}_${country || 'ALL'}_${impact || 'ALL'}_${limit}`;

    // 1. Check in-memory cache
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTLMs) {
        return {
          ...cached.data,
          cached: true
        };
      }
    }

    // 2. Check if API key is configured
    if (!this.hasApiKey()) {
      console.warn('[FMPEconomicCalendar] FMP_API_KEY is not configured in backend .env');
      return {
        success: false,
        status: 'KEY_NOT_CONFIGURED',
        isAvailable: false,
        source: 'FMP',
        message: 'FMP_API_KEY is not configured in backend .env. Please configure a valid Financial Modeling Prep API key.',
        dateRange: { from, to },
        timestamp: new Date().toISOString(),
        count: 0,
        events: []
      };
    }

    const apiKey = process.env.FMP_API_KEY.trim();

    try {
      // Make request to FMP economic_calendar endpoint
      const response = await this.httpClient.get('/economic_calendar', {
        params: {
          from,
          to,
          apikey: apiKey
        }
      });

      const rawData = response.data;

      // Handle cases where FMP returns an error or string message inside 200 OK
      if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        const errorMsg = rawData['Error Message'] || rawData.message || JSON.stringify(rawData);

        if (errorMsg.toLowerCase().includes('special endpoint') || errorMsg.toLowerCase().includes('premium') || errorMsg.toLowerCase().includes('plan')) {
          return {
            success: false,
            status: 'PLAN_RESTRICTED',
            isAvailable: false,
            source: 'FMP',
            message: 'Economic calendar endpoint is restricted on the current FMP plan. A subscription upgrade is required.',
            error: errorMsg,
            dateRange: { from, to },
            timestamp: new Date().toISOString(),
            count: 0,
            events: []
          };
        }

        if (errorMsg.toLowerCase().includes('invalid api key')) {
          return {
            success: false,
            status: 'UNAUTHORIZED',
            isAvailable: false,
            source: 'FMP',
            message: 'Invalid FMP API key configured in backend .env.',
            error: errorMsg,
            dateRange: { from, to },
            timestamp: new Date().toISOString(),
            count: 0,
            events: []
          };
        }

        throw new Error(errorMsg);
      }

      if (!Array.isArray(rawData)) {
        return {
          success: true,
          status: 'ACTIVE',
          isAvailable: true,
          source: 'FMP',
          message: 'No economic events found for the requested period.',
          dateRange: { from, to },
          timestamp: new Date().toISOString(),
          count: 0,
          events: []
        };
      }

      // Normalize all records
      let normalizedEvents = rawData.map((item, idx) => this._normalizeFMPEvent(item, idx));

      // Filter by country if specified
      if (country && country !== 'ALL') {
        const targetCountry = country.toUpperCase().trim();
        normalizedEvents = normalizedEvents.filter(e =>
          e.countryCode === targetCountry ||
          e.country.toUpperCase() === targetCountry
        );
      }

      // Filter by impact if specified
      if (impact && impact !== 'ALL') {
        const targetImpact = impact.toLowerCase().trim();
        normalizedEvents = normalizedEvents.filter(e => e.impact.toLowerCase() === targetImpact);
      }

      // Sort chronologically (ascending eventTime)
      normalizedEvents.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

      // Limit results
      if (limit && limit > 0) {
        normalizedEvents = normalizedEvents.slice(0, limit);
      }

      const result = {
        success: true,
        status: 'ACTIVE',
        isAvailable: true,
        source: 'FMP',
        dateRange: { from, to },
        timestamp: new Date().toISOString(),
        count: normalizedEvents.length,
        events: normalizedEvents
      };

      // Store in cache
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;

    } catch (err) {
      console.error('[FMPEconomicCalendar] API error:', err.message);

      let status = 'ERROR';
      let userMessage = 'Failed to fetch economic calendar from Financial Modeling Prep.';

      if (err.response) {
        const statusCode = err.response.status;
        const responseData = err.response.data;
        const errMsg = typeof responseData === 'object' ? (responseData['Error Message'] || responseData.message || '') : String(responseData);

        if (statusCode === 401) {
          status = 'UNAUTHORIZED';
          userMessage = 'Invalid FMP API key provided in backend .env.';
        } else if (statusCode === 402 || statusCode === 403 || errMsg.toLowerCase().includes('special endpoint') || errMsg.toLowerCase().includes('premium')) {
          status = 'PLAN_RESTRICTED';
          userMessage = 'The economic calendar endpoint is restricted on the current FMP plan.';
        } else if (statusCode === 429) {
          status = 'RATE_LIMITED';
          userMessage = 'FMP API rate limit reached. Please try again in a few minutes.';
        }
      }

      return {
        success: false,
        status,
        isAvailable: false,
        source: 'FMP',
        message: userMessage,
        error: err.message,
        dateRange: { from, to },
        timestamp: new Date().toISOString(),
        count: 0,
        events: []
      };
    }
  }
}

export const fmpEconomicCalendarService = new FMPEconomicCalendarService();
