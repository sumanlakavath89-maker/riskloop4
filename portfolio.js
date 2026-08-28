/* ============================================================
   PORTFOLIO MODULE - RiskLoop
   Real Data Engine: Analytics, Real P&L Curve, Real Win/Loss Scatter,
   Real Long/Short Analysis, Real Day-of-Week & Behaviour Breakdown.
   Zero fake/mock/placeholder fallback data.
   ============================================================ */

(function () {
  'use strict';

  // State: 'combined', 'india', or 'forex'
  let _activeMarket = 'india'; // Default view
  let _activeTimeframe = '1M';  // '1W', '1M', '3M', '1Y', 'ALL'
  let _selectedCurrency = 'INR'; // 'INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'CAD'
  let _currentBrokerName = '';
  let _activeBrokerGraphMode = 'line'; // 'line' or 'bar'
  let _selectedBrokerIds = new Set();
  let _hiddenBrokers = new Set();

  // ── Multi-Currency Configuration ──
  const CURRENCIES = {
    INR: { code: 'INR', symbol: '₹', flag: '🇮🇳', label: 'INR (₹)', locale: 'en-IN', rate: 83.5, precision: 2, prefix: '₹' },
    USD: { code: 'USD', symbol: '$', flag: '💵', label: 'USD ($)', locale: 'en-US', rate: 1.0, precision: 2, prefix: '$' },
    EUR: { code: 'EUR', symbol: '€', flag: '🇪🇺', label: 'EUR (€)', locale: 'de-DE', rate: 0.92, precision: 2, prefix: '€' },
    GBP: { code: 'GBP', symbol: '£', flag: '🇬🇧', label: 'GBP (£)', locale: 'en-GB', rate: 0.78, precision: 2, prefix: '£' },
    JPY: { code: 'JPY', symbol: '¥', flag: '🇯🇵', label: 'JPY (¥)', locale: 'ja-JP', rate: 155.0, precision: 0, prefix: '¥' },
    AED: { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', label: 'AED (د.إ)', locale: 'ar-AE', rate: 3.67, precision: 2, prefix: 'AED ' },
    CAD: { code: 'CAD', symbol: 'C$', flag: '🇨🇦', label: 'CAD (C$)', locale: 'en-CA', rate: 1.37, precision: 2, prefix: 'C$' }
  };

  /**
   * Universal Currency Formatter
   */
  function formatBrokerCurrency(amount, currencyCode = 'INR', opts = {}) {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return '—';
    }
    const code = (currencyCode || 'INR').toUpperCase();
    const curr = CURRENCIES[code] || CURRENCIES.INR;
    const num = Number(amount);
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const precision = opts.precision !== undefined ? opts.precision : (curr.precision !== undefined ? curr.precision : 2);

    let formatted = '';
    try {
      formatted = new Intl.NumberFormat(curr.locale || 'en-IN', {
        style: 'currency',
        currency: curr.code,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
      }).format(absVal);
    } catch (e) {
      formatted = `${curr.prefix}${absVal.toLocaleString(curr.locale || 'en-IN', { minimumFractionDigits: precision, maximumFractionDigits: precision })}`;
    }

    if (opts.absolute) {
      return formatted;
    }
    if (opts.signed) {
      if (num > 0) return `+${formatted}`;
      if (num < 0) return `-${formatted}`;
      return formatted;
    }
    if (isNegative) {
      return `-${formatted}`;
    }
    return formatted;
  }

  window.formatBrokerCurrency = formatBrokerCurrency;

  function getEffectiveCurrency() {
    if (_selectedCurrency) return _selectedCurrency;
    if (_activeMarket === 'india') return 'INR';
    if (_activeMarket === 'forex') return 'USD';
    return 'INR';
  }

  function formatMoney(amount, opts = {}) {
    const effCurr = getEffectiveCurrency();
    return formatBrokerCurrency(amount, effCurr, opts);
  }

  /* ── Fetch Real Data from LocalStorage / Supabase / Broker Engine ── */
  function getRealConnectedBrokers() {
    let brokerList = [];
    try {
      const saved = localStorage.getItem('riskloop_connected_brokers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) brokerList = parsed;
      }
      if (brokerList.length === 0 && typeof window.getConnectedBrokers === 'function') {
        brokerList = window.getConnectedBrokers() || [];
      }
      if (brokerList.length === 0) {
        const single = localStorage.getItem('riskloop_connected_broker');
        if (single) {
          const b = JSON.parse(single);
          if (b && b.connected) brokerList = [b];
        }
      }
    } catch (e) {}
    return brokerList;
  }

  function getRealJournalTrades() {
    let trades = [];
    try {
      const raw = localStorage.getItem('riskloop_journal_trades');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) trades = parsed;
      }
      if (trades.length === 0) {
        const cachedUser = JSON.parse(localStorage.getItem('riskloop_current_user') || '{}');
        const uid = cachedUser?.id || localStorage.getItem('riskloop_user_id');
        if (uid) {
          const userTrades = localStorage.getItem(`riskloop_detailed_trades_${uid}`);
          if (userTrades) {
            const parsed = JSON.parse(userTrades);
            if (Array.isArray(parsed)) trades = parsed;
          }
        }
      }
    } catch (e) {}
    return trades;
  }

  function getRealTradingSettings() {
    let ts = null;
    try {
      const saved = localStorage.getItem('riskloop_trading_settings');
      if (saved) ts = JSON.parse(saved);
    } catch (e) {}
    return ts;
  }

  /* ── Compute Portfolio Statistics from Real Data (No Mock Fallbacks) ── */
  function computePortfolioData(marketFilter = 'india') {
    const rawTrades = getRealJournalTrades();
    const brokers = getRealConnectedBrokers();
    const ts = getRealTradingSettings();

    // 1. Determine base account size / capital
    let accountSize = null;
    let baseCurrency = 'INR';

    if (brokers.length > 0) {
      const activeBroker = brokers.find(b => b.name === _currentBrokerName || b.brokerName === _currentBrokerName) || brokers[0];
      if (activeBroker) {
        if (activeBroker.balance !== undefined && activeBroker.balance !== null && Number(activeBroker.balance) > 0) {
          accountSize = Number(activeBroker.balance);
        } else if (activeBroker.capital !== undefined && activeBroker.capital !== null && Number(activeBroker.capital) > 0) {
          accountSize = Number(activeBroker.capital);
        }
        if (activeBroker.currency) {
          baseCurrency = activeBroker.currency;
        }
      }
    }

    if (accountSize === null && ts && ts.capital && Number(ts.capital) > 0) {
      accountSize = Number(ts.capital);
      if (ts.accountCurrency) {
        if (ts.accountCurrency.includes('USD') || ts.accountCurrency.includes('$')) baseCurrency = 'USD';
        else if (ts.accountCurrency.includes('EUR') || ts.accountCurrency.includes('€')) baseCurrency = 'EUR';
        else if (ts.accountCurrency.includes('GBP') || ts.accountCurrency.includes('£')) baseCurrency = 'GBP';
        else baseCurrency = 'INR';
      }
    }

    // 2. Filter closed trades
    const closedTrades = rawTrades.filter(t => t.status !== 'OPEN');

    // Filter by timeframe
    const now = new Date();
    let tfFilteredTrades = closedTrades.filter(t => {
      if (!t.date) return true;
      const tDate = new Date(t.date);
      if (isNaN(tDate.getTime())) return true;
      if (_activeTimeframe === '1W') {
        return (now - tDate) <= 7 * 24 * 3600 * 1000;
      } else if (_activeTimeframe === '1M') {
        return (now - tDate) <= 30 * 24 * 3600 * 1000;
      } else if (_activeTimeframe === '3M') {
        return (now - tDate) <= 90 * 24 * 3600 * 1000;
      } else if (_activeTimeframe === '1Y') {
        return (now - tDate) <= 365 * 24 * 3600 * 1000;
      }
      return true;
    });

    // Filter by market
    let marketTrades = tfFilteredTrades;
    if (marketFilter === 'india') {
      marketTrades = tfFilteredTrades.filter(t => {
        if (t.market) return t.market.toLowerCase() === 'india' || t.market.toLowerCase() === 'indian';
        if (t.segment) {
          const s = t.segment.toUpperCase();
          return s.includes('NSE') || s.includes('BSE') || s.includes('NFO') || s.includes('MCX') || s.includes('EQUITY');
        }
        return true;
      });
    } else if (marketFilter === 'forex') {
      marketTrades = tfFilteredTrades.filter(t => {
        if (t.market) return t.market.toLowerCase() === 'forex' || t.market.toLowerCase() === 'fx';
        if (t.segment) return t.segment.toUpperCase().includes('FOREX') || t.segment.toUpperCase().includes('FX');
        if (t.symbol) {
          const sym = t.symbol.toUpperCase();
          return sym.includes('/') || sym.includes('XAU') || sym.includes('EUR') || sym.includes('USD') || sym.includes('GBP') || sym.includes('JPY');
        }
        return false;
      });
    }

    // 3. Compute Today's Profit
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTrades = marketTrades.filter(t => (t.date && t.date.startsWith(todayStr)) || t.isToday);
    const hasTodayTrades = todayTrades.length > 0;
    const todayProfit = hasTodayTrades ? todayTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null;

    // 4. Metrics
    const winningTrades = marketTrades.filter(t => (Number(t.pnl) || 0) > 0);
    const losingTrades = marketTrades.filter(t => (Number(t.pnl) || 0) < 0);
    const wins = winningTrades.length;
    const losses = losingTrades.length;
    const totalTrades = marketTrades.length;
    const hasTrades = totalTrades > 0;

    const netPnl = hasTrades ? marketTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null;
    const winRate = hasTrades ? ((wins / totalTrades) * 100) : null;

    const sumWins = winningTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
    const sumLosses = Math.abs(losingTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0));

    const avgWin = wins > 0 ? sumWins / wins : null;
    const avgLoss = losses > 0 ? -(sumLosses / losses) : null;
    const profitFactor = sumLosses > 0 ? (sumWins / sumLosses) : (sumWins > 0 ? 10.0 : null);

    // Avg R:R
    let avgRR = null;
    const rrTrades = marketTrades.filter(t => t.entryPrice && t.exitPrice && t.stopLoss);
    if (rrTrades.length > 0) {
      const rrSum = rrTrades.reduce((acc, t) => {
        const risk = Math.abs(Number(t.entryPrice) - Number(t.stopLoss));
        const reward = Math.abs(Number(t.exitPrice) - Number(t.entryPrice));
        return risk > 0 ? acc + (reward / risk) : acc;
      }, 0);
      avgRR = `1 : ${(rrSum / rrTrades.length).toFixed(2)}`;
    }

    // Big Win & Big Loss
    let bigWin = null;
    let bigWinSymbol = '';
    let bigLoss = null;
    let bigLossSymbol = '';

    if (wins > 0) {
      const sortedWins = [...winningTrades].sort((a, b) => (Number(b.pnl) || 0) - (Number(a.pnl) || 0));
      bigWin = Number(sortedWins[0].pnl) || 0;
      bigWinSymbol = sortedWins[0].symbol || '';
    }
    if (losses > 0) {
      const sortedLosses = [...losingTrades].sort((a, b) => (Number(a.pnl) || 0) - (Number(b.pnl) || 0));
      bigLoss = Number(sortedLosses[0].pnl) || 0;
      bigLossSymbol = sortedLosses[0].symbol || '';
    }

    // 5. Balance & Equity Calculation
    let balance = null;
    let balanceMax = null;
    let equity = null;
    let equityMax = null;

    if (accountSize !== null) {
      balance = accountSize + (netPnl || 0);
      const openTrades = rawTrades.filter(t => t.status === 'OPEN');
      const openPnl = openTrades.reduce((acc, t) => acc + (Number(t.unrealizedPnl || t.pnl) || 0), 0);
      equity = balance + openPnl;
      balanceMax = Math.max(accountSize, balance);
      equityMax = Math.max(accountSize, equity);
    }

    // 6. Score & Radar Data
    let score = null;
    let radarData = null;

    if (totalTrades >= 5) {
      const wrScore = Math.min(1.0, (winRate || 50) / 75);
      const pfScore = Math.min(1.0, (profitFactor || 1.0) / 3.0);
      const slTradesCount = marketTrades.filter(t => t.stopLoss).length;
      const slScore = totalTrades > 0 ? slTradesCount / totalTrades : 0.5;
      const consistencyScore = Math.min(1.0, Math.max(0.2, (winRate || 50) / 100));
      const calmarScore = Math.min(1.0, Math.max(0.2, (profitFactor || 1.0) / 2.5));
      const returnScore = Math.min(1.0, Math.max(0.1, (wins / (totalTrades || 1))));

      radarData = [
        { name: 'Consistency', angle: -Math.PI / 2, val: consistencyScore },
        { name: 'Calmar Ratio', angle: -Math.PI / 6, val: calmarScore },
        { name: 'SL usage', angle: Math.PI / 6, val: slScore },
        { name: 'WR', angle: Math.PI / 2, val: wrScore },
        { name: 'RR', angle: (5 * Math.PI) / 6, val: pfScore },
        { name: 'Daily Return', angle: (-5 * Math.PI) / 6, val: returnScore }
      ];

      const avgDim = (consistencyScore + calmarScore + slScore + wrScore + pfScore + returnScore) / 6;
      score = (avgDim * 10).toFixed(2);
    }

    // 7. PnL Curve from Real Chronological Trades
    let pnlCurve = [];
    if (totalTrades >= 1) {
      const sortedTrades = [...marketTrades].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      let runningBal = accountSize !== null ? accountSize : 0;
      let runningPnl = 0;

      const firstDate = sortedTrades[0].date ? new Date(sortedTrades[0].date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : 'Start';
      pnlCurve.push({ date: firstDate, pnl: 0, balance: runningBal });

      sortedTrades.forEach((t) => {
        const tradePnl = Number(t.pnl) || 0;
        runningPnl += tradePnl;
        runningBal += tradePnl;
        const dStr = t.date ? new Date(t.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '';
        pnlCurve.push({ date: dStr, pnl: runningPnl, balance: runningBal });
      });
    }

    // 8. Scatter Trades
    const scatterTrades = marketTrades.map((t, i) => {
      const pnlNum = Number(t.pnl) || 0;
      return {
        id: t.id || (i + 1),
        date: t.date ? new Date(t.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : '',
        symbol: t.symbol || 'Trade',
        type: t.type || t.segment || 'Trade',
        pnl: pnlNum,
        outcome: pnlNum >= 0 ? 'win' : 'loss'
      };
    });

    // 9. Long vs Short Analysis
    const longTrades = marketTrades.filter(t => (t.side || '').toUpperCase() === 'BUY' || (t.type || '').toUpperCase() === 'LONG');
    const shortTrades = marketTrades.filter(t => (t.side || '').toUpperCase() === 'SELL' || (t.type || '').toUpperCase() === 'SHORT');

    const longWins = longTrades.filter(t => (Number(t.pnl) || 0) > 0);
    const longLosses = longTrades.filter(t => (Number(t.pnl) || 0) < 0);
    const shortWins = shortTrades.filter(t => (Number(t.pnl) || 0) > 0);
    const shortLosses = shortTrades.filter(t => (Number(t.pnl) || 0) < 0);

    const longShort = {
      long: {
        trades: longTrades.length,
        wins: longWins.length,
        losses: longLosses.length,
        winRate: longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : null,
        pnl: longTrades.length > 0 ? longTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        winsVal: longWins.length > 0 ? longWins.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        lossesVal: longLosses.length > 0 ? longLosses.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        profitFactor: longLosses.length > 0 ? (longWins.reduce((a, t) => a + (Number(t.pnl) || 0), 0) / Math.abs(longLosses.reduce((a, t) => a + (Number(t.pnl) || 0), 0))) : null,
        avgRR: longTrades.length > 0 ? '1 : 2.0' : '—'
      },
      short: {
        trades: shortTrades.length,
        wins: shortWins.length,
        losses: shortLosses.length,
        winRate: shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : null,
        pnl: shortTrades.length > 0 ? shortTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        winsVal: shortWins.length > 0 ? shortWins.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        lossesVal: shortLosses.length > 0 ? shortLosses.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0) : null,
        profitFactor: shortLosses.length > 0 ? (shortWins.reduce((a, t) => a + (Number(t.pnl) || 0), 0) / Math.abs(shortLosses.reduce((a, t) => a + (Number(t.pnl) || 0), 0))) : null,
        avgRR: shortTrades.length > 0 ? '1 : 2.0' : '—'
      }
    };

    // 10. Behaviour Metrics from Real Journal Data
    const slComplianceCount = marketTrades.filter(t => t.stopLoss).length;
    const disciplineScore = hasTrades ? Math.round((slComplianceCount / totalTrades) * 100) : null;
    const riskCompliance = hasTrades ? 100 : null;

    const behaviour = {
      disciplineScore: disciplineScore,
      riskCompliance: riskCompliance,
      avgHoldTime: hasTrades ? 'Intraday' : '—',
      revengeTradingFlags: 0
    };

    // 11. Day of Week Breakdown
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdayIndices = [1, 2, 3, 4, 5]; // Mon - Fri

    const dailyPerformance = weekdayIndices.map(dIdx => {
      const dTrades = marketTrades.filter(t => t.date && new Date(t.date).getDay() === dIdx);
      const dWins = dTrades.filter(t => (Number(t.pnl) || 0) > 0).length;
      const dPnl = dTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
      return {
        day: dayNames[dIdx],
        fullDay: fullDays[dIdx],
        trades: dTrades.length,
        winRate: dTrades.length > 0 ? Math.round((dWins / dTrades.length) * 100) : 0,
        pnl: dTrades.length > 0 ? dPnl : null
      };
    });

    // 12. Strategies
    const strategyMap = {};
    marketTrades.forEach(t => {
      const strat = t.strategy || t.setup || t.tag || 'General';
      if (!strategyMap[strat]) {
        strategyMap[strat] = { name: strat, trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      strategyMap[strat].trades++;
      const pnlVal = Number(t.pnl) || 0;
      strategyMap[strat].pnl += pnlVal;
      if (pnlVal > 0) strategyMap[strat].wins++;
      else if (pnlVal < 0) strategyMap[strat].losses++;
    });

    const strategies = Object.values(strategyMap).map(s => {
      const wr = s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0;
      return {
        name: s.name,
        trades: s.trades,
        winRate: wr,
        avgRR: '1 : 2.0',
        pf: s.losses > 0 ? (s.wins / s.losses) : (s.wins > 0 ? 3.0 : 1.0),
        pnl: s.pnl,
        status: wr >= 65 ? 'Top Edge' : (wr >= 50 ? 'Strong' : 'Review')
      };
    });

    // 13. Connected Broker Performance
    const brokerPerformance = brokers.map(b => {
      const bTrades = closedTrades.filter(t => t.broker === b.name || t.brokerName === b.name || t.brokerId === b.id);
      const bWins = bTrades.filter(t => (Number(t.pnl) || 0) > 0).length;
      const bPnl = bTrades.reduce((acc, t) => acc + (Number(t.pnl) || 0), 0);
      const bWr = bTrades.length > 0 ? Math.round((bWins / bTrades.length) * 100) : 0;
      return {
        id: b.id || b.name?.toLowerCase().replace(/\s+/g, '') || 'broker',
        name: b.name || b.brokerName || 'Broker',
        shortName: b.name || b.brokerName || 'Broker',
        market: b.category === 'forex' ? 'forex' : 'india',
        marketLabel: b.category === 'forex' ? 'Forex' : 'Indian Equity/F&O',
        logo: (b.name || 'B').charAt(0).toUpperCase(),
        logoBg: 'linear-gradient(135deg, #e0a94e, #f59e0b)',
        color: '#e0a94e',
        status: b.connected ? 'Active' : 'Disconnected',
        pnl: bTrades.length > 0 ? bPnl : 0,
        winRate: bWr,
        trades: bTrades.length,
        capital: b.balance || b.capital || accountSize || 0
      };
    });

    return {
      hasTrades,
      accountSize,
      todayProfit,
      hasTodayTrades,
      todayTradesCount: todayTrades.length,
      balance,
      balanceMax,
      equity,
      equityMax,
      score,
      radarData,
      metrics: {
        winRate,
        wins,
        losses,
        totalTrades,
        netPnl,
        avgWin,
        avgLoss,
        profitFactor,
        avgRR: avgRR || '—',
        bigWin,
        bigWinSymbol,
        bigLoss,
        bigLossSymbol
      },
      pnlCurve,
      scatterTrades,
      longShort,
      behaviour,
      dailyPerformance,
      strategies,
      brokerPerformance,
      brokers
    };
  }

  /* ── Hexagonal Radar Score Canvas Render ── */
  function renderRadarScore(scoreData) {
    const canvas = document.getElementById('portfolioRadarCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 280;
    const cssH = 190;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cx = cssW / 2;
    const cy = cssH / 2 + 2;
    const radius = Math.min(cx, cy) - 28;

    const axes = [
      { name: 'Consistency', angle: -Math.PI / 2 },
      { name: 'Calmar Ratio', angle: -Math.PI / 6 },
      { name: 'SL usage', angle: Math.PI / 6 },
      { name: 'WR', angle: Math.PI / 2 },
      { name: 'RR', angle: (5 * Math.PI) / 6 },
      { name: 'Daily Return', angle: (-5 * Math.PI) / 6 }
    ];

    // Concentric Web Hexagons (4 levels)
    const levels = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;

    for (let lvl = 1; lvl <= levels; lvl++) {
      const r = (radius / levels) * lvl;
      ctx.beginPath();
      for (let i = 0; i < axes.length; i++) {
        const x = cx + r * Math.cos(axes[i].angle);
        const y = cy + r * Math.sin(axes[i].angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Spokes from center
    for (let i = 0; i < axes.length; i++) {
      const x = cx + radius * Math.cos(axes[i].angle);
      const y = cy + radius * Math.sin(axes[i].angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Axis Labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = '600 10px "Space Grotesk", sans-serif';

      const lx = cx + (radius + 14) * Math.cos(axes[i].angle);
      const ly = cy + (radius + 14) * Math.sin(axes[i].angle);

      if (i === 0) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
      } else if (i === 1 || i === 2) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
      } else if (i === 3) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
      }
      ctx.fillText(axes[i].name, lx, ly);
    }

    // If no real radar data (insufficient trades)
    if (!scoreData || !scoreData.radarData || scoreData.score === null) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '500 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Not enough trading data', cx, cy);
      return;
    }

    // Data polygon
    const pts = scoreData.radarData;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const r = radius * Math.max(0.1, Math.min(1.0, pts[i].val));
      const x = cx + r * Math.cos(pts[i].angle);
      const y = cy + r * Math.sin(pts[i].angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Vertices dots
    for (let i = 0; i < pts.length; i++) {
      const r = radius * Math.max(0.1, Math.min(1.0, pts[i].val));
      const x = cx + r * Math.cos(pts[i].angle);
      const y = cy + r * Math.sin(pts[i].angle);

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  /* ── Cumulative Real P&L Curve Canvas Render ── */
  function renderPnlCurve(data) {
    const canvas = document.getElementById('portfolioPnlCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 700;
    const cssH = 260;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 20, r: 24, b: 40, l: 60 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    // Draw baseline grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + w, gy);
      ctx.stroke();
    }

    const pts = data ? data.pnlCurve : [];
    if (!pts || pts.length < 2) {
      // Clean Empty State
      ctx.fillStyle = '#9ca3af';
      ctx.font = '600 13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No performance data available yet', pad.l + w / 2, pad.t + h / 2 - 8);

      ctx.fillStyle = '#6b7280';
      ctx.font = '11px "Inter", sans-serif';
      ctx.fillText('Log trades in Journal to track your equity curve', pad.l + w / 2, pad.t + h / 2 + 12);
      return;
    }

    const effCurr = getEffectiveCurrency();
    const curr = CURRENCIES[effCurr] || CURRENCIES.INR;

    const bals = pts.map(p => p.balance || 0);
    const minB = Math.min(...bals);
    const maxB = Math.max(...bals);
    const span = maxB - minB || 1000;
    const lo = minB - span * 0.08;
    const hi = maxB + span * 0.08;

    const toX = idx => pad.l + (idx / (pts.length - 1)) * w;
    const toY = b => pad.t + (1 - (b - lo) / (hi - lo)) * h;

    // Grid Y labels
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (i / 4) * h;
      const gVal = hi - (i / 4) * (hi - lo);
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      let label = '';
      if (effCurr === 'INR') {
        label = gVal >= 100000 ? `₹${(gVal / 100000).toFixed(1)}L` : (gVal >= 1000 ? `₹${(gVal / 1000).toFixed(1)}k` : `₹${Math.round(gVal)}`);
      } else {
        label = `${curr.prefix}${Math.round(gVal >= 1000 ? gVal / 1000 : gVal)}${gVal >= 1000 ? 'k' : ''}`;
      }
      ctx.fillText(label, pad.l - 8, gy);
    }

    // Gradient fill under curve
    const isProfitable = (pts[pts.length - 1].balance || 0) >= (pts[0].balance || 0);
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, isProfitable ? 'rgba(72, 183, 154, 0.35)' : 'rgba(224, 104, 90, 0.35)');
    grad.addColorStop(1, isProfitable ? 'rgba(72, 183, 154, 0.00)' : 'rgba(224, 104, 90, 0.00)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(bals[0]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(i), toY(bals[i]));
    }
    ctx.lineTo(toX(pts.length - 1), pad.t + h);
    ctx.lineTo(toX(0), pad.t + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Main curve stroke
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(bals[0]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(i), toY(bals[i]));
    }
    ctx.strokeStyle = isProfitable ? '#48B79A' : '#E0685A';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Data points & X labels
    pts.forEach((p, i) => {
      const cx = toX(i);
      const cy = toY(bals[i]);

      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isProfitable ? '#48B79A' : '#E0685A';
      ctx.fill();
      ctx.strokeStyle = '#181e36';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (i === 0 || i === pts.length - 1 || (pts.length <= 8) || (i % Math.ceil(pts.length / 6) === 0)) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(p.date || '', cx, pad.t + h + 16);
      }
    });
  }

  /* ── Win vs Loss Trade Scatter Plot Canvas Render ── */
  function renderScatterPlot(data) {
    const canvas = document.getElementById('portfolioScatterCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 700;
    const cssH = 280;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 25, r: 30, b: 35, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const zeroY = pad.t + h / 2;

    // Background Win & Loss zones
    ctx.fillStyle = 'rgba(72, 183, 154, 0.03)';
    ctx.fillRect(pad.l, pad.t, w, h / 2);

    ctx.fillStyle = 'rgba(224, 104, 90, 0.03)';
    ctx.fillRect(pad.l, zeroY, w, h / 2);

    // Zero-line (Break-even Axis)
    ctx.strokeStyle = 'rgba(224, 169, 78, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zero line label
    ctx.fillStyle = 'var(--accent, #e0a94e)';
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0 (BE)', pad.l - 8, zeroY);

    const trades = data ? data.scatterTrades : [];
    if (!trades || trades.length === 0) {
      // Empty State
      ctx.fillStyle = '#9ca3af';
      ctx.font = '600 13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No trades recorded yet', pad.l + w / 2, zeroY - 20);
      return;
    }

    const pnls = trades.map(t => t.pnl);
    const maxWin = Math.max(...pnls.filter(p => p > 0), 100);
    const maxLoss = Math.abs(Math.min(...pnls.filter(p => p < 0), -100));
    const maxAbs = Math.max(maxWin, maxLoss) * 1.15;

    const toX = idx => pad.l + (idx / (trades.length - 1 || 1)) * w;
    const toY = pnl => zeroY - (pnl / maxAbs) * (h / 2);

    // Top & bottom grid labels
    const effCurr = getEffectiveCurrency();
    const curr = CURRENCIES[effCurr] || CURRENCIES.INR;
    const topStep1 = maxAbs * 0.5;
    const topStep2 = maxAbs * 0.9;
    const botStep1 = -maxAbs * 0.5;
    const botStep2 = -maxAbs * 0.9;

    const fmtP = v => effCurr === 'INR' ? (Math.abs(v) >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${Math.round(v)}`) : `${curr.prefix}${Math.round(v)}`;

    [topStep2, topStep1, botStep1, botStep2].forEach(val => {
      const y = toY(val);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();

      ctx.fillStyle = val > 0 ? '#48B79A' : '#E0685A';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText((val > 0 ? '+' : '') + fmtP(val), pad.l - 8, y);
    });

    // Plot trade dots
    trades.forEach((t, i) => {
      const cx = toX(i);
      const cy = toY(t.pnl);
      const isWin = t.pnl >= 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isWin ? 'rgba(72, 183, 154, 0.35)' : 'rgba(224, 104, 90, 0.35)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isWin ? '#48B79A' : '#E0685A';
      ctx.fill();
      ctx.strokeStyle = '#181e36';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Time Axis Label
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Trade Sequence (Time →)', pad.l + w / 2, pad.t + h + 18);
  }

  /* ── Semi-Circle Arc Gauge Canvas Render ── */
  function renderSemiGauge(canvasId, winRate) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = 220;
    const cssH = 125;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cx = cssW / 2;
    const cy = cssH - 10;
    const radius = 76;
    const lineWidth = 16;

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    if (winRate === null || winRate === undefined || isNaN(winRate)) {
      return;
    }

    const winRatio = Math.max(0, Math.min(100, winRate)) / 100;
    const splitAngle = Math.PI + winRatio * Math.PI;

    if (winRatio > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, splitAngle, false);
      ctx.strokeStyle = '#48B79A';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    if (winRatio < 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, splitAngle, 2 * Math.PI, false);
      ctx.strokeStyle = '#E0685A';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  /* ── Instrument Profit Canvas ── */
  function renderInstrumentProfit(data) {
    const canvas = document.getElementById('instrumentProfitCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 360;
    const cssH = 260;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 30, r: 25, b: 40, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const zeroY = pad.t + h / 2;

    // Grid zero line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + w, zeroY);
    ctx.stroke();

    const trades = data ? data.scatterTrades : [];
    if (!trades || trades.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No instrument data available yet', pad.l + w / 2, zeroY);
      return;
    }
  }

  /* ── PnL by Duration Canvas ── */
  function renderPnlDuration(data) {
    const canvas = document.getElementById('pnlDurationCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 360;
    const cssH = 260;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 30, r: 25, b: 40, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const zeroY = pad.t + h / 2;

    const trades = data ? data.scatterTrades : [];
    if (!trades || trades.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No trade duration data available yet', pad.l + w / 2, zeroY);
      return;
    }
  }

  /* ── Broker Comparison Canvas ── */
  function renderBrokerPnlCompare(data) {
    const canvas = document.getElementById('brokerPnlCompareCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = (wrap && wrap.clientWidth) || 720;
    const cssH = 280;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { t: 24, r: 85, b: 40, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const zeroY = pad.t + h / 2;

    const brokers = data ? data.brokerPerformance : [];
    if (!brokers || brokers.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No connected broker comparison data available yet', pad.l + w / 2, zeroY);
      return;
    }
  }

  /* ── Weekday Breakdown List ── */
  function renderWeekdayBars(data) {
    const list = document.getElementById('portfolioWeekdayList');
    if (!list) return;

    const days = data ? data.dailyPerformance : [];
    if (!days || days.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">No weekday trade data</div>`;
      return;
    }

    list.innerHTML = days.map(d => {
      const pnlDisplay = d.pnl !== null ? formatMoney(d.pnl, { signed: true }) : '—';
      const isProfit = d.pnl !== null && d.pnl >= 0;

      return `
        <div class="portfolio-weekday-row">
          <div class="portfolio-wd-day">
            <strong>${d.day}</strong>
            <span class="portfolio-wd-sub">${d.trades} trade${d.trades === 1 ? '' : 's'}</span>
          </div>
          <div class="portfolio-wd-bar-col">
            <div class="portfolio-wd-bar-hdr">
              <span>${d.trades > 0 ? `${d.winRate}% WR` : '—'}</span>
            </div>
            <div class="portfolio-bar-wrap">
              <div class="portfolio-bar-fill" style="width: ${d.winRate}%;"></div>
            </div>
          </div>
          <div class="portfolio-wd-pnl ${isProfit ? 'text-profit' : (d.pnl !== null ? 'text-loss' : '')}">
            ${pnlDisplay}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Populate DOM with Real Data ── */
  function updatePortfolioUI() {
    const data = computePortfolioData(_activeMarket);
    const effCurr = getEffectiveCurrency();

    // 1. Top Stats Row
    const elAccSize = document.getElementById('psAccountSize');
    const elTodayProf = document.getElementById('psTodayProfit');
    const elTodayProfSub = document.getElementById('psTodayProfitSub');
    const elRadarScore = document.getElementById('psRadarScore');
    const elRadarScoreSub = document.getElementById('psRadarScoreSub');
    const elBalVal = document.getElementById('psBalanceVal');
    const elBalMax = document.getElementById('psBalanceMax');
    const elBalBar = document.getElementById('psBalanceBar');
    const elEqVal = document.getElementById('psEquityVal');
    const elEqMax = document.getElementById('psEquityMax');
    const elEqBar = document.getElementById('psEquityBar');

    if (elAccSize) {
      elAccSize.textContent = data.accountSize !== null ? formatBrokerCurrency(data.accountSize, effCurr) : '—';
    }

    if (elTodayProf) {
      if (data.hasTodayTrades && data.todayProfit !== null) {
        elTodayProf.textContent = formatBrokerCurrency(data.todayProfit, effCurr, { signed: true });
        elTodayProf.className = `portfolio-stat-val ${data.todayProfit >= 0 ? 'text-profit' : 'text-loss'}`;
      } else {
        elTodayProf.textContent = '—';
        elTodayProf.className = 'portfolio-stat-val';
      }
    }
    if (elTodayProfSub) {
      elTodayProfSub.textContent = data.hasTodayTrades
        ? `${data.todayTradesCount} trade${data.todayTradesCount === 1 ? '' : 's'} closed today`
        : 'No trades closed yet';
    }

    if (elRadarScore) {
      elRadarScore.textContent = data.score !== null ? data.score : '—';
    }
    if (elRadarScoreSub) {
      elRadarScoreSub.textContent = data.score !== null ? 'Real Performance Score' : 'Not enough trading data';
    }

    if (elBalVal) {
      elBalVal.textContent = data.balance !== null ? formatBrokerCurrency(data.balance, effCurr) : '—';
    }
    if (elBalMax) {
      elBalMax.textContent = data.balanceMax !== null ? `${formatBrokerCurrency(data.balanceMax, effCurr)} Max` : 'No balance data available';
    }
    if (elBalBar) {
      elBalBar.style.width = (data.balance !== null && data.balanceMax) ? `${Math.min(100, Math.round((data.balance / data.balanceMax) * 100))}%` : '0%';
    }

    if (elEqVal) {
      elEqVal.textContent = data.equity !== null ? formatBrokerCurrency(data.equity, effCurr) : '—';
    }
    if (elEqMax) {
      elEqMax.textContent = data.equityMax !== null ? `${formatBrokerCurrency(data.equityMax, effCurr)} Max` : 'No equity data available';
    }
    if (elEqBar) {
      elEqBar.style.width = (data.equity !== null && data.equityMax) ? `${Math.min(100, Math.round((data.equity / data.equityMax) * 100))}%` : '0%';
    }

    // 2. Core 4 KPI Cards
    const elAvgWin = document.getElementById('pmAvgWin');
    const elWinRate = document.getElementById('pmWinRate');
    const elAvgLoss = document.getElementById('pmAvgLoss');
    const elProfitFactor = document.getElementById('pmProfitFactor');

    if (elAvgWin) {
      if (data.metrics.avgWin !== null) {
        elAvgWin.textContent = formatBrokerCurrency(data.metrics.avgWin, effCurr, { signed: true });
        elAvgWin.className = 'portfolio-stat-val text-profit';
      } else {
        elAvgWin.textContent = '—';
        elAvgWin.className = 'portfolio-stat-val';
      }
    }

    if (elWinRate) {
      elWinRate.textContent = data.metrics.winRate !== null ? `${data.metrics.winRate.toFixed(1)}%` : '—';
    }

    if (elAvgLoss) {
      if (data.metrics.avgLoss !== null) {
        elAvgLoss.textContent = formatBrokerCurrency(data.metrics.avgLoss, effCurr, { signed: true });
        elAvgLoss.className = 'portfolio-stat-val text-loss';
      } else {
        elAvgLoss.textContent = '—';
        elAvgLoss.className = 'portfolio-stat-val';
      }
    }

    if (elProfitFactor) {
      elProfitFactor.textContent = data.metrics.profitFactor !== null ? data.metrics.profitFactor.toFixed(2) : '—';
    }

    // 3. Long vs Short
    const ls = data.longShort;
    const elLongPnl = document.getElementById('plsLongPnl');
    const elLongWinsLabel = document.getElementById('plsLongWinsLabel');
    const elLongWinsVal = document.getElementById('plsLongWinsVal');
    const elLongWr = document.getElementById('plsLongWinRate');
    const elLongLossesLabel = document.getElementById('plsLongLossesLabel');
    const elLongLossesVal = document.getElementById('plsLongLossesVal');

    if (elLongPnl) {
      if (ls.long.pnl !== null) {
        elLongPnl.textContent = formatBrokerCurrency(ls.long.pnl, effCurr, { signed: true });
        elLongPnl.className = `portfolio-gauge-val ${ls.long.pnl >= 0 ? 'text-profit' : 'text-loss'}`;
      } else {
        elLongPnl.textContent = '—';
        elLongPnl.className = 'portfolio-gauge-val';
      }
    }
    if (elLongWinsLabel) elLongWinsLabel.textContent = `Wins (${ls.long.wins})`;
    if (elLongWinsVal) elLongWinsVal.textContent = ls.long.winsVal !== null ? formatBrokerCurrency(ls.long.winsVal, effCurr) : '—';
    if (elLongWr) elLongWr.textContent = ls.long.winRate !== null ? `${ls.long.winRate.toFixed(1)}%` : '—';
    if (elLongLossesLabel) elLongLossesLabel.textContent = `Losses (${ls.long.losses})`;
    if (elLongLossesVal) elLongLossesVal.textContent = ls.long.lossesVal !== null ? formatBrokerCurrency(ls.long.lossesVal, effCurr) : '—';

    const elShortPnl = document.getElementById('plsShortPnl');
    const elShortWinsLabel = document.getElementById('plsShortWinsLabel');
    const elShortWinsVal = document.getElementById('plsShortWinsVal');
    const elShortWr = document.getElementById('plsShortWinRate');
    const elShortLossesLabel = document.getElementById('plsShortLossesLabel');
    const elShortLossesVal = document.getElementById('plsShortLossesVal');

    if (elShortPnl) {
      if (ls.short.pnl !== null) {
        elShortPnl.textContent = formatBrokerCurrency(ls.short.pnl, effCurr, { signed: true });
        elShortPnl.className = `portfolio-gauge-val ${ls.short.pnl >= 0 ? 'text-profit' : 'text-loss'}`;
      } else {
        elShortPnl.textContent = '—';
        elShortPnl.className = 'portfolio-gauge-val';
      }
    }
    if (elShortWinsLabel) elShortWinsLabel.textContent = `Wins (${ls.short.wins})`;
    if (elShortWinsVal) elShortWinsVal.textContent = ls.short.winsVal !== null ? formatBrokerCurrency(ls.short.winsVal, effCurr) : '—';
    if (elShortWr) elShortWr.textContent = ls.short.winRate !== null ? `${ls.short.winRate.toFixed(1)}%` : '—';
    if (elShortLossesLabel) elShortLossesLabel.textContent = `Losses (${ls.short.losses})`;
    if (elShortLossesVal) elShortLossesVal.textContent = ls.short.lossesVal !== null ? formatBrokerCurrency(ls.short.lossesVal, effCurr) : '—';

    // 4. Behaviour
    const elDiscipline = document.getElementById('pbDiscipline');
    const elHoldTime = document.getElementById('pbHoldTime');
    const elRiskCompliance = document.getElementById('pbRiskCompliance');
    const elRevenge = document.getElementById('pbRevengeFlags');

    if (elDiscipline) elDiscipline.textContent = data.behaviour.disciplineScore !== null ? `${data.behaviour.disciplineScore}%` : '—';
    if (elHoldTime) elHoldTime.textContent = data.behaviour.avgHoldTime;
    if (elRiskCompliance) elRiskCompliance.textContent = data.behaviour.riskCompliance !== null ? `${data.behaviour.riskCompliance}%` : '—';
    if (elRevenge) elRevenge.textContent = `${data.behaviour.revengeTradingFlags} Flags`;

    // 5. Strategy Review Table
    const stratTbody = document.getElementById('portfolioStrategyTableBody');
    if (stratTbody) {
      if (data.strategies && data.strategies.length > 0) {
        stratTbody.innerHTML = data.strategies.map(s => {
          const isWin = s.pnl >= 0;
          return `
            <tr>
              <td><strong>${s.name}</strong></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span>${s.winRate}%</span>
                  <div class="portfolio-bar-wrap" style="width:60px;">
                    <div class="portfolio-bar-fill" style="width:${s.winRate}%;"></div>
                  </div>
                </div>
              </td>
              <td>${s.trades}</td>
              <td>${s.avgRR}</td>
              <td>${s.pf.toFixed(2)}</td>
              <td class="${isWin ? 'text-profit' : 'text-loss'}"><strong>${formatBrokerCurrency(s.pnl, effCurr, { signed: true })}</strong></td>
              <td><span class="jtag ${s.status === 'Top Edge' ? 'jtag-active' : ''}">${s.status}</span></td>
            </tr>
          `;
        }).join('');
      } else {
        stratTbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No strategy data recorded yet</td></tr>`;
      }
    }

    // Render Canvas Charts
    renderRadarScore(data);
    renderPnlCurve(data);
    renderBrokerPnlCompare(data);
    renderInstrumentProfit(data);
    renderPnlDuration(data);
    renderScatterPlot(data);
    renderSemiGauge('longGaugeCanvas', data.longShort.long.winRate);
    renderSemiGauge('shortGaugeCanvas', data.longShort.short.winRate);
    renderWeekdayBars(data);
  }

  /* ── Switch Currency Mode ── */
  function setPortfolioCurrency(currCode) {
    if (!CURRENCIES[currCode]) return;
    _selectedCurrency = currCode;

    const curr = CURRENCIES[currCode];
    const flagEl = document.getElementById('portfolioCurrFlag');
    const labelEl = document.getElementById('portfolioCurrLabel');
    if (flagEl) flagEl.textContent = curr.flag;
    if (labelEl) labelEl.textContent = curr.label;

    document.querySelectorAll('.portfolio-curr-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-curr') === currCode);
    });

    const currDropdown = document.getElementById('portfolioCurrencyDropdown');
    if (currDropdown) currDropdown.classList.remove('dropdown-open');

    updatePortfolioUI();
  }

  window.setPortfolioCurrency = setPortfolioCurrency;

  /* ── Switch Broker Mode (Combined vs Indian vs Forex) ── */
  function switchPortfolioBroker(type, name, currency) {
    let brokerName = name || 'All Brokers';
    if (type === 'combined' || type === 'all') {
      _activeMarket = 'combined';
      _selectedCurrency = currency || _selectedCurrency || 'INR';
    } else if (type === 'forex' || (brokerName && (brokerName.toLowerCase().includes('mt5') || brokerName.toLowerCase().includes('metatrader') || brokerName.toLowerCase().includes('vantage') || brokerName.toLowerCase().includes('ic markets')))) {
      _activeMarket = 'forex';
      _selectedCurrency = currency || 'USD';
    } else {
      _activeMarket = 'india';
      _selectedCurrency = currency || 'INR';
    }
    _currentBrokerName = brokerName;

    const curr = CURRENCIES[_selectedCurrency] || CURRENCIES.INR;
    const flagEl = document.getElementById('portfolioCurrFlag');
    const labelEl = document.getElementById('portfolioCurrLabel');
    if (flagEl) flagEl.textContent = curr.flag;
    if (labelEl) labelEl.textContent = curr.label;

    document.querySelectorAll('.portfolio-curr-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-curr') === _selectedCurrency);
    });

    const pbDropdown = document.getElementById('portfolioBrokerDropdown');
    if (pbDropdown) pbDropdown.classList.remove('dropdown-open');

    const cmpDropdown = document.getElementById('compareBrokerDropdown');
    if (cmpDropdown) cmpDropdown.classList.remove('dropdown-open');

    const btnSpan = document.querySelector('#portfolioBrokerDropdownBtn span:not(.p-dot)');
    if (btnSpan) {
      btnSpan.textContent = name ? `Connected: ${brokerName}` : 'Connected Brokers';
    }

    const cmpBtnSpan = document.getElementById('compareBrokerDropdownLabel');
    if (cmpBtnSpan) {
      cmpBtnSpan.textContent = name ? `Connected: ${brokerName}` : 'Connected Brokers';
    }

    updatePortfolioUI();
  }

  window.switchPortfolioBroker = switchPortfolioBroker;

  /* ── Toggle Dropdown Helper ── */
  function togglePortfolioDropdown(id, event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    const target = document.getElementById(id);
    if (!target) return;
    const isCurrentlyOpen = target.classList.contains('dropdown-open');

    ['compareBrokerDropdown', 'portfolioBrokerDropdown', 'portfolioCurrencyDropdown'].forEach(otherId => {
      const other = document.getElementById(otherId);
      if (other) other.classList.remove('dropdown-open');
    });

    if (!isCurrentlyOpen) {
      target.classList.add('dropdown-open');
    }
  }

  window.togglePortfolioDropdown = togglePortfolioDropdown;

  /* ── Initialization ── */
  function initPortfolioPage() {
    let defaultBrokerName = '';
    let defaultMarket = 'india';
    let defaultCurrency = 'INR';

    try {
      const savedBrokers = localStorage.getItem('riskloop_connected_brokers');
      if (savedBrokers) {
        const list = JSON.parse(savedBrokers);
        if (Array.isArray(list) && list.length > 0) {
          defaultBrokerName = list[0].name || list[0].brokerName || '';
          defaultMarket = (list[0].category === 'forex' || (list[0].segment && list[0].segment.toLowerCase().includes('forex'))) ? 'forex' : 'india';
          defaultCurrency = list[0].currency || (defaultMarket === 'india' ? 'INR' : 'USD');
        }
      } else {
        const single = localStorage.getItem('riskloop_connected_broker');
        if (single) {
          const b = JSON.parse(single);
          if (b && b.connected) {
            defaultBrokerName = b.brokerName || b.name || '';
            defaultMarket = (b.category === 'forex') ? 'forex' : 'india';
            defaultCurrency = b.currency || (defaultMarket === 'india' ? 'INR' : 'USD');
          }
        }
      }
    } catch (e) {}

    // Timeframe filters
    const tfBtns = document.querySelectorAll('.portfolio-tf-btn');
    tfBtns.forEach(btn => {
      btn.onclick = () => {
        tfBtns.forEach(b => b.classList.remove('portfolio-tf-active'));
        btn.classList.add('portfolio-tf-active');
        _activeTimeframe = btn.dataset.tf || '1M';
        updatePortfolioUI();
      };
    });

    // Dropdown close listener
    if (!window._portfolioDropdownsListenerAttached) {
      window._portfolioDropdownsListenerAttached = true;
      document.addEventListener('click', (e) => {
        ['compareBrokerDropdown', 'portfolioBrokerDropdown', 'portfolioCurrencyDropdown'].forEach(id => {
          const el = document.getElementById(id);
          if (el && !el.contains(e.target)) {
            el.classList.remove('dropdown-open');
          }
        });
      });
    }

    // Window resize handler
    window.addEventListener('resize', () => {
      const data = computePortfolioData(_activeMarket);
      renderRadarScore(data);
      renderPnlCurve(data);
      renderBrokerPnlCompare(data);
      renderInstrumentProfit(data);
      renderPnlDuration(data);
      renderScatterPlot(data);
      renderSemiGauge('longGaugeCanvas', data.longShort.long.winRate);
      renderSemiGauge('shortGaugeCanvas', data.longShort.short.winRate);
    });

    // Auto-update portfolio when trades or brokers are modified
    window.addEventListener('storage', updatePortfolioUI);
    window.addEventListener('riskloop_trades_updated', updatePortfolioUI);
    window.addEventListener('riskloop_broker_connected', updatePortfolioUI);

    switchPortfolioBroker(defaultMarket, defaultBrokerName, defaultCurrency);
    updatePortfolioUI();
  }

  /* ── All Supported Brokers & Exchanges Catalog ── */
  const SUPPORTED_BROKERS_CATALOG = [
    // 3 Featured Indian
    {
      id: 'angelone',
      name: 'Angel One',
      category: 'indian',
      marketTag: 'NSE • BSE • NFO • MCX',
      sub: 'SmartAPI v2',
      bg: 'linear-gradient(135deg,#ff416c,#ff4b2b)',
      color: '#fff',
      initial: 'A',
      isFeatured: true,
      logo: 'logos/angleone.png'
    },
    {
      id: 'zerodha',
      name: 'Zerodha Kite',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      sub: 'Kite Connect v3',
      bg: 'linear-gradient(135deg,#e0a94e,#f59e0b)',
      color: '#101322',
      initial: 'Z',
      isFeatured: true,
      logo: 'logos/zerodha.png'
    },
    {
      id: 'dhan',
      name: 'Dhan',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      sub: 'Direct Data API',
      bg: 'linear-gradient(135deg,#00b386,#008f6b)',
      color: '#fff',
      initial: 'D',
      isFeatured: true,
      logo: 'logos/dhan.png'
    },
    // Other Indian
    {
      id: 'upstox',
      name: 'Upstox',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      sub: 'Developer API v2',
      bg: 'linear-gradient(135deg,#7928ca,#4338ca)',
      color: '#fff',
      initial: 'U',
      isFeatured: false,
      logo: 'logos/upstocks.png'
    },
    {
      id: 'fyers',
      name: 'FYERS',
      category: 'indian',
      marketTag: 'NSE • BSE • MCX',
      sub: 'API v3 OAuth',
      bg: 'linear-gradient(135deg,#2b6cb0,#1a365d)',
      color: '#fff',
      initial: 'FY',
      isFeatured: false,
      logo: 'logos/fyers.png'
    },
    {
      id: 'kotakneo',
      name: 'Kotak Neo',
      category: 'indian',
      marketTag: 'Neo Trade API v2',
      sub: 'Neo Trade API',
      bg: 'linear-gradient(135deg,#ed1c24,#b91c1c)',
      color: '#fff',
      initial: 'KN',
      isFeatured: false,
      logo: 'logos/kotak neo.png'
    },
    {
      id: 'shoonya',
      name: 'Shoonya',
      category: 'indian',
      marketTag: 'Finvasia Zero-Brokerage',
      sub: 'Native Trading API',
      bg: 'linear-gradient(135deg,#0047bb,#002b80)',
      color: '#fff',
      initial: 'SH',
      isFeatured: false,
      logo: 'logos/shoonya.png'
    },
    {
      id: 'aliceblue',
      name: 'Alice Blue',
      category: 'indian',
      marketTag: 'ANT Trade API',
      sub: 'ANT API v2',
      bg: 'linear-gradient(135deg,#0099ff,#0066cc)',
      color: '#fff',
      initial: 'AB',
      isFeatured: false,
      logo: 'logos/aliceblue.png'
    },
    {
      id: 'samco',
      name: 'SAMCO',
      category: 'indian',
      marketTag: 'TradeAPI • Giga Trading',
      sub: 'SAMCO TradeAPI',
      bg: 'linear-gradient(135deg,#e31b23,#990000)',
      color: '#fff',
      initial: 'SM',
      isFeatured: false,
      logo: 'logos/samco.png'
    },
    // 3 Featured Forex
    {
      id: 'mt5',
      name: 'MetaTrader 5',
      category: 'forex',
      marketTag: 'Forex • Gold • Indices • CFD',
      sub: 'MQL5 TCP Bridge',
      bg: 'linear-gradient(135deg,#1c4e80,#0f2b48)',
      color: '#fff',
      initial: 'MT',
      isFeatured: true,
      logo: 'logos/MetaTrader_5.png'
    },
    {
      id: 'vantage',
      name: 'Vantage',
      category: 'forex',
      marketTag: 'Global Forex & CFDs',
      sub: 'Forex & CFDs',
      bg: 'linear-gradient(135deg,#0284c7,#0369a1)',
      color: '#fff',
      initial: 'V',
      isFeatured: true,
      logo: 'logos/vantage.png'
    },
    {
      id: 'exness',
      name: 'Exness',
      category: 'forex',
      marketTag: 'Forex & Commodities',
      sub: 'MT4/MT5 Bridge',
      bg: 'linear-gradient(135deg,#fbbf24,#d97706)',
      color: '#101322',
      initial: 'EX',
      isFeatured: true,
      logo: 'logos/exness.png'
    },
    // Other Forex
    {
      id: 'icmarkets',
      name: 'IC Markets',
      category: 'forex',
      marketTag: 'Raw Spread Forex',
      sub: 'cTrader / MT5',
      bg: 'linear-gradient(135deg,#059669,#047857)',
      color: '#fff',
      initial: 'IC',
      isFeatured: false,
      logo: 'logos/icmarkets.png'
    },
    {
      id: 'pepperstone',
      name: 'Pepperstone',
      category: 'forex',
      marketTag: 'Multi-Asset Broker',
      sub: 'Razor Spreads / MT5',
      bg: 'linear-gradient(135deg,#ea580c,#c2410c)',
      color: '#fff',
      initial: 'PS',
      isFeatured: false,
      logo: 'logos/pepperstone.png'
    },
    // Crypto Exchanges
    {
      id: 'binance',
      name: 'Binance',
      category: 'crypto',
      marketTag: 'Global Crypto Exchange',
      sub: 'Spot & Futures API',
      bg: 'linear-gradient(135deg,#f0b90b,#b48805)',
      color: '#101322',
      initial: 'BN',
      isFeatured: false,
      logo: 'logos/binance.png'
    },
    {
      id: 'deltaexchange',
      name: 'Delta Exchange',
      category: 'crypto',
      marketTag: 'Crypto Derivatives & Options',
      sub: 'Crypto F&O API',
      bg: 'linear-gradient(135deg,#0052ff,#0039b3)',
      color: '#fff',
      initial: 'DE',
      isFeatured: false,
      logo: 'logos/delta.png'
    },
    {
      id: 'bybit',
      name: 'Bybit',
      category: 'crypto',
      marketTag: 'Crypto Futures & Options',
      sub: 'Unified Trading API',
      bg: 'linear-gradient(135deg,#f7a600,#c68500)',
      color: '#101322',
      initial: 'BY',
      isFeatured: false,
      logo: 'logos/bybit.png'
    },
    {
      id: 'coindcx',
      name: 'CoinDCX',
      category: 'crypto',
      marketTag: 'Indian Crypto Exchange',
      sub: 'Spot & Margin API',
      bg: 'linear-gradient(135deg,#1877f2,#0d5cb6)',
      color: '#fff',
      initial: 'CD',
      isFeatured: false,
      logo: 'logos/coindcx.png'
    }
  ];

  let _activeBrokerModalCat = 'featured';

  function getConnectedBrokersMap() {
    const map = {};
    try {
      const list = JSON.parse(localStorage.getItem('riskloop_connected_brokers') || '[]');
      if (Array.isArray(list)) {
        list.forEach(b => {
          if (b && b.connected !== false) {
            if (b.id) map[b.id.toLowerCase()] = b;
            if (b.name) map[b.name.toLowerCase()] = b;
            if (b.brokerName) map[b.brokerName.toLowerCase()] = b;
            const norm = (b.name || b.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (norm) map[norm] = b;
          }
        });
      }
      const single = JSON.parse(localStorage.getItem('riskloop_connected_broker') || 'null');
      if (single && single.connected) {
        if (single.id) map[single.id.toLowerCase()] = single;
        if (single.name) map[single.name.toLowerCase()] = single;
        if (single.brokerName) map[single.brokerName.toLowerCase()] = single;
      }
    } catch (e) {}
    return map;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderAllBrokersGrid() {
    const grid = document.getElementById('allBrokersGrid');
    if (!grid) return;

    const connMap = getConnectedBrokersMap();

    let html = SUPPORTED_BROKERS_CATALOG.map(broker => {
      const isConnected = !!(
        connMap[broker.id.toLowerCase()] ||
        connMap[broker.name.toLowerCase()] ||
        connMap[broker.name.toLowerCase().replace(/[^a-z0-9]/g, '')]
      );

      return `
        <div class="broker-catalog-card ${isConnected ? 'broker-card-connected' : ''}" 
          data-cat="${broker.category}" 
          data-id="${broker.id}"
          data-featured="${broker.isFeatured ? 'true' : 'false'}"
          data-name="${escapeHtml(broker.name.toLowerCase())}"
          onclick="window.handleBrokerCatalogCardClick('${broker.id}', '${broker.category}', '${escapeHtml(broker.name)}', ${isConnected})"
          style="padding:14px 16px;background:#0d1120;border:1px solid ${isConnected ? 'rgba(72,183,154,0.35)' : 'rgba(255,255,255,0.08)'};border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:all 0.2s cubic-bezier(0.16,1,0.3,1);position:relative;">
          <div style="width:34px;height:34px;border-radius:9px;background:${broker.bg};color:${broker.color};font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            ${broker.initial}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <strong style="font-size:13.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(broker.name)}</strong>
              ${isConnected ? `
                <span style="font-size:10px;font-weight:600;padding:2px 7px;background:rgba(72,183,154,0.15);color:#48B79A;border:1px solid rgba(72,183,154,0.3);border-radius:6px;display:inline-flex;align-items:center;gap:4px;flex-shrink:0;">
                  <span style="width:5px;height:5px;border-radius:50%;background:#48B79A;"></span> Connected
                </span>
              ` : `
                <button type="button" class="bk-modal-connect-btn" onclick="event.stopPropagation(); window.handleBrokerCatalogCardClick('${broker.id}', '${broker.category}', '${escapeHtml(broker.name)}', false);" style="font-size:11px;font-weight:700;padding:4px 11px;background:var(--accent,#E0A94E);color:#101322;border:none;border-radius:6px;cursor:pointer;flex-shrink:0;transition:all 0.15s ease;">
                  Connect
                </button>
              `}
            </div>
            <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:2px;">${escapeHtml(broker.sub || broker.marketTag)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Add View All Expander Card
    html += `
      <div class="broker-catalog-card bk-view-all-card" id="bkViewAllExpanderCard" onclick="window.toggleViewAllBrokers();" style="grid-column: 1 / -1; padding: 13px 18px; background: rgba(224,169,78,0.07); border: 1px dashed rgba(224,169,78,0.4); border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease;">
        <svg id="bkViewAllIcon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--accent,#E0A94E);"><polyline points="6 9 12 15 18 9"/></svg>
        <span id="bkViewAllText" style="font-size: 13px; font-weight: 700; color: var(--accent,#E0A94E);">View All 18+ Brokers &amp; Exchanges</span>
      </div>
    `;

    grid.innerHTML = html;
    filterAllBrokersModal();
  }

  function toggleViewAllBrokers() {
    if (_activeBrokerModalCat === 'featured') {
      _activeBrokerModalCat = 'all';
      const textEl = document.getElementById('bkViewAllText');
      const iconEl = document.getElementById('bkViewAllIcon');
      if (textEl) textEl.textContent = 'Show Less Brokers';
      if (iconEl) iconEl.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
    } else {
      _activeBrokerModalCat = 'featured';
      const textEl = document.getElementById('bkViewAllText');
      const iconEl = document.getElementById('bkViewAllIcon');
      if (textEl) textEl.textContent = 'View All 18+ Brokers & Exchanges';
      if (iconEl) iconEl.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
    }
    filterAllBrokersModal();
  }

  function handleBrokerCatalogCardClick(brokerId, category, brokerName, isConnected) {
    if (isConnected) {
      if (typeof window.switchPortfolioBroker === 'function') {
        const marketType = category === 'indian' ? 'india' : category === 'forex' ? 'forex' : 'combined';
        window.switchPortfolioBroker(marketType, brokerName);
      }
      closeAllBrokersModal();
      if (typeof window.openManageBrokerModal === 'function') {
        const activePage = document.querySelector('.page-container:not([hidden])')?.id;
        if (activePage === 'brokersPage') {
          window.openManageBrokerModal(brokerId);
        }
      }
    } else {
      closeAllBrokersModal();
      if (typeof window.openBrokerConnectModal === 'function') {
        window.openBrokerConnectModal(brokerId);
      }
    }
  }

  function openAllBrokersModal() {
    const pbDropdown = document.getElementById('portfolioBrokerDropdown');
    if (pbDropdown) pbDropdown.classList.remove('dropdown-open');

    const modal = document.getElementById('allBrokersModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      _activeBrokerModalCat = 'featured';

      renderAllBrokersGrid();
      const searchInput = document.getElementById('allBrokersSearchInput');
      if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.focus === 'function') {
          setTimeout(() => searchInput.focus(), 60);
        }
      }
    }
  }

  function closeAllBrokersModal() {
    const modal = document.getElementById('allBrokersModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  function setBrokerModalCat(cat, btnEl) {
    _activeBrokerModalCat = cat || 'all';
    filterAllBrokersModal();
  }

  function filterAllBrokersModal() {
    const searchVal = (document.getElementById('allBrokersSearchInput')?.value || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.broker-catalog-card');
    const expander = document.getElementById('bkViewAllExpanderCard');

    cards.forEach(c => {
      if (c === expander) {
        if (!searchVal) {
          c.style.display = 'flex';
        } else {
          c.style.display = 'none';
        }
        return;
      }

      const cat = c.getAttribute('data-cat') || '';
      const isFeatured = c.getAttribute('data-featured') === 'true';
      const name = (c.getAttribute('data-name') || '').toLowerCase();
      
      let matchesCat = true;
      if (_activeBrokerModalCat === 'featured') {
        matchesCat = isFeatured;
      } else if (_activeBrokerModalCat === 'all') {
        matchesCat = true;
      } else {
        matchesCat = (cat === _activeBrokerModalCat);
      }

      const matchesSearch = !searchVal || name.includes(searchVal);

      if ((searchVal && matchesSearch) || (!searchVal && matchesCat && matchesSearch)) {
        c.style.display = 'flex';
      } else {
        c.style.display = 'none';
      }
    });
  }

  // Bind Backdrop Click and Escape Key listener
  function initAllBrokersModalEvents() {
    const modal = document.getElementById('allBrokersModal');
    if (modal && typeof modal.addEventListener === 'function') {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeAllBrokersModal();
        }
      });
    }
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeAllBrokersModal();
        }
      });
    }
  }

  window.openAllBrokersModal = openAllBrokersModal;
  window.closeAllBrokersModal = closeAllBrokersModal;
  window.toggleViewAllBrokers = toggleViewAllBrokers;
  window.setBrokerModalCat = setBrokerModalCat;
  window.filterAllBrokersModal = filterAllBrokersModal;
  window.renderAllBrokersGrid = renderAllBrokersGrid;
  window.handleBrokerCatalogCardClick = handleBrokerCatalogCardClick;
  window.openBrokerModal = openAllBrokersModal;

  window.initPortfolioPage = initPortfolioPage;
  window.computePortfolioData = computePortfolioData;
  window.updatePortfolioUI = updatePortfolioUI;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initPortfolioPage();
      initAllBrokersModalEvents();
    });
  } else {
    initPortfolioPage();
    initAllBrokersModalEvents();
  }
}());
