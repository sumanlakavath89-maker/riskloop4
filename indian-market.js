/* ============================================================
   INDIAN MARKET MODULE
   Handles Top Movers, Sectors, Stocks in News, F&O Update, 
   and Earnings sections for the Indian Market page
   ============================================================ */

(function() {
  'use strict';

  /* ============================================================
     MOCK DATA
     Replace with real API calls when backend is ready
     ============================================================ */

  const MOCK_GAINERS = [
    { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3842.50, change: 5.23, chart: [3650, 3680, 3720, 3750, 3780, 3820, 3842] },
    { symbol: 'INFY', name: 'Infosys', price: 1567.80, change: 4.87, chart: [1490, 1510, 1530, 1545, 1555, 1560, 1568] },
    { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2845.30, change: 4.12, chart: [2730, 2750, 2780, 2800, 2820, 2835, 2845] },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1642.90, change: 3.78, chart: [1580, 1595, 1610, 1625, 1635, 1640, 1643] },
    { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1087.65, change: 3.45, chart: [1050, 1060, 1070, 1078, 1083, 1086, 1088] },
    { symbol: 'WIPRO', name: 'Wipro', price: 456.20, change: 3.21, chart: [441, 445, 448, 451, 454, 455, 456] },
    { symbol: 'AXISBANK', name: 'Axis Bank', price: 1134.80, change: 2.98, chart: [1102, 1110, 1118, 1125, 1130, 1133, 1135] },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel', price: 1523.40, change: 2.67, chart: [1483, 1495, 1505, 1512, 1518, 1521, 1523] },
  ];

  const MOCK_LOSERS = [
    { symbol: 'TATASTEEL', name: 'Tata Steel', price: 134.25, change: -4.56, chart: [141, 139, 137, 136, 135, 134.5, 134.25] },
    { symbol: 'ZOMATO', name: 'Zomato', price: 187.90, change: -3.89, chart: [195, 193, 191, 189.5, 188.5, 188, 187.9] },
    { symbol: 'ADANIENT', name: 'Adani Enterprises', price: 2567.30, change: -3.45, chart: [2658, 2640, 2610, 2590, 2575, 2570, 2567] },
    { symbol: 'COALINDIA', name: 'Coal India', price: 423.80, change: -3.12, chart: [437, 433, 430, 427, 425, 424, 423.8] },
    { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', price: 278.45, change: -2.87, chart: [286, 284, 282, 280, 279, 278.5, 278.45] },
    { symbol: 'NTPC', name: 'NTPC Limited', price: 356.90, change: -2.54, chart: [366, 363, 360, 358, 357, 357, 356.9] },
    { symbol: 'HINDALCO', name: 'Hindalco Industries', price: 612.70, change: -2.23, chart: [626, 622, 618, 615, 614, 613, 612.7] },
    { symbol: 'VEDL', name: 'Vedanta Limited', price: 423.50, change: -2.01, chart: [432, 429, 427, 425, 424, 423.8, 423.5] },
  ];

  const MOCK_SECTORS = [
    { name: 'IT', icon: '💻', gainers: 18, losers: 5, change: 3.45, totalStocks: 23 },
    { name: 'Financial Services', icon: '🏦', gainers: 12, losers: 8, change: 2.87, totalStocks: 20 },
    { name: 'Pharma', icon: '💊', gainers: 9, losers: 6, change: 1.76, totalStocks: 15 },
    { name: 'Auto', icon: '🚗', gainers: 7, losers: 9, change: -1.23, totalStocks: 16 },
    { name: 'FMCG', icon: '🛒', gainers: 6, losers: 10, change: -0.87, totalStocks: 16 },
    { name: 'Metals', icon: '⚒️', gainers: 4, losers: 12, change: -2.54, totalStocks: 16 },
  ];

  const MOCK_STOCKS_NEWS = [
    { company: 'RELIANCE', headline: 'Announces ₹75,000 crore capex for green energy projects', sentiment: 'positive' },
    { company: 'TCS', headline: 'Wins $2.3 billion deal from European banking consortium', sentiment: 'positive' },
    { company: 'ZOMATO', headline: 'Reports narrowing losses but misses revenue estimates', sentiment: 'neutral' },
    { company: 'TATASTEEL', headline: 'Faces pressure from falling steel prices in China', sentiment: 'negative' },
    { company: 'INFY', headline: 'Upgrades full-year revenue guidance amid strong demand', sentiment: 'positive' },
  ];

  const MOCK_FO_DATA = [
    { name: 'NIFTY 50 Futures', value: '24,857.30', change: 1.23 },
    { name: 'NIFTY Bank Futures', value: '52,134.80', change: 2.45 },
    { name: 'India VIX', value: '12.45', change: -3.21 },
  ];

  const MOCK_EARNINGS = [
    { symbol: 'HDFCBANK', name: 'HDFC Bank', date: 'Aug 16, 2026', tentative: false },
    { symbol: 'INFY', name: 'Infosys', date: 'Aug 17, 2026', tentative: true },
    { symbol: 'WIPRO', name: 'Wipro', date: 'Aug 18, 2026', tentative: true },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel', date: 'Aug 19, 2026', tentative: false },
    { symbol: 'RELIANCE', name: 'Reliance Industries', date: 'Aug 20, 2026', tentative: true },
  ];

  // Economic calendar data is dynamically loaded from backend GET /api/economic-calendar?country=IN

  const TRADING_SESSIONS = [
    { name: 'Pre-Open', start: '9:00', end: '9:15', status: 'pre', type: 'equity' },
    { name: 'NSE', start: '9:15', end: '15:30', status: 'open', type: 'equity' },
    { name: 'BSE', start: '9:15', end: '15:30', status: 'open', type: 'equity' },
    { name: 'Equity F&O', start: '9:15', end: '15:30', status: 'open', type: 'fo' },
    { name: 'MCX Commodity', start: '9:00', end: '23:30', status: 'open', type: 'commodity' },
  ];

  /* ============================================================
     UTILITY FUNCTIONS
     ============================================================ */

  function getCurrentISTTime() {
    const now = new Date();
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    return {
      hours: istTime.getHours(),
      minutes: istTime.getMinutes(),
      dayOfWeek: istTime.getDay(), // 0 = Sunday, 6 = Saturday
      totalMinutes: istTime.getHours() * 60 + istTime.getMinutes()
    };
  }

  function timeStringToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function isSessionActive(session, currentTime) {
    const ist = getCurrentISTTime();
    // Weekend override: Saturday and Sunday are ALWAYS closed
    if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) {
      return false;
    }

    const currentMinutes = typeof currentTime === 'number' ? currentTime : ist.totalMinutes;
    const startMinutes = timeStringToMinutes(session.start);
    const endMinutes = timeStringToMinutes(session.end);
    
    // Handle overnight sessions (like MCX)
    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  function getSessionStatus(session, currentTime) {
    const ist = getCurrentISTTime();
    // Weekend override: Saturday and Sunday are ALWAYS closed
    if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) {
      return 'closed';
    }

    if (session.name === 'Pre-Open') {
      return isSessionActive(session, currentTime) ? 'pre' : 'closed';
    }
    return isSessionActive(session, currentTime) ? 'open' : 'closed';
  }

  /* ============================================================
     ECONOMIC CALENDAR — OFFICIAL INDIAN GOVERNMENT SOURCES
     ============================================================ */

  let currentCalendarPeriod = 'today';
  let liveCalendarState = {
    events: [],
    status: 'IDLE',
    message: '',
    isAvailable: false
  };
  let isCalendarLoading = false;

  async function fetchLiveEconomicCalendar(period = 'today', forceRefresh = false) {
    const backendBase = (typeof window !== 'undefined' && window.API_BASE_URL) || '';
    try {
      const url = `${backendBase}/api/market/economic-calendar?period=${encodeURIComponent(period)}${forceRefresh ? '&refresh=true' : ''}`;
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
        message: errJson?.message || `HTTP ${response.status}: Failed to fetch official calendar`,
        events: []
      };
    } catch (err) {
      console.warn('[IndianMarket] Failed to fetch official economic calendar from backend:', err.message);
      return {
        success: false,
        status: 'NETWORK_ERROR',
        message: 'Could not connect to RiskLoop official economic calendar service.',
        events: []
      };
    }
  }

  function formatISTDateTime(isoString, fallbackDate = '—', fallbackTime = '—') {
    if (!isoString) return { date: fallbackDate, time: fallbackTime };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: fallbackDate, time: fallbackTime };

    const dateStr = d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric'
    });

    const timeStr = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return { date: dateStr, time: `${timeStr} IST` };
  }

  function initEconomicCalendar() {
    const todayTab = document.querySelector('[data-period="today"]');
    const tomorrowTab = document.querySelector('[data-period="tomorrow"]');
    const weekTab = document.querySelector('[data-period="week"]');
    const viewAllBtn = document.getElementById('viewAllCalendarBtn');
    const prevBtn = document.getElementById('calendarPrevBtn');
    const nextBtn = document.getElementById('calendarNextBtn');
    const navDate = document.getElementById('calendarNavDate');

    if (!todayTab || !tomorrowTab || !weekTab) return;

    // Tab click handlers
    todayTab.addEventListener('click', () => {
      if (currentCalendarPeriod === 'today') return;
      setActiveCalendarTab(todayTab, [tomorrowTab, weekTab]);
      currentCalendarPeriod = 'today';
      if (navDate) navDate.textContent = 'Today';
      loadCalendarData('today');
    });

    tomorrowTab.addEventListener('click', () => {
      if (currentCalendarPeriod === 'tomorrow') return;
      setActiveCalendarTab(tomorrowTab, [todayTab, weekTab]);
      currentCalendarPeriod = 'tomorrow';
      if (navDate) navDate.textContent = 'Tomorrow';
      loadCalendarData('tomorrow');
    });

    weekTab.addEventListener('click', () => {
      if (currentCalendarPeriod === 'week') return;
      setActiveCalendarTab(weekTab, [todayTab, tomorrowTab]);
      currentCalendarPeriod = 'week';
      if (navDate) navDate.textContent = 'This Week';
      loadCalendarData('week');
    });

    // View all button
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        currentCalendarPeriod = 'all';
        [todayTab, tomorrowTab, weekTab].forEach(t => t.classList.remove('calendar-tab-active'));
        if (navDate) navDate.textContent = 'All Official Releases';
        loadCalendarData('all');
      });
    }

    // Prev / Next button handlers
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentCalendarPeriod === 'tomorrow') {
          todayTab.click();
        } else if (currentCalendarPeriod === 'week') {
          tomorrowTab.click();
        } else {
          viewAllBtn && viewAllBtn.click();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentCalendarPeriod === 'today') {
          tomorrowTab.click();
        } else if (currentCalendarPeriod === 'tomorrow') {
          weekTab.click();
        } else {
          todayTab.click();
        }
      });
    }

    // Initial load from backend (defaults to Today)
    loadCalendarData('today');
  }

  function setActiveCalendarTab(activeTab, otherTabs) {
    activeTab.classList.add('calendar-tab-active');
    otherTabs.forEach(tab => tab.classList.remove('calendar-tab-active'));
  }

  async function loadCalendarData(period = currentCalendarPeriod, forceRefresh = false) {
    const tbody = document.getElementById('calendarTableBody');
    if (!tbody) return;

    if (isCalendarLoading) return;
    isCalendarLoading = true;

    // Show loading state
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="calendar-loading">
          <div class="loading-spinner"></div>
          <span>Loading official Indian economic releases...</span>
        </td>
      </tr>
    `;

    try {
      const response = await fetchLiveEconomicCalendar(period, forceRefresh);
      liveCalendarState = response;
      renderCalendarTable(tbody, response);
    } catch (err) {
      console.error('[IndianMarket] Error loading economic calendar:', err);
      renderCalendarTable(tbody, {
        success: false,
        status: 'CLIENT_ERROR',
        message: 'Unable to display official calendar events.',
        events: []
      });
    } finally {
      isCalendarLoading = false;
    }
  }

  function formatCalendarValue(val, unit = '') {
    if (val === null || val === undefined || val === '' || val === '—' || val === '-') {
      return '—';
    }
    const str = String(val).trim();
    if (str === '—' || str === '' || str === 'null' || str === 'undefined') return '—';
    if (unit && !str.includes(unit) && !isNaN(Number(str))) {
      return `${str}${unit}`;
    }
    return str;
  }

  function renderCalendarTable(tbody, state) {
    if (!tbody) return;

    const events = Array.isArray(state?.events) ? state.events : [];
    const message = state?.message || '';

    if (!state?.success && events.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="calendar-loading" style="padding: 34px 20px;">
            <div style="color: var(--text); font-size: 14px; font-weight: 600; margin-bottom: 6px;">Official Economic Calendar Notice</div>
            <div style="margin: 0 auto 14px; font-size: 12px; color: var(--text-muted); max-width: 520px; line-height: 1.4;">${message || 'Official Indian economic data is currently refreshing.'}</div>
            <button class="jbtn-ghost jbtn-sm" id="retryCalendarBtn" style="margin: 0 auto; padding: 4px 14px; font-size: 12px; cursor: pointer;">
              Refresh Data
            </button>
          </td>
        </tr>
      `;

      const retryBtn = document.getElementById('retryCalendarBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadCalendarData(currentCalendarPeriod, true));
      }
      return;
    }

    if (events.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="calendar-loading" style="padding: 32px 20px;">
            <div style="color: var(--text); font-size: 13px; font-weight: 600;">No Official Releases Scheduled</div>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted);">No official Indian government or RBI macroeconomic announcements for this selected period.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = events.map(event => {
      const impact = (event.impact || 'medium').toLowerCase();
      let impactClass = 'impact-medium';
      if (impact === 'high' || impact === '3') impactClass = 'impact-high';
      else if (impact === 'low' || impact === '1') impactClass = 'impact-low';

      const impactLabel = impact.charAt(0).toUpperCase() + impact.slice(1);
      const { date, time } = formatISTDateTime(event.eventTime || event.date);
      const currency = event.currency || 'INR';
      const countryCode = event.countryCode || 'IN';
      const countryFlag = event.countryFlag || '🇮🇳';
      const sourceName = event.source || 'Official Source';
      const sourceUrl = event.sourceUrl || 'https://www.mospi.gov.in';

      return `
        <tr>
          <td class="cal-col-date">
            <div class="cal-date-badge">
              <strong>${date}</strong>
            </div>
          </td>
          <td class="cal-col-time">
            <span class="cal-time">${time}</span>
          </td>
          <td class="cal-col-event">
            <div class="cal-event-cell">
              <div class="cal-event-title">${event.event || '—'}</div>
            </div>
          </td>
          <td class="cal-col-country">
            <div class="cal-country">
              <span class="cal-country-flag">${countryFlag}</span>
              <span>${countryCode} (${currency})</span>
            </div>
          </td>
          <td class="cal-col-impact">
            <span class="impact-badge ${impactClass}">${impactLabel}</span>
          </td>
          <td class="cal-col-previous">
            <div class="cal-value-cell">${formatCalendarValue(event.previous, event.unit)}</div>
          </td>
          <td class="cal-col-forecast">
            <div class="cal-value-cell">${formatCalendarValue(event.forecast, event.unit)}</div>
          </td>
          <td class="cal-col-actual">
            <div class="cal-value-cell cal-actual">${formatCalendarValue(event.actual, event.unit)}</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ============================================================
     TRADING SESSIONS TIMELINE
     ============================================================ */

  function initTradingSessions() {
    const clock = document.getElementById('sessionsClock');
    const date = document.getElementById('sessionsDate');
    const sessionsRows = document.getElementById('sessionsRows');
    const currentTimeIndicator = document.getElementById('sessionsCurrentTime');

    if (!sessionsRows) return;

    // Update clock and sessions status
    function updateClockAndSessions() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        hour12: false 
      });
      const dateStr = now.toLocaleDateString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      if (clock) clock.textContent = timeStr;
      if (date) date.textContent = dateStr;

      // Update sessions with current status
      const currentTime = getCurrentISTTime();
      renderTradingSessionsWithStatus(sessionsRows, currentTime.totalMinutes);

      // Update current time indicator
      updateCurrentTimeIndicator(currentTime.totalMinutes);
    }

    // Initial render and setup interval
    updateClockAndSessions();
    setInterval(updateClockAndSessions, 1000);
  }

  function renderTradingSessionsWithStatus(container, currentTimeMinutes) {
    container.innerHTML = TRADING_SESSIONS.map(session => {
      const currentStatus = getSessionStatus(session, currentTimeMinutes);
      const statusClass = `session-status-${currentStatus}`;
      const statusLabel = currentStatus === 'pre' ? 'PRE' : 
                         currentStatus === 'open' ? 'OPEN' : 'CLOSED';

      return `
        <div class="session-row">
          <div class="session-label">
            ${session.name}
            <span class="session-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="session-timeline">
            ${renderSessionPeriodWithStatus(session, currentStatus)}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSessionPeriodWithStatus(session, currentStatus) {
    const startHour = parseInt(session.start.split(':')[0]);
    const startMin = parseInt(session.start.split(':')[1]);
    const endHour = parseInt(session.end.split(':')[0]);
    const endMin = parseInt(session.end.split(':')[1]);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Timeline now spans from 9:00 AM (540 minutes) to 23:30 (1410 minutes) = 870 minutes total
    const timelineStart = 9 * 60; // 9:00 AM
    const timelineEnd = 23.5 * 60; // 23:30
    const timelineSpan = timelineEnd - timelineStart;
    
    const left = ((startMinutes - timelineStart) / timelineSpan) * 100;
    let width;
    
    // Handle overnight sessions (MCX)
    if (endMinutes < startMinutes) {
      // For overnight sessions, calculate to end of timeline
      width = ((timelineEnd - startMinutes) / timelineSpan) * 100;
    } else {
      width = ((endMinutes - startMinutes) / timelineSpan) * 100;
    }

    const periodClass = `session-period-${currentStatus}`;
    const timeLabel = `${session.start} - ${session.end}`;

    return `
      <div class="session-period ${periodClass}" style="left: ${Math.max(0, left)}%; width: ${Math.max(1, width)}%;">
        ${width > 15 ? timeLabel : ''}
      </div>
    `;
  }

  function updateCurrentTimeIndicator(currentTimeMinutes) {
    const currentTimeIndicator = document.getElementById('sessionsCurrentTime');
    if (!currentTimeIndicator) return;

    // Timeline spans from 9:00 AM to 23:30
    const timelineStart = 9 * 60; // 9:00 AM
    const timelineEnd = 23.5 * 60; // 23:30
    const timelineSpan = timelineEnd - timelineStart;
    
    // Only show indicator if current time is within the timeline range
    if (currentTimeMinutes >= timelineStart && currentTimeMinutes <= timelineEnd) {
      const position = ((currentTimeMinutes - timelineStart) / timelineSpan) * 100;
      currentTimeIndicator.style.left = `${position}%`;
      currentTimeIndicator.hidden = false;
    } else {
      currentTimeIndicator.hidden = true;
    }
  }

  /* ============================================================
     CHART RENDERING (Mini Sparklines)
     ============================================================ */

  function renderMiniChart(canvas, data, isPositive) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 4;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate dimensions
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    // Find min and max
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Calculate points
    const points = data.map((value, index) => ({
      x: padding + (index / (data.length - 1)) * chartWidth,
      y: padding + chartHeight - ((value - min) / range) * chartHeight
    }));

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    
    ctx.strokeStyle = isPositive ? 
      getComputedStyle(document.documentElement).getPropertyValue('--profit').trim() :
      getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw area fill
    ctx.lineTo(points[points.length - 1].x, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    
    ctx.fillStyle = isPositive ? 
      'rgba(72, 183, 154, 0.1)' :
      'rgba(224, 104, 90, 0.1)';
    ctx.fill();
  }

  function renderMiniChart(canvas, data, isPositive) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 4;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate dimensions
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    // Find min and max
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Calculate points
    const points = data.map((value, index) => ({
      x: padding + (index / (data.length - 1)) * chartWidth,
      y: padding + chartHeight - ((value - min) / range) * chartHeight
    }));

    // Draw line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    
    ctx.strokeStyle = isPositive ? 
      getComputedStyle(document.documentElement).getPropertyValue('--profit').trim() :
      getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw area fill
    ctx.lineTo(points[points.length - 1].x, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    
    ctx.fillStyle = isPositive ? 
      'rgba(72, 183, 154, 0.1)' :
      'rgba(224, 104, 90, 0.1)';
    ctx.fill();
  }

  /* ============================================================
     TOP MOVERS TODAY
     ============================================================ */

  let currentMoversType = 'gainers';

  function initTopMovers() {
    const gainersTab = document.querySelector('[data-type="gainers"]');
    const losersTab = document.querySelector('[data-type="losers"]');
    const viewAllBtn = document.getElementById('viewAllMoversBtn');
    const viewAllText = document.getElementById('viewAllMoversText');

    if (!gainersTab || !losersTab) return;

    // Tab click handlers
    gainersTab.addEventListener('click', () => {
      if (currentMoversType === 'gainers') return;
      
      gainersTab.classList.add('movers-tab-active');
      losersTab.classList.remove('movers-tab-active');
      currentMoversType = 'gainers';
      viewAllText.textContent = 'View all gainers';
      
      loadMoversData('gainers');
    });

    losersTab.addEventListener('click', () => {
      if (currentMoversType === 'losers') return;
      
      losersTab.classList.add('movers-tab-active');
      gainersTab.classList.remove('movers-tab-active');
      currentMoversType = 'losers';
      viewAllText.textContent = 'View all losers';
      
      loadMoversData('losers');
    });

    // View all button
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        console.log(`View all ${currentMoversType} clicked`);
        // TODO: Navigate to full movers page or open modal
      });
    }

    // Initial load
    loadMoversData('gainers');
  }

  let cachedMoversResponse = null;
  let isFetchingMovers = false;

  function updateMoversStatusBadge(response) {
    const badge = document.getElementById('moversStatusBadge');
    const text = document.getElementById('moversStatusText');

    if (!badge || !text) return;

    const isLive = Boolean(response?.isLive);
    const label = response?.statusLabel || (isLive ? 'Live Market' : 'Market Closed • Showing previous session');

    badge.className = `movers-status-badge ${isLive ? 'status-live' : 'status-closed'}`;
    text.textContent = label;
  }

  async function fetchMoversFromAPI(forceRefresh = false) {
    if (cachedMoversResponse && !forceRefresh) {
      return cachedMoversResponse;
    }

    try {
      isFetchingMovers = true;
      const res = await fetch('/api/market/movers');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch movers`);
      }
      const json = await res.json();
      if (json && json.success && json.data) {
        cachedMoversResponse = json;
        return json;
      }
      throw new Error(json?.error || 'Invalid movers data received');
    } finally {
      isFetchingMovers = false;
    }
  }

  async function loadMoversData(type, forceRefresh = false) {
    const tbody = document.getElementById('moversTableBody');
    if (!tbody) return;

    // If we don't have cached data or forceRefresh, show loading state
    if (!cachedMoversResponse || forceRefresh) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="movers-loading">
            <div class="loading-spinner"></div>
            <span>Loading ${type === 'gainers' ? 'top gainers' : 'top losers'}...</span>
          </td>
        </tr>
      `;
    }

    try {
      const response = await fetchMoversFromAPI(forceRefresh);
      updateMoversStatusBadge(response);

      const items = (type === 'gainers' ? response.data?.gainers : response.data?.losers) || [];

      if (!items || items.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">
              No ${type} data available at this time.
            </td>
          </tr>
        `;
        return;
      }

      renderMoversTable(tbody, items);
    } catch (err) {
      console.warn('[IndianMarket] Top movers fetch error:', err);
      // If we have previously cached session data, keep showing it with an updated status
      if (cachedMoversResponse && cachedMoversResponse.data) {
        updateMoversStatusBadge(cachedMoversResponse);
        const items = (type === 'gainers' ? cachedMoversResponse.data?.gainers : cachedMoversResponse.data?.losers) || [];
        renderMoversTable(tbody, items);
        return;
      }

      // Show clean, friendly error state with retry button
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="movers-error" style="text-align: center; padding: 24px; color: var(--text-muted);">
            <div style="margin-bottom: 8px; color: #f87171;">Unable to connect to market service.</div>
            <button class="jbtn-ghost jbtn-sm" id="retryMoversBtn" style="margin: 0 auto; padding: 4px 12px; font-size: 12px; cursor: pointer;">Retry</button>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById('retryMoversBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadMoversData(type, true));
      }
    }
  }

  function renderMoversTable(tbody, data) {
    tbody.innerHTML = data.map(stock => {
      const numPrice = typeof stock.price === 'number' ? stock.price : parseFloat(stock.price) || 0;
      const numChange = typeof stock.change === 'number' ? stock.change : parseFloat(stock.change) || 0;
      const isPositive = numChange > 0;
      const changeSymbol = isPositive ? '+' : '';
      const changeClass = isPositive ? 'positive' : 'negative';
      const arrowIcon = isPositive ? 
        '<svg class="change-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>' :
        '<svg class="change-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      const chartArray = Array.isArray(stock.chart) && stock.chart.length > 0 ? stock.chart : [numPrice * 0.98, numPrice * 0.99, numPrice, numPrice * 1.01, numPrice];

      return `
        <tr>
          <td class="movers-col-company">
            <div class="company-cell">
              <div class="company-logo">${(stock.symbol || 'ST').substring(0, 2)}</div>
              <div class="company-info">
                <div class="company-name">${stock.name || stock.symbol}</div>
                <div class="company-symbol">${stock.symbol}</div>
              </div>
            </div>
          </td>
          <td class="movers-col-chart">
            <div class="mini-chart">
              <canvas width="120" height="40" data-chart='${JSON.stringify(chartArray)}' data-positive="${isPositive}"></canvas>
            </div>
          </td>
          <td class="movers-col-price">
            <div class="price-cell">₹${numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </td>
          <td class="movers-col-change">
            <div class="change-cell ${changeClass}">
              ${arrowIcon}
              <span>${changeSymbol}${Math.abs(numChange).toFixed(2)}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Render charts after DOM update
    setTimeout(() => {
      const canvases = tbody.querySelectorAll('canvas[data-chart]');
      canvases.forEach(canvas => {
        const data = JSON.parse(canvas.getAttribute('data-chart'));
        const isPositive = canvas.getAttribute('data-positive') === 'true';
        renderMiniChart(canvas, data, isPositive);
      });
    }, 0);
  }

  /* ============================================================
     SECTORS TRENDING TODAY
     ============================================================ */

  function initSectors() {
    const sectorsList = document.getElementById('sectorsList');
    const viewAllBtn = document.getElementById('viewAllSectorsBtn');

    if (!sectorsList) return;

    // Show loading
    sectorsList.innerHTML = `
      <div class="sectors-loading">
        <div class="loading-spinner"></div>
        <span>Loading sector data...</span>
      </div>
    `;

    // Simulate API call
    setTimeout(() => {
      renderSectors(sectorsList, MOCK_SECTORS);
    }, 600);

    // View all button
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        console.log('View all sectors clicked');
        // TODO: Navigate to full sectors page
      });
    }
  }

  function renderSectors(container, sectors) {
    container.innerHTML = sectors.map(sector => {
      const isPositive = sector.change > 0;
      const changeClass = isPositive ? 'positive' : 'negative';
      const changeSymbol = isPositive ? '+' : '';
      
      // Calculate bar percentages
      const gainersPercent = (sector.gainers / sector.totalStocks) * 100;
      const losersPercent = (sector.losers / sector.totalStocks) * 100;

      return `
        <div class="sector-card">
          <div class="sector-icon">${sector.icon}</div>
          <div class="sector-content">
            <div class="sector-header">
              <div class="sector-name">${sector.name}</div>
              <div class="sector-stats">
                <span class="sector-gainers">↑ ${sector.gainers}</span>
                <span class="sector-losers">↓ ${sector.losers}</span>
              </div>
            </div>
            <div class="sector-bar-container">
              <div class="sector-bar">
                <div class="sector-bar-gain" style="width: ${gainersPercent}%"></div>
                <div class="sector-bar-loss" style="width: ${losersPercent}%"></div>
              </div>
            </div>
          </div>
          <div class="sector-change ${changeClass}">${changeSymbol}${Math.abs(sector.change).toFixed(2)}%</div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     INDIAN MARKET & ECONOMIC NEWS (INSIDE ECONOMIC CALENDAR)
     ============================================================ */

  function formatRelativeNewsTime(dateString) {
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
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  }

  async function initIndiaCalendarNews() {
    const container = document.getElementById('indiaCalendarNewsList');
    if (!container) return;

    container.innerHTML = `
      <div class="stocks-news-loading" style="grid-column: 1 / -1;">
        <div class="loading-spinner"></div>
        <span>Loading India economic & market headlines...</span>
      </div>
    `;

    const backendBase = (typeof window !== 'undefined' && window.API_BASE_URL) || 'http://localhost:3000';
    let articles = [];

    try {
      const response = await fetch(`${backendBase}/api/market/news?category=india`, {
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
      console.warn('[IndiaCalendarNews] Backend unreachable, trying local fallback:', err.message);
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
              source: a.source || 'Market Feed',
              url: a.url || '',
              image: null,
              publishedAt: a.publishedAt || new Date().toISOString(),
              category: 'india'
            }));
          }
        }
      } catch (e) {
        console.warn('[IndiaCalendarNews] Local fallback failed:', e.message);
      }
    }

    renderIndiaCalendarNews(container, articles);
  }

  function renderIndiaCalendarNews(container, articles) {
    if (!container) return;

    if (!articles || articles.length === 0) {
      container.innerHTML = `
        <div class="stocks-news-empty" style="grid-column: 1 / -1;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>No Indian economic news articles found at this moment.</p>
        </div>
      `;
      return;
    }

    // Display top 6 Indian market headlines
    const visibleArticles = articles.slice(0, 6);

    container.innerHTML = visibleArticles.map(item => {
      const sourceName = item.source || 'India Markets';
      const timeAgo = formatRelativeNewsTime(item.publishedAt);
      const description = item.description ? item.description.trim() : '';
      const imageMarkup = item.image 
        ? `<div class="stock-news-thumb"><img src="${item.image}" alt="" loading="lazy" onerror="this.parentElement.style.display='none';" /></div>`
        : '';

      return `
        <article class="stock-news-card" data-url="${item.url || '#'}">
          ${imageMarkup}
          <div class="stock-news-body">
            <div class="stock-news-meta-row">
              <span class="stock-news-tag">India</span>
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

  function initStocksNews() {
    initIndiaCalendarNews();
  }

  /* ============================================================
     F&O UPDATE
     ============================================================ */

  function initFOUpdate() {
    const foList = document.getElementById('foUpdateList');
    const viewAllBtn = document.getElementById('viewAllFOBtn');

    if (!foList) return;

    // Show loading
    foList.innerHTML = `
      <div class="fo-update-loading">
        <div class="loading-spinner"></div>
        <span>Loading F&O data...</span>
      </div>
    `;

    // Simulate API call
    setTimeout(() => {
      renderFOUpdate(foList, MOCK_FO_DATA);
    }, 800);

    // View all button
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        console.log('View all F&O clicked');
        // TODO: Navigate to full F&O page
      });
    }
  }

  function renderFOUpdate(container, data) {
    container.innerHTML = data.map(item => {
      const isPositive = item.change > 0;
      const changeClass = isPositive ? 'positive' : 'negative';
      const changeSymbol = isPositive ? '+' : '';

      return `
        <div class="fo-update-item">
          <div class="fo-update-name">${item.name}</div>
          <div class="fo-update-details">
            <div class="fo-update-value">${item.value}</div>
            <div class="fo-update-change ${changeClass}">${changeSymbol}${Math.abs(item.change).toFixed(2)}%</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     EARNINGS THIS WEEK
     ============================================================ */

  function initEarnings() {
    const earningsList = document.getElementById('earningsList');
    const viewAllBtn = document.getElementById('viewAllEarningsBtn');

    if (!earningsList) return;

    // Show loading
    earningsList.innerHTML = `
      <div class="earnings-loading">
        <div class="loading-spinner"></div>
        <span>Loading earnings...</span>
      </div>
    `;

    // Simulate API call
    setTimeout(() => {
      renderEarnings(earningsList, MOCK_EARNINGS);
    }, 900);

    // View all button
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        console.log('View all earnings clicked');
        // TODO: Navigate to full earnings calendar
      });
    }
  }

  function renderEarnings(container, earnings) {
    container.innerHTML = earnings.map(item => {
      const tentativeBadge = item.tentative ? 
        '<span class="earnings-tentative">Tentative</span>' : '';

      return `
        <div class="earnings-item">
          <div class="earnings-logo">${item.symbol.substring(0, 2)}</div>
          <div class="earnings-content">
            <div class="earnings-company">${item.name}</div>
            <div class="earnings-date">
              ${item.date}
              ${tentativeBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     FUTURES & OPTIONS (F&O) SECTION - ANGEL ONE MASTER LOT ENGINE
     ============================================================ */

  let cachedFOInstruments = null;
  let currentFOCategory = 'all';
  let currentFOContractType = 'options';
  let currentFOSymbol = 'NIFTY';
  let currentFOSearchQuery = '';
  const DEFAULT_FO_VISIBLE_COUNT = 6; // Show 5 to 6 instruments by default

  async function fetchFOInstruments() {
    if (cachedFOInstruments && cachedFOInstruments.length > 0) {
      return cachedFOInstruments;
    }

    try {
      const res = await fetch('/api/market/fo-instruments');
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          cachedFOInstruments = json.data;
          return cachedFOInstruments;
        }
      }
    } catch (e) {
      console.warn('[IndianMarket] Error fetching F&O instruments from API:', e);
    }

    // Resilient fallback using window.FO_INSTRUMENTS or static catalog
    if (window.FO_INSTRUMENTS && window.FO_INSTRUMENTS.length > 0) {
      cachedFOInstruments = window.FO_INSTRUMENTS.map(i => ({
        symbol: i.symbol,
        name: i.name,
        exchange: i.exchange || 'NSE',
        type: i.type || (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(i.symbol) ? 'Index' : 'Stock'),
        segment: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(i.symbol) ? 'Index Options / Futures' : 'Stock Options / Futures',
        lotSize: i.lotSize || 1,
        tickSize: i.tickSize || 0.05,
        strikeStep: i.symbol === 'BANKNIFTY' ? 100 : (i.symbol === 'NIFTY' ? 50 : 20),
        price: i.symbol === 'NIFTY' ? 24857.30 : (i.symbol === 'BANKNIFTY' ? 52134.80 : 1500),
        change: 0.85,
        source: 'ANGELONE_MASTER_DATA'
      }));
      return cachedFOInstruments;
    }

    return [];
  }

  function updateFOSpecsDisplay(item) {
    if (!item) return;

    const lotDisplay = document.getElementById('foDynamicLotSizeDisplay');
    const lotStatus = document.getElementById('foLotSizeStatus');
    const lotSub = document.getElementById('foLotSizeSub');
    const priceDisplay = document.getElementById('foUnderlyingPriceDisplay');
    const changeDisplay = document.getElementById('foUnderlyingChangeDisplay');
    const contractValDisplay = document.getElementById('foContractValueDisplay');
    const tickStrikeDisplay = document.getElementById('foTickStrikeDisplay');
    const exchangeSegDisplay = document.getElementById('foExchangeSegmentDisplay');

    const numPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
    const lotSize = item.lotSize || 1;
    const contractValue = numPrice * lotSize;
    const changeNum = typeof item.change === 'number' ? item.change : parseFloat(item.change) || 0;
    const isPos = changeNum >= 0;

    if (lotDisplay) {
      lotDisplay.textContent = lotSize.toLocaleString('en-IN');
    }

    if (lotStatus) {
      lotStatus.textContent = item.source === 'ANGELONE_SMARTAPI' ? 'Live SmartAPI' : 'Angel One Master';
    }

    if (lotSub) {
      lotSub.textContent = `Exchange Lot Size: ${lotSize} shares / contract`;
    }

    if (priceDisplay) {
      priceDisplay.textContent = `₹${numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (changeDisplay) {
      changeDisplay.textContent = `${isPos ? '+' : ''}${changeNum.toFixed(2)}% (1D)`;
      changeDisplay.style.color = isPos ? 'var(--profit, #48b79a)' : 'var(--danger, #e0685a)';
    }

    if (contractValDisplay) {
      contractValDisplay.textContent = `₹${contractValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (tickStrikeDisplay) {
      tickStrikeDisplay.textContent = `₹${item.tickSize || '0.05'} • ${item.strikeStep || 50} pts step`;
    }

    if (exchangeSegDisplay) {
      exchangeSegDisplay.textContent = `${item.exchange || 'NSE'} • ${item.segment || (item.type + ' Derivative')}`;
    }
  }

  function filterAndRenderFOTable(instruments) {
    let filtered = instruments || [];

    // 1. Category Filter
    if (currentFOCategory === 'index') {
      filtered = filtered.filter(i => i.type === 'Index');
    } else if (currentFOCategory === 'stock') {
      filtered = filtered.filter(i => i.type === 'Stock');
    }

    // 2. Search Query Filter
    const query = (currentFOSearchQuery || '').trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(i => 
        (i.symbol && i.symbol.toLowerCase().includes(query)) ||
        (i.name && i.name.toLowerCase().includes(query)) ||
        (i.exchange && i.exchange.toLowerCase().includes(query))
      );
      // When searching, show all matching instruments across the entire database
      renderFOCatalogTable(filtered, true);
    } else {
      // When not searching, limit to default 5 to 6 visible instruments
      renderFOCatalogTable(filtered.slice(0, DEFAULT_FO_VISIBLE_COUNT), false);
    }
  }

  function renderFOCatalogTable(items, isSearching = false) {
    const tbody = document.getElementById('foTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px; color: var(--text);">No matching F&amp;O instruments found</div>
            <div style="font-size: 12px;">Try searching for a symbol like NIFTY, BANKNIFTY, RELIANCE, TCS, or HDFCBANK.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items.map(item => {
      const numPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0;
      const numChange = typeof item.change === 'number' ? item.change : parseFloat(item.change) || 0;
      const isPos = numChange >= 0;
      const arrowIcon = isPos ? 
        '<svg class="change-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>' :
        '<svg class="change-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

      return `
        <tr data-symbol="${item.symbol}">
          <td class="movers-col-company">
            <div class="company-cell">
              <div class="company-logo">${(item.symbol || 'FO').substring(0, 2)}</div>
              <div class="company-info">
                <div class="company-name">${item.name || item.symbol}</div>
                <div class="company-symbol">${item.symbol} • ${item.exchange || 'NSE'}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">
              ${item.type === 'Index' ? 'Index F&O' : 'Stock F&O'}
            </span>
          </td>
          <td>
            <div class="fo-lot-pill">
              <span>Lot:</span>
              <span>${item.lotSize}</span>
            </div>
          </td>
          <td class="movers-col-price">
            <div class="price-cell">₹${numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </td>
          <td class="movers-col-change">
            <div class="change-cell ${isPos ? 'positive' : 'negative'}">
              ${arrowIcon}
              <span>${isPos ? '+' : ''}${numChange.toFixed(2)}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function initFOMarketSection() {
    const foSection = document.getElementById('foMarketSection');
    if (!foSection) return;

    const categoryPills = document.getElementById('foCategoryPills');
    const searchInput = document.getElementById('foInstrumentSearchInput');
    const clearSearchBtn = document.getElementById('foSearchClearBtn');

    // Load instruments from Angel One API / Master
    const instruments = await fetchFOInstruments();

    // Category filter pills (All / Indices / Stocks)
    if (categoryPills) {
      const catButtons = categoryPills.querySelectorAll('[data-category]');
      catButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          catButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentFOCategory = btn.getAttribute('data-category');

          filterAndRenderFOTable(instruments);
        });
      });
    }

    // Dynamic Search Input handler
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentFOSearchQuery = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.hidden = !currentFOSearchQuery;
        }
        filterAndRenderFOTable(instruments);
      });
    }

    // Clear search button handler
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        currentFOSearchQuery = '';
        clearSearchBtn.hidden = true;
        filterAndRenderFOTable(instruments);
      });
    }

    // Initial table render (showing default 5-6 items)
    filterAndRenderFOTable(instruments);
  }

  /* ============================================================
     INITIALIZATION
     ============================================================ */

  function initIndianMarket() {
    // Check if we're on the market page and Indian market is visible
    const indianMarketWrapper = document.getElementById('indianMarketWrapper');
    if (!indianMarketWrapper) return;

    console.log('Initializing Indian Market sections...');

    // Initialize all sections
    initEconomicCalendar();
    initTradingSessions();
    initTopMovers();
    initSectors();
    initStocksNews();
    initFOUpdate();
    initFOMarketSection();
    initEarnings();
  }

  window.initIndianMarket = initIndianMarket;

  /* ============================================================
     AUTO-INIT & HOOK INTO MARKET PAGE
     ============================================================ */

  // Hook into existing market page initialization
  const originalInit = window.initializeMarketPage;
  window.initializeMarketPage = function() {
    if (originalInit) originalInit.apply(this, arguments);
    
    // Small delay to ensure DOM is ready
    setTimeout(initIndianMarket, 100);
  };

  // Initialize if already on market page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const marketPage = document.getElementById('marketPage');
      if (marketPage && !marketPage.hidden) {
        initIndianMarket();
      }
    });
  } else {
    const marketPage = document.getElementById('marketPage');
    if (marketPage && !marketPage.hidden) {
      initIndianMarket();
    }
  }

})();
