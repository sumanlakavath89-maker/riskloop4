/* ============================================================
   FOREX MARKET MODULE — RiskLoop
   Handles Forex Economic Calendar, 24-Hour Trading Sessions,
   Session Overlaps (London-New York highlight), and Forex Rates.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     FOREX ECONOMIC CALENDAR — OFFICIAL SOVEREIGN SOURCES
     Major Currencies: USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, NZD, INR
     ============================================================ */

  const CURRENCY_FLAGS = {
    INR: '🇮🇳',
    USD: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    AUD: '🇦🇺',
    CAD: '🇨🇦',
    CHF: '🇨🇭',
    CNY: '🇨🇳',
    NZD: '🇳🇿'
  };

  let currentForexPeriod = 'today';
  let currentCurrencyFilter = 'ALL';
  let forexTimezoneMode = 'IST'; // 'IST' or 'UTC'
  let liveForexCalendarState = {
    events: [],
    status: 'IDLE',
    message: '',
    isAvailable: false
  };
  let isForexCalendarLoading = false;

  /* ============================================================
     FOREX SESSIONS CONFIGURATION
     Times in UTC (24-hour format)
     ============================================================ */

  const SESSIONS = [
    {
      id: 'sydney',
      name: 'Sydney',
      city: 'Sydney, Australia',
      flag: '🇦🇺',
      openUTC: 22, // 22:00 UTC
      closeUTC: 7, // 07:00 UTC
      openMinUTC: 22 * 60,
      closeMinUTC: 7 * 60,
      openIST: '03:30',
      closeIST: '12:30',
      currencies: ['AUD', 'NZD'],
      color: '#10B981',
      accentClass: 'session-sydney'
    },
    {
      id: 'tokyo',
      name: 'Tokyo',
      city: 'Tokyo, Japan (Asian)',
      flag: '🇯🇵',
      openUTC: 0, // 00:00 UTC
      closeUTC: 9, // 09:00 UTC
      openMinUTC: 0,
      closeMinUTC: 9 * 60,
      openIST: '05:30',
      closeIST: '14:30',
      currencies: ['JPY', 'AUD', 'NZD'],
      color: '#8B5CF6',
      accentClass: 'session-tokyo'
    },
    {
      id: 'london',
      name: 'London',
      city: 'London, UK (European)',
      flag: '🇬🇧',
      openUTC: 8, // 08:00 UTC
      closeUTC: 17, // 17:00 UTC
      openMinUTC: 8 * 60,
      closeMinUTC: 17 * 60,
      openIST: '13:30',
      closeIST: '22:30',
      currencies: ['GBP', 'EUR', 'CHF'],
      color: '#3B82F6',
      accentClass: 'session-london'
    },
    {
      id: 'newyork',
      name: 'New York',
      city: 'New York, US (North American)',
      flag: '🇺🇸',
      openUTC: 13, // 13:00 UTC
      closeUTC: 22, // 22:00 UTC
      openMinUTC: 13 * 60,
      closeMinUTC: 22 * 60,
      openIST: '18:30',
      closeIST: '03:30',
      currencies: ['USD', 'CAD'],
      color: '#F59E0B',
      accentClass: 'session-newyork'
    }
  ];

  /* Major Overlaps */
  const OVERLAPS = [
    {
      id: 'london-newyork',
      name: 'London – New York Overlap',
      openUTC: 13,
      closeUTC: 17,
      openMinUTC: 13 * 60,
      closeMinUTC: 17 * 60,
      openIST: '18:30',
      closeIST: '22:30',
      badge: '⚡ Peak Market Liquidity',
      description: 'The highest volume window in global finance. Over 70% of all forex transactions occur during this 4-hour window with lowest spreads on EUR/USD, GBP/USD, and USD pairs.',
      isPrimary: true
    },
    {
      id: 'tokyo-london',
      name: 'Tokyo – London Overlap',
      openUTC: 8,
      closeUTC: 9,
      openMinUTC: 8 * 60,
      closeMinUTC: 9 * 60,
      openIST: '13:30',
      closeIST: '14:30',
      badge: '🌍 Asia–Europe Handover',
      description: 'Transition window as European traders open positions while Asian markets close.',
      isPrimary: false
    },
    {
      id: 'sydney-tokyo',
      name: 'Sydney – Tokyo Overlap',
      openUTC: 0,
      closeUTC: 7,
      openMinUTC: 0,
      closeMinUTC: 7 * 60,
      openIST: '05:30',
      closeIST: '12:30',
      badge: '🌏 Asia-Pacific Session',
      description: 'Major liquidity for AUD/USD, NZD/USD, and JPY cross pairs across Asian trading desks.',
      isPrimary: false
    }
  ];

  /* Forex Majors Rates Mock */
  const FOREX_MAJORS = [
    { pair: 'EUR/USD', name: 'Euro / US Dollar', rate: '1.0924', change: '+0.34%', positive: true, spread: '0.8', high: '1.0945', low: '1.0890' },
    { pair: 'GBP/USD', name: 'British Pound / US Dollar', rate: '1.2862', change: '+0.52%', positive: true, spread: '1.1', high: '1.2890', low: '1.2815' },
    { pair: 'USD/JPY', name: 'US Dollar / Japanese Yen', rate: '154.38', change: '-0.42%', positive: false, spread: '0.9', high: '155.10', low: '154.12' },
    { pair: 'AUD/USD', name: 'Australian Dollar / US Dollar', rate: '0.6685', change: '+0.28%', positive: true, spread: '1.2', high: '0.6710', low: '0.6655' },
    { pair: 'USD/CAD', name: 'US Dollar / Canadian Dollar', rate: '1.3670', change: '-0.15%', positive: false, spread: '1.3', high: '1.3710', low: '1.3650' },
    { pair: 'USD/CHF', name: 'US Dollar / Swiss Franc', rate: '0.8655', change: '-0.21%', positive: false, spread: '1.4', high: '0.8690', low: '0.8640' },
    { pair: 'NZD/USD', name: 'New Zealand / US Dollar', rate: '0.6042', change: '+0.19%', positive: true, spread: '1.5', high: '0.6075', low: '0.6020' },
    { pair: 'EUR/GBP', name: 'Euro / British Pound', rate: '0.8493', change: '-0.18%', positive: false, spread: '1.2', high: '0.8520', low: '0.8480' }
  ];

  /* State */
  let sessionUpdateInterval = null;

  /* ============================================================
     TIME HELPER FUNCTIONS
     ============================================================ */

  function getNowUTC() {
    const d = new Date();
    const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    return {
      hours: d.getUTCHours(),
      minutes: d.getUTCMinutes(),
      seconds: d.getUTCSeconds(),
      totalMinutes: totalMin,
      day: d.getUTCDay(),
      dateObj: d
    };
  }

  function getNowIST() {
    const d = new Date();
    const istOffset = 5.5 * 60; // 330 minutes
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    let istMin = (utcMin + istOffset) % 1440;
    const hours = Math.floor(istMin / 60);
    const minutes = Math.floor(istMin % 60);
    return {
      hours,
      minutes,
      seconds: d.getUTCSeconds(),
      totalMinutes: istMin
    };
  }

  function isWeekendNow() {
    const d = new Date();
    const localDay = d.getDay(); // 0 = Sunday, 6 = Saturday
    const utcDay = d.getUTCDay();
    return localDay === 0 || localDay === 6 || utcDay === 0 || utcDay === 6;
  }

  function isSessionOpen(session, nowMinUTC) {
    // Weekend override: Saturday and Sunday are ALWAYS closed
    if (isWeekendNow()) return false;

    if (session.openMinUTC < session.closeMinUTC) {
      return nowMinUTC >= session.openMinUTC && nowMinUTC < session.closeMinUTC;
    } else {
      // Crosses midnight UTC (e.g. Sydney 22:00 -> 07:00)
      return nowMinUTC >= session.openMinUTC || nowMinUTC < session.closeMinUTC;
    }
  }

  function getSessionTimeRemaining(session, nowMinUTC) {
    if (isWeekendNow()) {
      return { isOpen: false, text: 'Market Closed (Weekend)', mins: 0 };
    }

    const isOpen = isSessionOpen(session, nowMinUTC);
    if (isOpen) {
      // Minutes until close
      let diff;
      if (session.openMinUTC < session.closeMinUTC) {
        diff = session.closeMinUTC - nowMinUTC;
      } else {
        if (nowMinUTC >= session.openMinUTC) {
          diff = (1440 - nowMinUTC) + session.closeMinUTC;
        } else {
          diff = session.closeMinUTC - nowMinUTC;
        }
      }
      const h = Math.floor(diff / 60);
      const m = Math.floor(diff % 60);
      return { isOpen: true, text: `Closes in ${h}h ${m}m`, mins: diff };
    } else {
      // Minutes until open
      let diff;
      if (nowMinUTC < session.openMinUTC) {
        diff = session.openMinUTC - nowMinUTC;
      } else {
        diff = (1440 - nowMinUTC) + session.openMinUTC;
      }
      const h = Math.floor(diff / 60);
      const m = Math.floor(diff % 60);
      return { isOpen: false, text: `Opens in ${h}h ${m}m`, mins: diff };
    }
  }

  function isOverlapActive(overlap, nowMinUTC) {
    // Weekend override: Saturday and Sunday are ALWAYS closed
    if (isWeekendNow()) return false;

    if (overlap.openMinUTC < overlap.closeMinUTC) {
      return nowMinUTC >= overlap.openMinUTC && nowMinUTC < overlap.closeMinUTC;
    } else {
      return nowMinUTC >= overlap.openMinUTC || nowMinUTC < overlap.closeMinUTC;
    }
  }

  /* ============================================================
     FOREX ECONOMIC CALENDAR COMPONENT — LIVE OFFICIAL SOURCES
     ============================================================ */

  async function fetchLiveForexCalendar(period = 'today', currency = 'ALL', forceRefresh = false) {
    const backendBase = (typeof window !== 'undefined' && window.API_BASE_URL) || '';
    try {
      const params = new URLSearchParams();
      if (period && period !== 'all') params.set('period', period);
      else if (period === 'all') params.set('period', 'all');
      if (currency && currency !== 'ALL') params.set('currencies', currency);
      if (forceRefresh) params.set('refresh', 'true');

      const url = `${backendBase}/api/market/economic-calendar/global?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
      const errJson = await response.json().catch(() => null);
      return {
        success: false,
        status: errJson?.status || 'HTTP_ERROR',
        message: errJson?.message || `HTTP ${response.status}: Failed to load live Forex calendar`,
        events: []
      };
    } catch (err) {
      console.warn('[ForexMarket] Failed to fetch global economic calendar from backend:', err.message);
      return {
        success: false,
        status: 'NETWORK_ERROR',
        message: 'Could not connect to RiskLoop global economic calendar service.',
        events: []
      };
    }
  }

  function initForexEconomicCalendar() {
    console.log('Forex calendar initializing');
    const periodButtons = document.querySelectorAll('#forexCalendarPeriodTabs .calendar-tab');
    const currencyButtons = document.querySelectorAll('#forexCurrencyFilters .forex-curr-btn');
    const viewAllBtn = document.getElementById('viewAllForexCalendarBtn');
    const tzToggleBtn = document.getElementById('forexCalendarTzToggle');

    // Period buttons (Today / Tomorrow / This Week)
    periodButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const period = btn.getAttribute('data-period');
        if (period === currentForexPeriod) return;

        periodButtons.forEach(b => b.classList.remove('calendar-tab-active'));
        btn.classList.add('calendar-tab-active');

        currentForexPeriod = period;
        loadForexCalendarData(currentForexPeriod, currentCurrencyFilter);
      });
    });

    // Currency filter buttons
    currencyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const curr = btn.getAttribute('data-currency');
        if (curr === currentCurrencyFilter) return;

        currencyButtons.forEach(b => b.classList.remove('forex-curr-btn-active'));
        btn.classList.add('forex-curr-btn-active');

        currentCurrencyFilter = curr;
        loadForexCalendarData(currentForexPeriod, currentCurrencyFilter);
      });
    });

    // Timezone Toggle (IST / UTC)
    if (tzToggleBtn) {
      tzToggleBtn.addEventListener('click', () => {
        forexTimezoneMode = forexTimezoneMode === 'IST' ? 'UTC' : 'IST';
        tzToggleBtn.textContent = `Time: ${forexTimezoneMode}`;
        const timeHeader = document.getElementById('forexCalTimeHeader');
        if (timeHeader) {
          timeHeader.textContent = `Time (${forexTimezoneMode})`;
        }
        renderForexCalendar();
      });
    }

    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        currentForexPeriod = 'all';
        periodButtons.forEach(b => b.classList.remove('calendar-tab-active'));
        loadForexCalendarData('all', currentCurrencyFilter);
      });
    }

    // Initial load from backend
    loadForexCalendarData(currentForexPeriod, currentCurrencyFilter);
  }

  async function loadForexCalendarData(period = currentForexPeriod, currency = currentCurrencyFilter, forceRefresh = false) {
    console.log('Loading Forex calendar data');
    const tableBody = document.getElementById('forexCalendarTableBody');
    const navDate = document.getElementById('forexCalendarNavDate');
    if (!tableBody) return;

    if (navDate) {
      const titles = {
        today: 'Today',
        tomorrow: 'Tomorrow',
        week: 'This Week',
        all: 'All Sovereign Releases'
      };
      navDate.textContent = titles[period] || 'Official Releases';
    }

    if (isForexCalendarLoading) return;
    isForexCalendarLoading = true;

    // Loading State
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="calendar-loading" style="padding: 32px 20px; text-align: center;">
          <div class="loading-spinner" style="margin: 0 auto 10px;"></div>
          <span>Loading official sovereign macroeconomic releases...</span>
        </td>
      </tr>
    `;

    try {
      const response = await fetchLiveForexCalendar(period, currency, forceRefresh);
      liveForexCalendarState = response;
      renderForexCalendar();
    } catch (err) {
      console.error('[ForexMarket] Error loading forex calendar:', err);
      liveForexCalendarState = {
        success: false,
        status: 'CLIENT_ERROR',
        message: 'Unable to display official forex calendar events.',
        events: []
      };
      renderForexCalendar();
    } finally {
      isForexCalendarLoading = false;
    }
  }

  function renderForexCalendar() {
    const tableBody = document.getElementById('forexCalendarTableBody');
    if (!tableBody) return;

    const events = Array.isArray(liveForexCalendarState?.events) ? liveForexCalendarState.events : [];
    const message = liveForexCalendarState?.message || '';

    // Error State
    if (!liveForexCalendarState?.success && events.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="calendar-loading" style="padding: 34px 20px; text-align: center;">
            <div style="color: var(--text); font-size: 14px; font-weight: 600; margin-bottom: 6px;">Official Forex Calendar Notice</div>
            <div style="margin: 0 auto 14px; font-size: 12px; color: var(--text-muted); max-width: 520px; line-height: 1.4;">${message || 'Official global economic data is currently refreshing.'}</div>
            <button class="jbtn-ghost jbtn-sm" id="retryForexCalendarBtn" style="margin: 0 auto; padding: 4px 14px; font-size: 12px; cursor: pointer;">
              Refresh Data
            </button>
          </td>
        </tr>
      `;

      const retryBtn = document.getElementById('retryForexCalendarBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadForexCalendarData(currentForexPeriod, currentCurrencyFilter, true));
      }
      return;
    }

    // Empty State
    if (events.length === 0) {
      const targetLabel = currentCurrencyFilter === 'ALL' ? 'selected major currencies' : currentCurrencyFilter;
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="calendar-loading" style="padding: 32px 20px; text-align: center;">
            <div style="color: var(--text); font-size: 13px; font-weight: 600;">No Official Releases Scheduled</div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">No official sovereign announcements scheduled for ${targetLabel} in this timeframe.</div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = events.map(evt => {
      const flag = CURRENCY_FLAGS[evt.currency] || evt.flag || '🌐';
      const timeStr = forexTimezoneMode === 'UTC' ? (evt.timeUTC || '12:30 UTC') : (evt.timeIST || evt.time || '18:00 IST');
      const impactClass = `impact-${(evt.impact || 'medium').toLowerCase()}`;
      const impactLabel = (evt.impact || 'medium').toUpperCase();

      let actualVal = (evt.actual !== null && evt.actual !== undefined && evt.actual !== '') ? String(evt.actual) : '—';
      let actualStyle = '';
      if (actualVal !== '—') {
        actualStyle = 'color: var(--accent); font-weight:700;';
      }

      const sourceName = evt.sourceName || evt.source || 'Official Source';
      const sourceUrl = evt.sourceUrl || 'https://www.bis.org';

      return `
        <tr>
          <td class="cal-col-date">
            <span class="cal-date-badge">${evt.date || evt.scheduledDate || '—'}</span>
          </td>
          <td class="cal-col-time">
            <span class="cal-time">${timeStr}</span>
          </td>
          <td class="cal-col-event">
            <div class="cal-event-cell">
              <span class="cal-event-title">${evt.event || evt.eventName || '—'}</span>
              <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
                <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="cal-source-pill" title="Click to verify release on official ${sourceName} portal">
                  🏛️ ${evt.source || sourceName} ↗
                </a>
                ${evt.unit && evt.unit !== '%' ? `<span style="font-size:9.5px;color:var(--text-muted);font-family:monospace;">${evt.unit}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="cal-col-country">
            <div class="cal-country">
              <span class="cal-country-flag">${flag}</span>
              <span style="font-weight:600; font-family:'IBM Plex Mono', monospace;">${evt.currency}</span>
            </div>
          </td>
          <td class="cal-col-impact">
            <span class="impact-badge ${impactClass}">${impactLabel}</span>
          </td>
          <td class="cal-col-previous cal-value-cell">${evt.previous || '—'}</td>
          <td class="cal-col-forecast cal-value-cell">${evt.forecast || '—'}</td>
          <td class="cal-col-actual cal-value-cell" style="${actualStyle}">${actualVal}</td>
        </tr>
      `;
    }).join('');
  }

  /* ============================================================
     FOREX TRADING SESSIONS & OVERLAPS COMPONENT
     ============================================================ */

  function initForexTradingSessions() {
    updateForexSessionsUI();

    if (sessionUpdateInterval) {
      clearInterval(sessionUpdateInterval);
    }
    sessionUpdateInterval = setInterval(updateForexSessionsUI, 1000);
  }

  function updateForexSessionsUI() {
    const nowUTC = getNowUTC();
    const nowIST = getNowIST();
    const nowMinUTC = nowUTC.totalMinutes;

    // 1. Clocks
    const utcClock = document.getElementById('forexClockUTC');
    const istClock = document.getElementById('forexClockIST');
    const sessionStatusBadge = document.getElementById('forexActiveStatusSummary');

    if (utcClock) {
      utcClock.textContent = `${String(nowUTC.hours).padStart(2, '0')}:${String(nowUTC.minutes).padStart(2, '0')}:${String(nowUTC.seconds).padStart(2, '0')} UTC`;
    }
    if (istClock) {
      istClock.textContent = `${String(nowIST.hours).padStart(2, '0')}:${String(nowIST.minutes).padStart(2, '0')} IST`;
    }

    // 2. Determine open sessions
    const openSessions = SESSIONS.filter(s => isSessionOpen(s, nowMinUTC));
    const activeOverlap = OVERLAPS.find(o => isOverlapActive(o, nowMinUTC));

    if (sessionStatusBadge) {
      if (activeOverlap) {
        sessionStatusBadge.className = 'forex-market-status-badge badge-overlap';
        sessionStatusBadge.innerHTML = `
          <span class="pulse-dot"></span>
          <span>${activeOverlap.badge} ACTIVE (${activeOverlap.name})</span>
        `;
      } else if (openSessions.length > 0) {
        sessionStatusBadge.className = 'forex-market-status-badge badge-open';
        sessionStatusBadge.innerHTML = `
          <span class="pulse-dot"></span>
          <span>${openSessions.length} Session${openSessions.length > 1 ? 's' : ''} Open (${openSessions.map(s => s.name).join(', ')})</span>
        `;
      } else {
        sessionStatusBadge.className = 'forex-market-status-badge badge-closed';
        sessionStatusBadge.innerHTML = `<span>Market Quiet / Off-Hours</span>`;
      }
    }

    // 3. Render Session Cards
    renderSessionCards(nowMinUTC);

    // 4. Render 24-Hour Timeline Bar & Needle
    renderTimelineNeedle(nowMinUTC);

    // 5. Update Overlaps Highlight Banner
    renderOverlapsBanner(nowMinUTC);
  }

  function renderSessionCards(nowMinUTC) {
    const container = document.getElementById('forexSessionCardsGrid');
    if (!container) return;

    container.innerHTML = SESSIONS.map(session => {
      const open = isSessionOpen(session, nowMinUTC);
      const timerInfo = getSessionTimeRemaining(session, nowMinUTC);
      const statusBadge = open
        ? `<span class="session-card-status status-open"><span class="pulse-dot-sm"></span> OPEN</span>`
        : `<span class="session-card-status status-closed">CLOSED</span>`;

      const cardClass = open ? 'forex-session-card card-open' : 'forex-session-card card-closed';

      return `
        <div class="${cardClass}">
          <div class="session-card-top">
            <div class="session-card-identity">
              <span class="session-flag">${session.flag}</span>
              <div>
                <h3 class="session-name">${session.name}</h3>
                <span class="session-city">${session.city}</span>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div class="session-card-times">
            <div class="time-block">
              <span class="time-label">Local (IST)</span>
              <span class="time-val">${session.openIST} – ${session.closeIST}</span>
            </div>
            <div class="time-block">
              <span class="time-label">UTC</span>
              <span class="time-val">${String(session.openUTC).padStart(2, '0')}:00 – ${String(session.closeUTC).padStart(2, '0')}:00</span>
            </div>
          </div>

          <div class="session-card-bottom">
            <div class="session-timer ${open ? 'timer-open' : 'timer-closed'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${timerInfo.text}</span>
            </div>
            <div class="session-currencies">
              ${session.currencies.map(c => `<span class="currency-tag">${c}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTimelineNeedle(nowMinUTC) {
    const needle = document.getElementById('forexTimelineNeedle');
    const label = document.getElementById('forexTimelineNeedleLabel');
    if (!needle) return;

    const percent = Math.max(0, Math.min(100, (nowMinUTC / 1440) * 100));
    needle.style.left = `${percent}%`;

    if (label) {
      const h = Math.floor(nowMinUTC / 60);
      const m = Math.floor(nowMinUTC % 60);
      label.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} UTC`;
    }
  }

  function renderOverlapsBanner(nowMinUTC) {
    const londonNyOverlap = OVERLAPS.find(o => o.id === 'london-newyork');
    const isLondonNyActive = isOverlapActive(londonNyOverlap, nowMinUTC);

    const overlapCard = document.getElementById('forexLondonNyCard');
    const liveIndicator = document.getElementById('londonNyLiveBadge');

    if (overlapCard) {
      if (isLondonNyActive) {
        overlapCard.classList.add('overlap-card-active');
      } else {
        overlapCard.classList.remove('overlap-card-active');
      }
    }

    if (liveIndicator) {
      liveIndicator.hidden = !isLondonNyActive;
    }
  }

  /* ============================================================
     FOREX PAIR CORRELATIONS MODULE
     ============================================================ */

  const CORRELATION_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/JPY'];

  const CORRELATION_DATA = {
    '1D': {
      'EUR/USD': { 'EUR/USD': 1.00, 'GBP/USD': 0.86, 'USD/JPY': -0.34, 'USD/CHF': -0.94, 'AUD/USD': 0.78, 'USD/CAD': -0.76, 'NZD/USD': 0.73, 'EUR/JPY': 0.65 },
      'GBP/USD': { 'EUR/USD': 0.86, 'GBP/USD': 1.00, 'USD/JPY': -0.28, 'USD/CHF': -0.89, 'AUD/USD': 0.81, 'USD/CAD': -0.71, 'NZD/USD': 0.77, 'EUR/JPY': 0.58 },
      'USD/JPY': { 'EUR/USD': -0.34, 'GBP/USD': -0.28, 'USD/JPY': 1.00, 'USD/CHF': 0.48, 'AUD/USD': -0.22, 'USD/CAD': 0.39, 'NZD/USD': -0.19, 'EUR/JPY': 0.82 },
      'USD/CHF': { 'EUR/USD': -0.94, 'GBP/USD': -0.89, 'USD/JPY': 0.48, 'USD/CHF': 1.00, 'AUD/USD': -0.79, 'USD/CAD': 0.78, 'NZD/USD': -0.74, 'EUR/JPY': -0.42 },
      'AUD/USD': { 'EUR/USD': 0.78, 'GBP/USD': 0.81, 'USD/JPY': -0.22, 'USD/CHF': -0.79, 'AUD/USD': 1.00, 'USD/CAD': -0.72, 'NZD/USD': 0.91, 'EUR/JPY': 0.59 },
      'USD/CAD': { 'EUR/USD': -0.76, 'GBP/USD': -0.71, 'USD/JPY': 0.39, 'USD/CHF': 0.78, 'AUD/USD': -0.72, 'USD/CAD': 1.00, 'NZD/USD': -0.69, 'EUR/JPY': -0.36 },
      'NZD/USD': { 'EUR/USD': 0.73, 'GBP/USD': 0.77, 'USD/JPY': -0.19, 'USD/CHF': -0.74, 'AUD/USD': 0.91, 'USD/CAD': -0.69, 'NZD/USD': 1.00, 'EUR/JPY': 0.54 },
      'EUR/JPY': { 'EUR/USD': 0.65, 'GBP/USD': 0.58, 'USD/JPY': 0.82, 'USD/CHF': -0.42, 'AUD/USD': 0.59, 'USD/CAD': -0.36, 'NZD/USD': 0.54, 'EUR/JPY': 1.00 }
    },
    '1W': {
      'EUR/USD': { 'EUR/USD': 1.00, 'GBP/USD': 0.88, 'USD/JPY': -0.31, 'USD/CHF': -0.92, 'AUD/USD': 0.75, 'USD/CAD': -0.79, 'NZD/USD': 0.70, 'EUR/JPY': 0.62 },
      'GBP/USD': { 'EUR/USD': 0.88, 'GBP/USD': 1.00, 'USD/JPY': -0.25, 'USD/CHF': -0.87, 'AUD/USD': 0.83, 'USD/CAD': -0.74, 'NZD/USD': 0.79, 'EUR/JPY': 0.60 },
      'USD/JPY': { 'EUR/USD': -0.31, 'GBP/USD': -0.25, 'USD/JPY': 1.00, 'USD/CHF': 0.44, 'AUD/USD': -0.18, 'USD/CAD': 0.42, 'NZD/USD': -0.15, 'EUR/JPY': 0.85 },
      'USD/CHF': { 'EUR/USD': -0.92, 'GBP/USD': -0.87, 'USD/JPY': 0.44, 'USD/CHF': 1.00, 'AUD/USD': -0.76, 'USD/CAD': 0.81, 'NZD/USD': -0.71, 'EUR/JPY': -0.38 },
      'AUD/USD': { 'EUR/USD': 0.75, 'GBP/USD': 0.83, 'USD/JPY': -0.18, 'USD/CHF': -0.76, 'AUD/USD': 1.00, 'USD/CAD': -0.70, 'NZD/USD': 0.93, 'EUR/JPY': 0.61 },
      'USD/CAD': { 'EUR/USD': -0.79, 'GBP/USD': -0.74, 'USD/JPY': 0.42, 'USD/CHF': 0.81, 'AUD/USD': -0.70, 'USD/CAD': 1.00, 'NZD/USD': -0.66, 'EUR/JPY': -0.32 },
      'NZD/USD': { 'EUR/USD': 0.70, 'GBP/USD': 0.79, 'USD/JPY': -0.15, 'USD/CHF': -0.71, 'AUD/USD': 0.93, 'USD/CAD': -0.66, 'NZD/USD': 1.00, 'EUR/JPY': 0.57 },
      'EUR/JPY': { 'EUR/USD': 0.62, 'GBP/USD': 0.60, 'USD/JPY': 0.85, 'USD/CHF': -0.38, 'AUD/USD': 0.61, 'USD/CAD': -0.32, 'NZD/USD': 0.57, 'EUR/JPY': 1.00 }
    },
    '1M': {
      'EUR/USD': { 'EUR/USD': 1.00, 'GBP/USD': 0.84, 'USD/JPY': -0.40, 'USD/CHF': -0.95, 'AUD/USD': 0.73, 'USD/CAD': -0.82, 'NZD/USD': 0.68, 'EUR/JPY': 0.59 },
      'GBP/USD': { 'EUR/USD': 0.84, 'GBP/USD': 1.00, 'USD/JPY': -0.35, 'USD/CHF': -0.85, 'AUD/USD': 0.79, 'USD/CAD': -0.76, 'NZD/USD': 0.75, 'EUR/JPY': 0.55 },
      'USD/JPY': { 'EUR/USD': -0.40, 'GBP/USD': -0.35, 'USD/JPY': 1.00, 'USD/CHF': 0.52, 'AUD/USD': -0.28, 'USD/CAD': 0.45, 'NZD/USD': -0.24, 'EUR/JPY': 0.88 },
      'USD/CHF': { 'EUR/USD': -0.95, 'GBP/USD': -0.85, 'USD/JPY': 0.52, 'USD/CHF': 1.00, 'AUD/USD': -0.74, 'USD/CAD': 0.84, 'NZD/USD': -0.69, 'EUR/JPY': -0.35 },
      'AUD/USD': { 'EUR/USD': 0.73, 'GBP/USD': 0.79, 'USD/JPY': -0.28, 'USD/CHF': -0.74, 'AUD/USD': 1.00, 'USD/CAD': -0.68, 'NZD/USD': 0.90, 'EUR/JPY': 0.56 },
      'USD/CAD': { 'EUR/USD': -0.82, 'GBP/USD': -0.76, 'USD/JPY': 0.45, 'USD/CHF': 0.84, 'AUD/USD': -0.68, 'USD/CAD': 1.00, 'NZD/USD': -0.64, 'EUR/JPY': -0.30 },
      'NZD/USD': { 'EUR/USD': 0.68, 'GBP/USD': 0.75, 'USD/JPY': -0.24, 'USD/CHF': -0.69, 'AUD/USD': 0.90, 'USD/CAD': -0.64, 'NZD/USD': 1.00, 'EUR/JPY': 0.52 },
      'EUR/JPY': { 'EUR/USD': 0.59, 'GBP/USD': 0.55, 'USD/JPY': 0.88, 'USD/CHF': -0.35, 'AUD/USD': 0.56, 'USD/CAD': -0.30, 'NZD/USD': 0.52, 'EUR/JPY': 1.00 }
    },
    '3M': {
      'EUR/USD': { 'EUR/USD': 1.00, 'GBP/USD': 0.81, 'USD/JPY': -0.45, 'USD/CHF': -0.96, 'AUD/USD': 0.70, 'USD/CAD': -0.85, 'NZD/USD': 0.65, 'EUR/JPY': 0.52 },
      'GBP/USD': { 'EUR/USD': 0.81, 'GBP/USD': 1.00, 'USD/JPY': -0.41, 'USD/CHF': -0.82, 'AUD/USD': 0.76, 'USD/CAD': -0.79, 'NZD/USD': 0.72, 'EUR/JPY': 0.50 },
      'USD/JPY': { 'EUR/USD': -0.45, 'GBP/USD': -0.41, 'USD/JPY': 1.00, 'USD/CHF': 0.58, 'AUD/USD': -0.33, 'USD/CAD': 0.49, 'NZD/USD': -0.29, 'EUR/JPY': 0.91 },
      'USD/CHF': { 'EUR/USD': -0.96, 'GBP/USD': -0.82, 'USD/JPY': 0.58, 'USD/CHF': 1.00, 'AUD/USD': -0.71, 'USD/CAD': 0.87, 'NZD/USD': -0.65, 'EUR/JPY': -0.31 },
      'AUD/USD': { 'EUR/USD': 0.70, 'GBP/USD': 0.76, 'USD/JPY': -0.33, 'USD/CHF': -0.71, 'AUD/USD': 1.00, 'USD/CAD': -0.65, 'NZD/USD': 0.88, 'EUR/JPY': 0.51 },
      'USD/CAD': { 'EUR/USD': -0.85, 'GBP/USD': -0.79, 'USD/JPY': 0.49, 'USD/CHF': 0.87, 'AUD/USD': -0.65, 'USD/CAD': 1.00, 'NZD/USD': -0.61, 'EUR/JPY': -0.27 },
      'NZD/USD': { 'EUR/USD': 0.65, 'GBP/USD': 0.72, 'USD/JPY': -0.29, 'USD/CHF': -0.65, 'AUD/USD': 0.88, 'USD/CAD': -0.61, 'NZD/USD': 1.00, 'EUR/JPY': 0.48 },
      'EUR/JPY': { 'EUR/USD': 0.52, 'GBP/USD': 0.50, 'USD/JPY': 0.91, 'USD/CHF': -0.31, 'AUD/USD': 0.51, 'USD/CAD': -0.27, 'NZD/USD': 0.48, 'EUR/JPY': 1.00 }
    }
  };

  let currentCorrTimeframe = '1D';

  function initForexCorrelation() {
    const tfButtons = document.querySelectorAll('#forexCorrTimeframeTabs .corr-timeframe-btn');
    tfButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.getAttribute('data-tf');
        if (tf === currentCorrTimeframe) return;

        tfButtons.forEach(b => b.classList.remove('corr-tf-active'));
        btn.classList.add('corr-tf-active');

        currentCorrTimeframe = tf;
        renderCorrelationMatrix();
      });
    });

    renderCorrelationMatrix();
  }

  function getCorrClass(val) {
    if (val >= 0.99) return 'corr-self';
    if (val >= 0.70) return 'corr-strong-pos';
    if (val >= 0.30) return 'corr-mod-pos';
    if (val > -0.30) return 'corr-neutral';
    if (val > -0.70) return 'corr-mod-neg';
    return 'corr-strong-neg';
  }

  function renderCorrelationMatrix() {
    const tbody = document.getElementById('forexCorrelationTableBody');
    if (!tbody) return;

    const data = CORRELATION_DATA[currentCorrTimeframe] || CORRELATION_DATA['1D'];

    tbody.innerHTML = CORRELATION_PAIRS.map(rowPair => {
      const rowData = data[rowPair] || {};
      const cellsHtml = CORRELATION_PAIRS.map(colPair => {
        const val = rowData[colPair] !== undefined ? rowData[colPair] : 0;
        const valStr = val === 1.00 ? '1.00' : (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2));
        const corrClass = getCorrClass(val);
        return `<td class="${corrClass}" title="${rowPair} vs ${colPair}: ${valStr}">${valStr}</td>`;
      }).join('');

      return `
        <tr>
          <td>${rowPair}</td>
          ${cellsHtml}
        </tr>
      `;
    }).join('');
  }

  /* ============================================================
     FOREX & GLOBAL MARKET NEWS (INSIDE FOREX ECONOMIC CALENDAR)
     ============================================================ */

  let _currentForexNewsCategory = 'all';

  function formatRelativeForexNewsTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function loadForexCalendarNews(category = 'all') {
    const container = document.getElementById('forexCalendarNewsList');
    if (!container) return;

    _currentForexNewsCategory = category;

    container.innerHTML = `
      <div class="stocks-news-loading" style="grid-column: 1 / -1;">
        <div class="loading-spinner"></div>
        <span>Loading ${category.replace('-', ' ')} news & macroeconomic headlines...</span>
      </div>
    `;

    const backendBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'http://localhost:3000';
    let articles = [];

    try {
      const response = await fetch(`${backendBase}/api/market/news?category=${encodeURIComponent(category)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.articles)) {
          articles = data.articles;
        }
      }
    } catch (err) {
      console.warn('[ForexCalendarNews] Backend unreachable, trying local fallback:', err.message);
    }

    if (!articles || articles.length === 0) {
      try {
        const fallbackRes = await fetch('./data/market-news.json');
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData && Array.isArray(fallbackData.articles)) {
            articles = fallbackData.articles.map(a => ({
              title: a.title,
              description: a.excerpt || a.description || '',
              source: a.source || 'Global Feed',
              url: a.url || '',
              image: null,
              publishedAt: a.publishedAt || new Date().toISOString(),
              category: category
            }));
          }
        }
      } catch (e) {
        console.warn('[ForexCalendarNews] Local fallback failed:', e.message);
      }
    }

    renderForexCalendarNews(container, articles, category);
  }

  function renderForexCalendarNews(container, articles, category) {
    if (!container) return;

    if (!articles || articles.length === 0) {
      container.innerHTML = `
        <div class="stocks-news-empty" style="grid-column: 1 / -1;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>No news articles found for this category at this moment.</p>
        </div>
      `;
      return;
    }

    // Display top 6 global articles in the calendar grid
    const visibleArticles = articles.slice(0, 6);

    container.innerHTML = visibleArticles.map(item => {
      const sourceName = item.source || 'Global Markets';
      const timeAgo = formatRelativeForexNewsTime(item.publishedAt);
      const description = item.description ? item.description.trim() : '';
      const imageMarkup = item.image 
        ? `<div class="stock-news-thumb"><img src="${item.image}" alt="" loading="lazy" onerror="this.parentElement.style.display='none';" /></div>`
        : '';

      const categoryLabel = {
        'all': 'Global',
        'forex': 'Forex',
        'gold': 'Gold',
        'crypto': 'Crypto',
        'us-markets': 'US Markets'
      }[item.category || category] || 'Global';

      return `
        <article class="stock-news-card" data-url="${item.url || '#'}">
          ${imageMarkup}
          <div class="stock-news-body">
            <div class="stock-news-meta-row">
              <span class="stock-news-tag">${categoryLabel}</span>
              <span class="stock-news-src">${sourceName}</span>
              <span class="stock-news-dot">·</span>
              <span class="stock-news-time">${timeAgo}</span>
            </div>
            <h4 class="stock-news-title">${item.title}</h4>
            ${description ? `<p class="stock-news-desc">${description}</p>` : ''}
            <div class="stock-news-footer">
              <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" class="stock-news-read-btn" onclick="event.stopPropagation();">
                <span>Read Article</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.stock-news-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.getAttribute('data-url');
        if (url && url !== '#') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    });
  }

  function initForexCalendarNews() {
    const pills = document.querySelectorAll('#forexNewsCategoryPills .news-cat-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('news-cat-active'));
        pill.classList.add('news-cat-active');
        const cat = pill.getAttribute('data-category') || 'all';
        loadForexCalendarNews(cat);
      });
    });

    loadForexCalendarNews('all');
  }

  /* ============================================================
     INIT & EXPORT
     ============================================================ */

  function initForexMarket() {
    const forexWrapper = document.getElementById('forexMarketWrapper');
    if (!forexWrapper) return;

    console.log('Initializing Forex Market sections...');
    initForexEconomicCalendar();
    initForexCalendarNews();
    initForexTradingSessions();
    initForexCorrelation();
    if (window.marketComments && typeof window.marketComments.loadComments === 'function') {
      window.marketComments.loadComments('forex');
    }
  }

  window.initForexMarket = initForexMarket;

  // Listen to custom market change event
  window.addEventListener('marketViewChanged', (e) => {
    if (e.detail && e.detail.market === 'forex') {
      initForexMarket();
    }
  });

})();
