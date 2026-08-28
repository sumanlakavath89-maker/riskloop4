/* ============================================================
   PORTFOLIO MODULE - RiskLoop
   Analytics, P&L Curve, Win/Loss Scatter Plot, Long/Short Analysis,
   Daily/Behaviour Analysis, Broker-Specific Performance, Strategy Review.
   ============================================================ */

(function () {
  'use strict';

  // State: 'combined', 'india', or 'forex'
  let _activeMarket = 'combined'; 
  let _activeTimeframe = '1M';  // '1W', '1M', '3M', '1Y', 'ALL'
  let _selectedCurrency = 'USD'; // 'USD', 'INR', 'EUR', 'GBP', 'JPY', 'AED', 'CAD'

  // ── Multi-Currency Configuration & Exchange Rates (Base USD) ──
  const CURRENCIES = {
    USD: { code: 'USD', symbol: '$', flag: '💵', label: 'USD ($)', rate: 1.0, precision: 2, prefix: '$' },
    INR: { code: 'INR', symbol: '₹', flag: '🇮🇳', label: 'INR (₹)', rate: 83.5, precision: 2, prefix: '₹' },
    EUR: { code: 'EUR', symbol: '€', flag: '🇪🇺', label: 'EUR (€)', rate: 0.92, precision: 2, prefix: '€' },
    GBP: { code: 'GBP', symbol: '£', flag: '🇬🇧', label: 'GBP (£)', rate: 0.78, precision: 2, prefix: '£' },
    JPY: { code: 'JPY', symbol: '¥', flag: '🇯🇵', label: 'JPY (¥)', rate: 155.0, precision: 0, prefix: '¥' },
    AED: { code: 'AED', symbol: 'د.إ', flag: '🇦🇪', label: 'AED (د.إ)', rate: 3.67, precision: 2, prefix: 'AED ' },
    CAD: { code: 'CAD', symbol: 'C$', flag: '🇨🇦', label: 'CAD (C$)', rate: 1.37, precision: 2, prefix: 'C$' }
  };

  /**
   * Currency formatter helper
   * @param {number} amountUSD - Base amount in USD
   * @param {Object} opts - { signed: boolean, precision: number, absolute: boolean }
   */
  function formatMoney(amountUSD, opts = {}) {
    const curr = CURRENCIES[_selectedCurrency] || CURRENCIES.USD;
    const rate = curr.rate || 1.0;
    const precision = opts.precision !== undefined ? opts.precision : (curr.precision !== undefined ? curr.precision : 2);
    const converted = (amountUSD || 0) * rate;
    const isNegative = converted < 0;
    const absVal = Math.abs(converted);

    let formattedNum = '';
    if (curr.code === 'INR') {
      formattedNum = absVal.toLocaleString('en-IN', {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
      });
    } else {
      formattedNum = absVal.toLocaleString('en-US', {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
      });
    }

    if (opts.absolute) {
      return `${curr.prefix}${formattedNum}`;
    }

    if (opts.signed) {
      if (converted > 0) return `+${curr.prefix}${formattedNum}`;
      if (converted < 0) return `-${curr.prefix}${formattedNum}`;
      return `${curr.prefix}${formattedNum}`;
    }

    if (isNegative) {
      return `-${curr.prefix}${formattedNum}`;
    }
    return `${curr.prefix}${formattedNum}`;
  }

  // ── Combined Portfolio Dataset (Base USD for all currencies) ──
  const COMBINED_DATA = {
    topStats: {
      accountSizeUSD: 5000.00,
      todayProfitUSD: 0.00,
      score: '2.84',
      balanceUSD: 4631.66,
      balanceMaxUSD: 5065.58,
      equityUSD: 4631.66,
      equityMaxUSD: 5124.10
    },
    metrics: {
      winRate: 64.2,
      wins: 53,
      losses: 29,
      totalTrades: 82,
      netPnlUSD: 1116.17, // ~₹93,200
      avgWinUSD: 51.7365, // ~₹4,320
      avgLossUSD: -22.1557, // ~-₹1,850
      profitFactor: 2.68,
      avgRR: '1 : 2.33',
      bigWinUSD: 221.56,
      bigWinSymbol: 'NIFTY 24800 CE',
      bigLossUSD: -62.28,
      bigLossSymbol: 'BANKNIFTY 51200 PE'
    },
    pnlCurve: [
      { date: '1 Jul', pnl: 0, balanceUSD: 5000 },
      { date: '5 Jul', pnl: 50.30, balanceUSD: 5050.30 },
      { date: '9 Jul', pnl: 28.74, balanceUSD: 5079.04 },
      { date: '14 Jul', pnl: 93.41, balanceUSD: 5172.45 },
      { date: '18 Jul', pnl: 142.51, balanceUSD: 5314.96 },
      { date: '23 Jul', pnl: 74.25, balanceUSD: 5389.21 },
      { date: '28 Jul', pnl: -43.11, balanceUSD: 5346.10 },
      { date: '31 Jul', pnl: 57.48, balanceUSD: 5403.58 },
      { date: '4 Aug', pnl: -25.15, balanceUSD: 5378.43 },
      { date: '8 Aug', pnl: 161.68, balanceUSD: 5540.11 },
      { date: '12 Aug', pnl: 53.89, balanceUSD: 5594.00 },
      { date: '16 Aug', pnl: 104.19, balanceUSD: 5698.19 },
      { date: '20 Aug', pnl: 116.17, balanceUSD: 5814.36 },
      { date: '24 Aug', pnl: 301.80, balanceUSD: 6116.16 }
    ],
    scatterTrades: [
      { id: 1, date: '01 Jul', symbol: 'NIFTY CE', type: 'Options', pnlUSD: 50.30, outcome: 'win' },
      { id: 2, date: '02 Jul', symbol: 'EUR/USD', type: 'Forex', pnlUSD: 65.00, outcome: 'win' },
      { id: 3, date: '04 Jul', symbol: 'RELIANCE', type: 'Stock', pnlUSD: 80.84, outcome: 'win' },
      { id: 4, date: '07 Jul', symbol: 'USD/JPY', type: 'Forex', pnlUSD: -45.00, outcome: 'loss' },
      { id: 5, date: '09 Jul', symbol: 'NIFTY PE', type: 'Options', pnlUSD: -28.74, outcome: 'loss' },
      { id: 6, date: '11 Jul', symbol: 'INFY', type: 'Stock', pnlUSD: 65.87, outcome: 'win' },
      { id: 7, date: '14 Jul', symbol: 'GBP/USD', type: 'Forex', pnlUSD: 145.00, outcome: 'win' },
      { id: 8, date: '16 Jul', symbol: 'NIFTY CE', type: 'Options', pnlUSD: 93.41, outcome: 'win' },
      { id: 9, date: '18 Jul', symbol: 'BANKNIFTY', type: 'Options', pnlUSD: -17.96, outcome: 'loss' },
      { id: 10, date: '21 Jul', symbol: 'NIFTY 24800 CE', type: 'Options', pnlUSD: 221.56, outcome: 'win' },
      { id: 11, date: '23 Jul', symbol: 'TCS', type: 'Stock', pnlUSD: 49.10, outcome: 'win' },
      { id: 12, date: '25 Jul', symbol: 'USD/CHF', type: 'Forex', pnlUSD: -62.00, outcome: 'loss' },
      { id: 13, date: '28 Jul', symbol: 'NIFTY FUT', type: 'Futures', pnlUSD: 74.25, outcome: 'win' },
      { id: 14, date: '30 Jul', symbol: 'SBIN', type: 'Stock', pnlUSD: -13.17, outcome: 'loss' },
      { id: 15, date: '01 Aug', symbol: 'EUR/USD', type: 'Forex', pnlUSD: 112.00, outcome: 'win' },
      { id: 16, date: '04 Aug', symbol: 'NIFTY 24800 CE', type: 'Options', pnlUSD: -31.44, outcome: 'loss' },
      { id: 17, date: '04 Aug', symbol: 'BANKNIFTY PE', type: 'Options', pnlUSD: 25.15, outcome: 'win' },
      { id: 18, date: '04 Aug', symbol: 'RELIANCE', type: 'Stock', pnlUSD: -18.86, outcome: 'loss' },
      { id: 19, date: '06 Aug', symbol: 'GBP/USD', type: 'Forex', pnlUSD: 210.00, outcome: 'win' },
      { id: 20, date: '08 Aug', symbol: 'NIFTY 24850 CE', type: 'Options', pnlUSD: 51.50, outcome: 'win' },
      { id: 21, date: '08 Aug', symbol: 'HDFCBANK', type: 'Stock', pnlUSD: 33.53, outcome: 'win' },
      { id: 22, date: '11 Aug', symbol: 'BANKNIFTY', type: 'Options', pnlUSD: 53.89, outcome: 'win' },
      { id: 23, date: '14 Aug', symbol: 'NIFTY 24950 CE', type: 'Options', pnlUSD: 104.19, outcome: 'win' },
      { id: 24, date: '18 Aug', symbol: 'RELIANCE FUT', type: 'Futures', pnlUSD: 43.11, outcome: 'win' },
      { id: 25, date: '20 Aug', symbol: 'BANKNIFTY CE', type: 'Options', pnlUSD: 73.05, outcome: 'win' }
    ],
    longShort: {
      long: {
        pnlUSD: 819.16, // ~₹68,400
        winsLabel: 'Wins (33)',
        winsValUSD: 1450.00,
        winRate: 68.8,
        lossesLabel: 'Losses (15)',
        lossesValUSD: -751.50,
        trades: 48,
        wins: 33,
        losses: 15,
        avgRR: '1 : 2.40',
        profitFactor: 2.9
      },
      short: {
        pnlUSD: 297.00, // ~₹24,800
        winsLabel: 'Wins (20)',
        winsValUSD: 698.50,
        winRate: 57.6,
        lossesLabel: 'Losses (28)',
        lossesValUSD: 1053.06,
        trades: 48,
        wins: 20,
        losses: 28,
        avgRR: '1 : 2.10',
        profitFactor: 2.2
      }
    },
    dailyPerformance: [
      { day: 'Mon', fullDay: 'Monday', trades: 15, winRate: 60.0, pnlUSD: 170.06 }, // ~₹14,200
      { day: 'Tue', fullDay: 'Tuesday', trades: 18, winRate: 72.2, pnlUSD: 341.32 }, // ~₹28,500
      { day: 'Wed', fullDay: 'Wednesday', trades: 20, winRate: 65.0, pnlUSD: 226.35 }, // ~₹18,900
      { day: 'Thu', fullDay: 'Thursday', trades: 17, winRate: 58.8, pnlUSD: 256.29 }, // ~₹21,400
      { day: 'Fri', fullDay: 'Friday', trades: 11, winRate: 52.0, pnlUSD: 122.16 }   // ~₹10,200
    ],
    behaviour: {
      disciplineScore: 92,
      riskCompliance: 98,
      avgHoldTime: '38 mins',
      maxConsecutiveWins: 6,
      maxConsecutiveLosses: 2,
      revengeTradingFlags: 0,
      fomoAlerts: 1
    },
    instrumentPerformance: {
      stocks: {
        name: 'Stock (Equity)',
        winRate: 68.0,
        wins: 21,
        losses: 10,
        trades: 31,
        tradesText: '31 trades (21W · 10L)',
        pnlUSD: 510.18 // ~₹42,600
      },
      fo: {
        name: 'F&O (Futures & Options)',
        winRate: 49.0,
        wins: 25,
        losses: 26,
        trades: 51,
        tradesText: '51 trades (25W · 26L)',
        pnlUSD: 605.99 // ~₹50,600
      }
    },
    marketPerformance: {
      indian: {
        name: 'Indian Market',
        flag: '🇮🇳',
        winRate: 68.0,
        trades: 48,
        wins: 33,
        losses: 15,
        tradesText: '48 trades (33W · 15L)',
        pnlUSD: 582.40 // ~₹48,630.40
      },
      forex: {
        name: 'Forex Market',
        flag: '💱',
        winRate: 66.7,
        trades: 24,
        wins: 16,
        losses: 8,
        tradesText: '24 trades (16W · 8L)',
        pnlUSD: 342.50 // ~₹28,598.75
      },
      crypto: {
        name: 'Crypto Market',
        flag: '🪙',
        winRate: 60.0,
        trades: 10,
        wins: 6,
        losses: 4,
        tradesText: '10 trades (6W · 4L)',
        pnlUSD: 191.27 // ~₹15,971.05
      }
    },
    strategies: [
      { name: 'Breakout', winRate: 76.0, trades: 25, avgRR: '1 : 2.50', pf: 3.20, pnlUSD: 457.49, status: 'Top Edge' }, // ~₹38,200
      { name: 'Trend Follow', winRate: 71.4, trades: 21, avgRR: '1 : 2.60', pf: 2.80, pnlUSD: 320.96, status: 'Strong' }, // ~₹26,800
      { name: 'Pullback 20EMA', winRate: 64.3, trades: 14, avgRR: '1 : 2.00', pf: 2.10, pnlUSD: 173.65, status: 'Consistent' }, // ~₹14,500
      { name: 'Mean Reversion', winRate: 61.1, trades: 18, avgRR: '1 : 2.10', pf: 2.40, pnlUSD: 232.34, status: 'Moderate' }, // ~₹19,400
      { name: 'Opening Range Breakout', winRate: 45.5, trades: 11, avgRR: '1 : 1.70', pf: 0.85, pnlUSD: -68.26, status: 'Review' } // ~-₹5,700
    ],
    brokerPerformance: [
      {
        id: 'mt5',
        name: 'MetaTrader 5 (MT5)',
        shortName: 'MT5',
        market: 'forex',
        marketLabel: 'Global FX & Indices',
        type: 'Bridge API',
        logo: 'MT',
        logoBg: 'linear-gradient(135deg, #10b981, #059669)',
        color: '#10b981',
        status: 'Active',
        pnlUSD: 485.40,
        winRate: 72.7,
        wins: 16,
        losses: 6,
        trades: 22,
        capitalUSD: 18570.00,
        profitFactor: 3.10,
        avgRR: '1 : 2.6',
        pnlCurve: [0, 42.50, 78.00, 135.20, 120.00, 215.40, 248.00, 285.50, 310.00, 365.20, 390.00, 425.00, 455.00, 485.40]
      },
      {
        id: 'angelone',
        name: 'Angel One',
        shortName: 'Angel One',
        market: 'india',
        marketLabel: 'Indian Equity / F&O',
        type: 'SmartAPI',
        logo: 'A',
        logoBg: 'linear-gradient(135deg, #ff416c, #ff4b2b)',
        color: '#ff416c',
        status: 'Active',
        pnlUSD: 245.80,
        winRate: 64.3,
        wins: 18,
        losses: 10,
        trades: 28,
        capitalUSD: 4071.85, // ₹3.40L
        profitFactor: 2.85,
        avgRR: '1 : 2.4',
        pnlCurve: [0, 25.15, 39.50, 68.00, 110.50, 125.00, 115.00, 142.00, 135.00, 175.00, 185.00, 205.00, 222.00, 245.80]
      },
      {
        id: 'dhan',
        name: 'Dhan HQ',
        shortName: 'Dhan',
        market: 'india',
        marketLabel: 'Options & Scalping',
        type: 'Direct API',
        logo: 'D',
        logoBg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        color: '#3b82f6',
        status: 'Active',
        pnlUSD: 188.50,
        winRate: 61.1,
        wins: 11,
        losses: 7,
        trades: 18,
        capitalUSD: 2574.85, // ₹2.15L
        profitFactor: 2.45,
        avgRR: '1 : 2.2',
        pnlCurve: [0, 18.00, 28.50, 45.00, 72.00, 88.00, 102.00, 118.00, 112.00, 140.00, 152.00, 165.00, 175.00, 188.50]
      },
      {
        id: 'vantage',
        name: 'Vantage FX',
        shortName: 'Vantage',
        market: 'forex',
        marketLabel: 'Forex & Gold (XAU)',
        type: 'MT4/MT5 Server',
        logo: 'V',
        logoBg: 'linear-gradient(135deg, #0284c7, #0369a1)',
        color: '#0284c7',
        status: 'Active',
        pnlUSD: 142.60,
        winRate: 55.6,
        wins: 5,
        losses: 4,
        trades: 9,
        capitalUSD: 12400.00,
        profitFactor: 2.30,
        avgRR: '1 : 2.1',
        pnlCurve: [0, 12.00, 22.00, 35.00, 48.00, 65.00, 75.00, 84.00, 92.00, 105.00, 115.00, 124.00, 132.00, 142.60]
      },
      {
        id: 'upstox',
        name: 'Upstox Pro',
        shortName: 'Upstox',
        market: 'india',
        marketLabel: 'Cash Equity & Swing',
        type: 'Upstox v2',
        logo: 'U',
        logoBg: 'linear-gradient(135deg, #7928ca, #4338ca)',
        color: '#7928ca',
        status: 'Active',
        pnlUSD: 53.87,
        winRate: 60.0,
        wins: 3,
        losses: 2,
        trades: 5,
        capitalUSD: 3413.17, // ₹2.85L
        profitFactor: 1.75,
        avgRR: '1 : 1.9',
        pnlCurve: [0, 5.50, 9.20, 15.00, 22.00, 26.00, 24.00, 31.00, 28.50, 36.00, 40.00, 44.50, 48.00, 53.87]
      }
    ]
  };

  // Indian Portfolio Dataset
  const INDIA_DATA = {
    metrics: {
      winRate: 64.2,
      wins: 52,
      losses: 29,
      totalTrades: 81,
      netPnl: 93200,
      avgWin: 4320,
      avgLoss: -1850,
      bigWin: 18500,
      bigWinSymbol: 'NIFTY 24800 CE',
      bigLoss: -5200,
      bigLossSymbol: 'BANKNIFTY 51200 PE',
      avgRR: '1 : 2.33',
      profitFactor: 2.68
    },
    pnlCurve: [
      { date: '1 Jul', pnl: 0, balance: 500000 },
      { date: '5 Jul', pnl: 4200, balance: 504200 },
      { date: '9 Jul', pnl: 2400, balance: 506600 },
      { date: '14 Jul', pnl: 7800, balance: 514400 },
      { date: '18 Jul', pnl: 11900, balance: 526300 },
      { date: '23 Jul', pnl: 6200, balance: 532500 },
      { date: '28 Jul', pnl: -3600, balance: 528900 },
      { date: '31 Jul', pnl: 4800, balance: 533700 },
      { date: '4 Aug', pnl: -2100, balance: 531600 },
      { date: '8 Aug', pnl: 13500, balance: 545100 },
      { date: '12 Aug', pnl: 4500, balance: 549600 },
      { date: '16 Aug', pnl: 8700, balance: 558300 },
      { date: '20 Aug', pnl: 9700, balance: 568000 },
      { date: '24 Aug', pnl: 25200, balance: 593200 }
    ],
    scatterTrades: [
      { id: 1, date: '01 Jul', symbol: 'NIFTY CE', type: 'Options', pnl: 4200, outcome: 'win' },
      { id: 2, date: '02 Jul', symbol: 'BANKNIFTY', type: 'Options', pnl: -1800, outcome: 'loss' },
      { id: 3, date: '04 Jul', symbol: 'RELIANCE', type: 'Stock', pnl: 6750, outcome: 'win' },
      { id: 4, date: '07 Jul', symbol: 'TATASTEEL', type: 'Stock', pnl: 3100, outcome: 'win' },
      { id: 5, date: '09 Jul', symbol: 'NIFTY PE', type: 'Options', pnl: -2400, outcome: 'loss' },
      { id: 6, date: '11 Jul', symbol: 'INFY', type: 'Stock', pnl: 5500, outcome: 'win' },
      { id: 7, date: '14 Jul', symbol: 'HDFCBANK', type: 'Stock', pnl: -3200, outcome: 'loss' },
      { id: 8, date: '16 Jul', symbol: 'NIFTY CE', type: 'Options', pnl: 7800, outcome: 'win' },
      { id: 9, date: '18 Jul', symbol: 'BANKNIFTY', type: 'Options', pnl: -1500, outcome: 'loss' },
      { id: 10, date: '21 Jul', symbol: 'NIFTY 24800 CE', type: 'Options', pnl: 18500, outcome: 'win' },
      { id: 11, date: '23 Jul', symbol: 'TCS', type: 'Stock', pnl: 4100, outcome: 'win' },
      { id: 12, date: '25 Jul', symbol: 'BANKNIFTY PE', type: 'Options', pnl: -5200, outcome: 'loss' },
      { id: 13, date: '28 Jul', symbol: 'NIFTY FUT', type: 'Futures', pnl: 6200, outcome: 'win' },
      { id: 14, date: '30 Jul', symbol: 'SBIN', type: 'Stock', pnl: -1100, outcome: 'loss' },
      { id: 15, date: '01 Aug', symbol: 'NIFTY 24750 CE', type: 'Options', pnl: 4000, outcome: 'win' },
      { id: 16, date: '04 Aug', symbol: 'NIFTY 24800 CE', type: 'Options', pnl: -2625, outcome: 'loss' },
      { id: 17, date: '04 Aug', symbol: 'BANKNIFTY PE', type: 'Options', pnl: 2100, outcome: 'win' },
      { id: 18, date: '04 Aug', symbol: 'RELIANCE', type: 'Stock', pnl: -1575, outcome: 'loss' },
      { id: 19, date: '06 Aug', symbol: 'NIFTY 24900 CE', type: 'Options', pnl: 6300, outcome: 'win' },
      { id: 20, date: '08 Aug', symbol: 'NIFTY 24850 CE', type: 'Options', pnl: 4300, outcome: 'win' },
      { id: 21, date: '08 Aug', symbol: 'HDFCBANK', type: 'Stock', pnl: 2800, outcome: 'win' },
      { id: 22, date: '11 Aug', symbol: 'BANKNIFTY', type: 'Options', pnl: 4500, outcome: 'win' },
      { id: 23, date: '14 Aug', symbol: 'NIFTY 24950 CE', type: 'Options', pnl: 8700, outcome: 'win' },
      { id: 24, date: '18 Aug', symbol: 'RELIANCE FUT', type: 'Futures', pnl: 3600, outcome: 'win' },
      { id: 25, date: '20 Aug', symbol: 'BANKNIFTY CE', type: 'Options', pnl: 6100, outcome: 'win' }
    ],
    longShort: {
      long: {
        trades: 48,
        share: 59,
        winRate: 68.8,
        wins: 33,
        losses: 15,
        pnl: 68400,
        avgRR: '1 : 2.40',
        profitFactor: 2.9
      },
      short: {
        trades: 33,
        share: 41,
        winRate: 57.6,
        wins: 19,
        losses: 14,
        pnl: 24800,
        avgRR: '1 : 2.10',
        profitFactor: 2.2
      }
    },
    dailyPerformance: [
      { day: 'Mon', fullDay: 'Monday', winRate: 60.0, trades: 15, pnl: 14200 },
      { day: 'Tue', fullDay: 'Tuesday', winRate: 72.2, trades: 18, pnl: 28500 },
      { day: 'Wed', fullDay: 'Wednesday', winRate: 65.0, trades: 20, pnl: 18900 },
      { day: 'Thu', fullDay: 'Thursday', winRate: 58.8, trades: 17, pnl: 21400 },
      { day: 'Fri', fullDay: 'Friday', winRate: 52.0, trades: 11, pnl: 10200 }
    ],
    behaviour: {
      disciplineScore: 92,
      riskCompliance: 98,
      avgHoldTime: '38 mins',
      maxConsecutiveWins: 6,
      maxConsecutiveLosses: 2,
      revengeTradingFlags: 0,
      fomoAlerts: 1
    },
    instrumentPerformance: {
      stocks: {
        name: 'Stocks (Equity)',
        winRate: 68.0,
        wins: 21,
        losses: 10,
        trades: 31,
        pnl: 42600,
        avgRR: '1 : 2.2',
        profitFactor: 2.85
      },
      fo: {
        name: 'F&O (Futures & Options)',
        winRate: 49.0,
        wins: 25,
        losses: 26,
        trades: 51,
        pnl: 50600,
        avgRR: '1 : 2.45',
        profitFactor: 2.42
      }
    },
    strategies: [
      { name: 'Breakout', winRate: 76.0, trades: 25, pnl: 38200, avgRR: '1 : 2.50', pf: 3.20, status: 'Top Edge' },
      { name: 'Trend Follow', winRate: 71.4, trades: 21, pnl: 26800, avgRR: '1 : 2.60', pf: 2.80, status: 'Strong' },
      { name: 'Pullback 20EMA', winRate: 64.3, trades: 14, pnl: 14500, avgRR: '1 : 2.00', pf: 2.10, status: 'Consistent' },
      { name: 'Mean Reversion', winRate: 61.1, trades: 18, pnl: 19400, avgRR: '1 : 2.10', pf: 2.40, status: 'Moderate' },
      { name: 'Opening Range Breakout', winRate: 45.5, trades: 11, pnl: -5700, avgRR: '1 : 1.70', pf: 0.85, status: 'Review' }
    ]
  };

  // Forex Portfolio Dataset
  const FOREX_DATA = {
    metrics: {
      winRate: 66.7,
      wins: 48,
      losses: 24,
      totalTrades: 72,
      netPnl: 18570,
      avgWin: 620,
      avgLoss: -280,
      bigWin: 3450,
      bigWinSymbol: 'GBP/USD London Breakout',
      bigLoss: -950,
      bigLossSymbol: 'USD/JPY NFP Spike',
      avgRR: '1 : 2.45',
      profitFactor: 3.12
    },
    pnlCurve: [
      { date: '1 Jul', pnl: 0, balance: 50000 },
      { date: '5 Jul', pnl: 850, balance: 50850 },
      { date: '9 Jul', pnl: 1420, balance: 52270 },
      { date: '14 Jul', pnl: 2100, balance: 54370 },
      { date: '18 Jul', pnl: -640, balance: 53730 },
      { date: '23 Jul', pnl: 3450, balance: 57180 },
      { date: '28 Jul', pnl: 1850, balance: 59030 },
      { date: '4 Aug', pnl: 2400, balance: 61430 },
      { date: '8 Aug', pnl: 1920, balance: 63350 },
      { date: '12 Aug', pnl: -820, balance: 62530 },
      { date: '16 Aug', pnl: 2900, balance: 65430 },
      { date: '20 Aug', pnl: 3140, balance: 68570 }
    ],
    scatterTrades: [
      { id: 1, date: '02 Jul', symbol: 'EUR/USD', type: 'Forex Major', pnl: 650, outcome: 'win' },
      { id: 2, date: '04 Jul', symbol: 'GBP/USD', type: 'Forex Major', pnl: 820, outcome: 'win' },
      { id: 3, date: '07 Jul', symbol: 'USD/JPY', type: 'Forex Major', pnl: -450, outcome: 'loss' },
      { id: 4, date: '10 Jul', symbol: 'AUD/USD', type: 'Forex Major', pnl: 540, outcome: 'win' },
      { id: 5, date: '14 Jul', symbol: 'USD/CAD', type: 'Forex Major', pnl: -320, outcome: 'loss' },
      { id: 6, date: '17 Jul', symbol: 'GBP/USD', type: 'Forex Major', pnl: 3450, outcome: 'win' },
      { id: 7, date: '21 Jul', symbol: 'EUR/JPY', type: 'Forex Cross', pnl: 980, outcome: 'win' },
      { id: 8, date: '24 Jul', symbol: 'USD/CHF', type: 'Forex Major', pnl: -620, outcome: 'loss' },
      { id: 9, date: '28 Jul', symbol: 'EUR/USD', type: 'Forex Major', pnl: 1120, outcome: 'win' },
      { id: 10, date: '02 Aug', symbol: 'GBP/JPY', type: 'Forex Cross', pnl: 1450, outcome: 'win' },
      { id: 11, date: '05 Aug', symbol: 'USD/JPY', type: 'Forex Major', pnl: -950, outcome: 'loss' },
      { id: 12, date: '08 Aug', symbol: 'EUR/USD', type: 'Forex Major', pnl: 1850, outcome: 'win' },
      { id: 13, date: '12 Aug', symbol: 'AUD/USD', type: 'Forex Major', pnl: 720, outcome: 'win' },
      { id: 14, date: '16 Aug', symbol: 'GBP/USD', type: 'Forex Major', pnl: 2100, outcome: 'win' },
      { id: 15, date: '19 Aug', symbol: 'NZD/USD', type: 'Forex Major', pnl: -410, outcome: 'loss' }
    ],
    longShort: {
      long: {
        trades: 42,
        share: 58,
        winRate: 71.4,
        wins: 30,
        losses: 12,
        pnl: 12400,
        avgRR: '1 : 2.50',
        profitFactor: 3.4
      },
      short: {
        trades: 30,
        share: 42,
        winRate: 60.0,
        wins: 18,
        losses: 12,
        pnl: 6170,
        avgRR: '1 : 2.30',
        profitFactor: 2.6
      }
    },
    dailyPerformance: [
      { day: 'Mon', fullDay: 'Monday', winRate: 58.0, trades: 12, pnl: 2450 },
      { day: 'Tue', fullDay: 'Tuesday', winRate: 75.0, trades: 16, pnl: 5820 },
      { day: 'Wed', fullDay: 'Wednesday', winRate: 70.0, trades: 20, pnl: 4900 },
      { day: 'Thu', fullDay: 'Thursday', winRate: 68.8, trades: 16, pnl: 4100 },
      { day: 'Fri', fullDay: 'Friday', winRate: 50.0, trades: 8, pnl: 1300 }
    ],
    behaviour: {
      disciplineScore: 95,
      riskCompliance: 100,
      avgHoldTime: '2.4 hours',
      maxConsecutiveWins: 7,
      maxConsecutiveLosses: 2,
      revengeTradingFlags: 0,
      fomoAlerts: 0
    },
    sessions: [
      { name: 'New York', winRate: 47.3 },
      { name: 'London', winRate: 41.9 },
      { name: 'Asia', winRate: 52.4 }
    ],
    strategies: [
      { name: 'London Breakout', winRate: 75.0, trades: 20, pnl: 7450, avgRR: '1 : 2.70', pf: 3.60, status: 'Top Edge' },
      { name: 'NY Momentum Scalp', winRate: 68.8, trades: 16, pnl: 4200, avgRR: '1 : 2.40', pf: 2.80, status: 'Strong' },
      { name: 'Daily 20EMA Retest', winRate: 66.7, trades: 15, pnl: 3850, avgRR: '1 : 2.30', pf: 2.60, status: 'Consistent' },
      { name: 'Asian Range Reversal', winRate: 58.3, trades: 12, pnl: 2150, avgRR: '1 : 2.00', pf: 2.10, status: 'Moderate' },
      { name: 'News Straddle', winRate: 50.0, trades: 9, pnl: 920, avgRR: '1 : 1.80', pf: 1.20, status: 'Review' }
    ]
  };

  function fmtCurrency(val, isForex) {
    if (isForex) {
      const abs = Math.abs(val).toLocaleString('en-US');
      return val >= 0 ? `+$${abs}` : `-$${abs}`;
    }
    const abs = Math.abs(val).toLocaleString('en-IN');
    return val >= 0 ? `+₹${abs}` : `−₹${abs}`;
  }

  /* ── Hexagonal Radar Score Canvas Render ── */
  function renderRadarScore() {
    const canvas = document.getElementById('portfolioRadarCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 280;
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

    // 6 Axes: Consistency, Calmar Ratio, SL usage, WR, RR, Daily Return
    const axes = [
      { name: 'Consistency', angle: -Math.PI / 2, val: 0.88 },
      { name: 'Calmar Ratio', angle: -Math.PI / 6, val: 0.72 },
      { name: 'SL usage', angle: Math.PI / 6, val: 0.94 },
      { name: 'WR', angle: Math.PI / 2, val: 0.65 },
      { name: 'RR', angle: (5 * Math.PI) / 6, val: 0.92 },
      { name: 'Daily Return', angle: (-5 * Math.PI) / 6, val: 0.70 }
    ];

    // Concentric Web Hexagons (4 levels)
    const levels = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = '600 10.5px "Space Grotesk", sans-serif';
      
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

    // Data polygon
    ctx.beginPath();
    for (let i = 0; i < axes.length; i++) {
      const r = radius * axes[i].val;
      const x = cx + r * Math.cos(axes[i].angle);
      const y = cy + r * Math.sin(axes[i].angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Vertices dots
    for (let i = 0; i < axes.length; i++) {
      const r = radius * axes[i].val;
      const x = cx + r * Math.cos(axes[i].angle);
      const y = cy + r * Math.sin(axes[i].angle);

      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  /* ── Cumulative P&L Curve Canvas Render ── */
  function renderPnlCurve(data) {
    const canvas = document.getElementById('portfolioPnlCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 700;
    const cssH = 260;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pts = data.pnlCurve;
    if (!pts || pts.length < 2) return;

    const pad = { t: 20, r: 24, b: 40, l: 60 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    const isCombined = _activeMarket === 'combined';
    const curr = CURRENCIES[_selectedCurrency] || CURRENCIES.USD;
    const rate = isCombined ? (curr.rate || 1.0) : 1.0;

    const bals = pts.map(p => (p.balanceUSD !== undefined ? p.balanceUSD * rate : (p.balance || 0)));
    const minB = Math.min(...bals);
    const maxB = Math.max(...bals);
    const span = maxB - minB || 10000;
    const lo = minB - span * 0.08;
    const hi = maxB + span * 0.08;

    const toX = idx => pad.l + (idx / (pts.length - 1)) * w;
    const toY = b => pad.t + (1 - (b - lo) / (hi - lo)) * h;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.t + (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + w, gy);
      ctx.stroke();

      const gVal = hi - (i / 4) * (hi - lo);
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';

      let label = '';
      if (isCombined) {
        if (curr.code === 'INR') {
          label = `₹${(gVal / 100000).toFixed(1)}L`;
        } else if (curr.code === 'JPY') {
          label = `¥${Math.round(gVal / 1000)}k`;
        } else {
          label = `${curr.prefix}${Math.round(gVal / 1000)}k`;
        }
      } else if (_activeMarket === 'forex') {
        label = `$${Math.round(gVal / 1000)}k`;
      } else {
        label = `₹${(gVal / 100000).toFixed(1)}L`;
      }

      ctx.fillText(label, pad.l - 8, gy + 3);
    }

    // Gradient area fill under line
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
    grad.addColorStop(0, 'rgba(72, 183, 154, 0.35)');
    grad.addColorStop(1, 'rgba(72, 183, 154, 0.00)');

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

    // Main line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(bals[0]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(i), toY(bals[i]));
    }
    ctx.strokeStyle = '#48B79A';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Data points & X labels
    pts.forEach((p, i) => {
      const cx = toX(i);
      const cy = toY(bals[i]);

      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#48B79A';
      ctx.fill();
      ctx.strokeStyle = '#181e36';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (i % 2 === 0 || i === pts.length - 1) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.date, cx, pad.t + h + 20);
      }
    });
  }

  /* ── Win vs Loss Trade Scatter Plot Canvas Render ── */
  function renderScatterPlot(data) {
    const canvas = document.getElementById('portfolioScatterCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 700;
    const cssH = 280;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const trades = data.scatterTrades;
    if (!trades || trades.length === 0) return;

    const pad = { t: 25, r: 30, b: 35, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    // Determine max win and min loss for Y-scale
    const pnls = trades.map(t => t.pnl);
    const maxWin = Math.max(...pnls.filter(p => p > 0), 10000);
    const maxLoss = Math.abs(Math.min(...pnls.filter(p => p < 0), -5000));
    const maxAbs = Math.max(maxWin, maxLoss) * 1.15;

    const zeroY = pad.t + h / 2;
    const toX = idx => pad.l + (idx / (trades.length - 1 || 1)) * w;
    const toY = pnl => zeroY - (pnl / maxAbs) * (h / 2);

    // Background Win (Top) & Loss (Bottom) zones
    ctx.fillStyle = 'rgba(72, 183, 154, 0.04)';
    ctx.fillRect(pad.l, pad.t, w, h / 2);

    ctx.fillStyle = 'rgba(224, 104, 90, 0.04)';
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
    ctx.fillText('0 (BE)', pad.l - 8, zeroY + 3);

    // Top & bottom grid labels
    const isFx = _activeMarket === 'forex';
    const topStep1 = maxAbs * 0.5;
    const topStep2 = maxAbs * 0.9;
    const botStep1 = -maxAbs * 0.5;
    const botStep2 = -maxAbs * 0.9;

    const fmtP = v => isFx ? `$${Math.round(v)}` : `₹${Math.round(v / 1000)}k`;

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
      ctx.fillText((val > 0 ? '+' : '') + fmtP(val), pad.l - 8, y + 3);
    });

    // Plot trade dots
    trades.forEach((t, i) => {
      const cx = toX(i);
      const cy = toY(t.pnl);
      const isWin = t.pnl >= 0;

      // Glow circle
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = isWin ? 'rgba(72, 183, 154, 0.35)' : 'rgba(224, 104, 90, 0.35)';
      ctx.fill();

      // Solid core
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
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
    ctx.fillText('Trade Sequence (Time →)', pad.l + w / 2, pad.t + h + 22);
  }

  /* ── Semi-Circle Arc Gauge Canvas Render (Screenshot 2) ── */
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

    const winRatio = Math.max(0, Math.min(100, winRate)) / 100;
    const splitAngle = Math.PI + winRatio * Math.PI;

    // 1. Green Arc (Wins portion)
    if (winRatio > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, splitAngle, false);
      ctx.strokeStyle = '#48B79A';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // 2. Red Arc (Losses portion)
    if (winRatio < 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, splitAngle, 2 * Math.PI, false);
      ctx.strokeStyle = '#E0685A';
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  let _activeBrokerFilter = 'all'; // 'all', 'india', 'forex'
  let _activeBrokerGraphMode = 'line'; // 'line' or 'bar'
  let _hiddenBrokers = new Set(); // broker IDs toggled off in graph
  let _selectedBrokerIds = new Set(['mt5', 'angelone']); // Default comparison: 2 brokers (MT5 vs Angel One)

  const BROKER_CURVE_DATES = ['1 Jul', '5 Jul', '9 Jul', '14 Jul', '18 Jul', '23 Jul', '28 Jul', '31 Jul', '4 Aug', '8 Aug', '12 Aug', '16 Aug', '20 Aug', '24 Aug'];

  /* ── Toggle Broker Checkbox Selection for Comparison ── */
  function toggleBrokerCompareSelection(id, event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    if (_selectedBrokerIds.has(id)) {
      if (_selectedBrokerIds.size > 1) {
        _selectedBrokerIds.delete(id);
      }
    } else {
      _selectedBrokerIds.add(id);
    }
    updateBrokerCompareDropdownUI();
    renderBrokerPnlCompare();
    renderBrokerCardsList();
  }

  window.toggleBrokerCompareSelection = toggleBrokerCompareSelection;

  /* ── Select All Brokers ── */
  function selectAllBrokersCompare(event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    (COMBINED_DATA.brokerPerformance || []).forEach(b => _selectedBrokerIds.add(b.id));
    updateBrokerCompareDropdownUI();
    renderBrokerPnlCompare();
    renderBrokerCardsList();
  }

  window.selectAllBrokersCompare = selectAllBrokersCompare;

  /* ── Clear All (Keep 1) ── */
  function clearAllBrokersCompare(event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    const first = (COMBINED_DATA.brokerPerformance || [])[0]?.id || 'mt5';
    _selectedBrokerIds.clear();
    _selectedBrokerIds.add(first);
    updateBrokerCompareDropdownUI();
    renderBrokerPnlCompare();
    renderBrokerCardsList();
  }

  window.clearAllBrokersCompare = clearAllBrokersCompare;

  /* ── Select Two Brokers Direct Comparison Preset ── */
  function selectTwoBrokersCompare(id1, id2, event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    _selectedBrokerIds.clear();
    _selectedBrokerIds.add(id1);
    _selectedBrokerIds.add(id2);
    updateBrokerCompareDropdownUI();
    renderBrokerPnlCompare();
    renderBrokerCardsList();
  }

  window.selectTwoBrokersCompare = selectTwoBrokersCompare;

  /* ── Update Dropdown Checkboxes & Trigger Label ── */
  function updateBrokerCompareDropdownUI() {
    const allBrokers = COMBINED_DATA.brokerPerformance || [];
    const checkItems = document.querySelectorAll('.portfolio-broker-check-item');
    checkItems.forEach(item => {
      const id = item.dataset.brokerId;
      if (id) {
        item.classList.toggle('checked', _selectedBrokerIds.has(id));
      }
    });

    const label = document.getElementById('compareBrokerDropdownLabel');
    if (label) {
      if (_selectedBrokerIds.size === allBrokers.length) {
        label.textContent = `All Brokers (${allBrokers.length})`;
      } else if (_selectedBrokerIds.size === 2) {
        const sel = allBrokers.filter(b => _selectedBrokerIds.has(b.id));
        label.textContent = `Comparing: ${sel.map(b => b.shortName).join(' vs ')}`;
      } else if (_selectedBrokerIds.size === 1) {
        const sel = allBrokers.find(b => _selectedBrokerIds.has(b.id));
        label.textContent = `Broker: ${sel?.shortName || sel?.name || '1 selected'}`;
      } else {
        label.textContent = `Comparing (${_selectedBrokerIds.size}) Brokers`;
      }
    }
  }

  window.updateBrokerCompareDropdownUI = updateBrokerCompareDropdownUI;

  /* ── Render Interactive Broker Graph Legend ── */
  function renderBrokerGraphLegend() {
    const legendRow = document.getElementById('brokerGraphLegendRow');
    if (!legendRow) return;

    const brokers = (COMBINED_DATA.brokerPerformance || []).filter(b => _selectedBrokerIds.has(b.id));

    legendRow.innerHTML = brokers.map(b => {
      const isHidden = _hiddenBrokers.has(b.id);
      return `
        <div class="portfolio-broker-legend-item ${isHidden ? 'dimmed' : ''}" data-broker-id="${b.id}" title="Click to show/hide ${b.name} line">
          <span class="portfolio-legend-dot" style="background: ${b.color};"></span>
          <span style="font-weight:600;color:var(--text);">${b.shortName || b.name}</span>
          <span style="color:${b.pnlUSD >= 0 ? '#48B79A' : '#E0685A'};font-family:'IBM Plex Mono',monospace;font-size:10.5px;">${formatMoney(b.pnlUSD, { signed: true })}</span>
        </div>
      `;
    }).join('');

    legendRow.querySelectorAll('.portfolio-broker-legend-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const id = item.dataset.brokerId;
        if (!id) return;
        if (_hiddenBrokers.has(id)) {
          _hiddenBrokers.delete(id);
        } else {
          // Keep at least one broker visible
          if (_hiddenBrokers.size < brokers.length - 1) {
            _hiddenBrokers.add(id);
          }
        }
        renderBrokerGraphLegend();
        renderBrokerPnlCompare();
      };
    });
  }

  /* ── Broker P&L Comparison Canvas Render (Graph & Bar Modes) ── */
  function renderBrokerPnlCompare(data) {
    const canvas = document.getElementById('brokerPnlCompareCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 720;
    const cssH = 280;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const allBrokers = COMBINED_DATA.brokerPerformance || [];
    const brokers = allBrokers.filter(b => _selectedBrokerIds.has(b.id));

    if (!brokers.length) return;

    const curr = CURRENCIES[_selectedCurrency] || CURRENCIES.USD;
    const rate = curr.rate || 1.0;

    // ─────────────────────────────────────────────────────────────
    // 1. MULTI-SERIES GROWTH GRAPH (LINE CURVES)
    // ─────────────────────────────────────────────────────────────
    if (_activeBrokerGraphMode === 'line') {
      const activeBrokers = brokers.filter(b => !_hiddenBrokers.has(b.id));
      const displayBrokers = activeBrokers.length > 0 ? activeBrokers : brokers;

      const pad = { t: 24, r: 85, b: 40, l: 65 };
      const w = cssW - pad.l - pad.r;
      const h = cssH - pad.t - pad.b;

      // Find overall max and min values across all active curves
      let allPoints = [0];
      displayBrokers.forEach(b => {
        const curve = b.pnlCurve || [0, b.pnlUSD];
        curve.forEach(v => allPoints.push(v * rate));
      });

      const maxVal = Math.max(...allPoints, 50);
      const minVal = Math.min(0, ...allPoints);
      const yMax = maxVal * 1.12;
      const yMin = minVal < 0 ? minVal * 1.15 : 0;
      const span = (yMax - yMin) || 100;

      const toX = (idx, total) => pad.l + (idx / (total - 1)) * w;
      const toY = val => pad.t + ((yMax - val) / span) * h;

      // Horizontal Y Grid lines (4 steps)
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const val = yMax - (i / steps) * (yMax - yMin);
        const gy = toY(val);

        ctx.strokeStyle = Math.abs(val) < 0.001 ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.setLineDash(Math.abs(val) < 0.001 ? [5, 4] : [2, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, gy);
        ctx.lineTo(pad.l + w, gy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#6b7280';
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';

        let label = '';
        if (curr.code === 'INR') {
          const abs = Math.abs(val);
          label = abs >= 1000 ? `₹${(val / 1000).toFixed(1)}k` : `₹${Math.round(val)}`;
        } else {
          label = `${curr.prefix}${Math.round(val)}`;
        }
        ctx.fillText(label, pad.l - 8, gy + 3.5);
      }

      // X Date Labels
      const numPts = BROKER_CURVE_DATES.length;
      BROKER_CURVE_DATES.forEach((d, idx) => {
        const gx = toX(idx, numPts);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx, pad.t);
        ctx.lineTo(gx, pad.t + h);
        ctx.stroke();

        ctx.fillStyle = '#6b7280';
        ctx.font = '10.5px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d, gx, pad.t + h + 20);
      });

      // Render each broker's line curve
      displayBrokers.forEach(b => {
        const pts = (b.pnlCurve || [0, b.pnlUSD]).map(v => v * rate);
        const color = b.color || '#48B79A';

        // 1. Gradient glow area under line
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
        grad.addColorStop(0, color + '25'); // subtle opacity
        grad.addColorStop(1, color + '00');

        ctx.beginPath();
        ctx.moveTo(toX(0, pts.length), toY(pts[0]));
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(toX(i, pts.length), toY(pts[i]));
        }
        ctx.lineTo(toX(pts.length - 1, pts.length), pad.t + h);
        ctx.lineTo(toX(0, pts.length), pad.t + h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 2. Main smooth curve line
        ctx.beginPath();
        ctx.moveTo(toX(0, pts.length), toY(pts[0]));
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(toX(i, pts.length), toY(pts[i]));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // 3. Dot on last data point
        const lastX = toX(pts.length - 1, pts.length);
        const lastY = toY(pts[pts.length - 1]);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#101426';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 4. End tag label badge
        const lastPnl = formatMoney(b.pnlUSD, { signed: true });
        ctx.fillStyle = color;
        ctx.font = '600 10.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${b.shortName || b.name}: ${lastPnl}`, lastX + 8, lastY + 3.5);
      });

      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. COMPARATIVE BAR CHART BREAKDOWN
    // ─────────────────────────────────────────────────────────────
    const pad = { t: 32, r: 24, b: 46, l: 65 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    const convertedPnl = brokers.map(b => b.pnlUSD * rate);
    const maxVal = Math.max(...convertedPnl, 50);
    const minVal = Math.min(0, ...convertedPnl);
    const yMax = maxVal * 1.3;
    const yMin = minVal < 0 ? minVal * 1.2 : 0;
    const span = (yMax - yMin) || 100;

    const toY = val => pad.t + ((yMax - val) / span) * h;

    // Grid lines
    const gridSteps = [yMax, yMax * 0.5, 0];
    if (yMin < 0) gridSteps.push(yMin);

    gridSteps.forEach(val => {
      const gy = toY(val);
      ctx.strokeStyle = val === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash(val === 0 ? [4, 4] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + w, gy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';

      let label = '';
      if (curr.code === 'INR') {
        const abs = Math.abs(val);
        label = abs >= 1000 ? `₹${(val / 1000).toFixed(1)}k` : `₹${Math.round(val)}`;
      } else {
        label = `${curr.prefix}${Math.round(val)}`;
      }
      ctx.fillText(label, pad.l - 8, gy + 3.5);
    });

    const slotW = w / brokers.length;
    const barW = Math.min(36, slotW * 0.52);
    const zeroY = toY(0);

    brokers.forEach((b, idx) => {
      const cx = pad.l + (idx + 0.5) * slotW;
      const pnl = b.pnlUSD * rate;
      const isProfit = pnl >= 0;
      const barTop = isProfit ? toY(pnl) : zeroY;
      const barH = isProfit ? (zeroY - barTop) : (toY(pnl) - zeroY);

      // Bar gradient fill
      const grad = ctx.createLinearGradient(0, barTop, 0, barTop + barH);
      if (isProfit) {
        grad.addColorStop(0, b.color || '#48B79A');
        grad.addColorStop(1, 'rgba(72, 183, 154, 0.15)');
      } else {
        grad.addColorStop(0, 'rgba(224, 104, 90, 0.15)');
        grad.addColorStop(1, '#E0685A');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - barW / 2, barTop, barW, Math.max(3, barH), isProfit ? [5, 5, 0, 0] : [0, 0, 5, 5]);
      } else {
        ctx.rect(cx - barW / 2, barTop, barW, Math.max(3, barH));
      }
      ctx.fill();

      // Top edge accent highlight
      ctx.strokeStyle = b.color || (isProfit ? '#48B79A' : '#E0685A');
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - barW / 2, barTop);
      ctx.lineTo(cx + barW / 2, barTop);
      ctx.stroke();

      // P&L Label above bar
      ctx.fillStyle = isProfit ? '#48B79A' : '#E0685A';
      ctx.font = '600 10.5px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      const pnlTxt = formatMoney(b.pnlUSD, { signed: true });
      ctx.fillText(pnlTxt, cx, isProfit ? barTop - 6 : barTop + barH + 12);

      // Broker name below chart
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 10.5px "Space Grotesk", sans-serif';
      ctx.fillText(b.shortName || b.name.split(' ')[0], cx, pad.t + h + 16);

      // Trades sublabel
      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px "Inter", sans-serif';
      ctx.fillText(`${b.winRate}% · ${b.trades}T`, cx, pad.t + h + 29);
    });
  }

  /* ── Populate Broker Quick Stats List & Graph Legend ── */
  function renderBrokerCardsList() {
    renderBrokerGraphLegend();

    const allBrokers = COMBINED_DATA.brokerPerformance || [];
    const brokers = allBrokers.filter(b => _selectedBrokerIds.has(b.id));

    const totalPnlUSD = brokers.reduce((acc, b) => acc + b.pnlUSD, 0);
    const totalPnlLabel = document.getElementById('brokerCompareTotalPnlLabel');
    if (totalPnlLabel) {
      const countLabel = brokers.length === 2 ? 'Comparing 2 Brokers' : (brokers.length === 1 ? '1 Broker' : `${brokers.length} Brokers`);
      totalPnlLabel.textContent = `${countLabel} Net P&L: ${formatMoney(totalPnlUSD, { signed: true })}`;
    }

    const list = document.getElementById('portfolioBrokerCardsList');
    if (!list) return;

    list.innerHTML = brokers.map(b => {
      const pnlFormatted = formatMoney(b.pnlUSD, { signed: true });
      const isProfit = b.pnlUSD >= 0;
      const capitalFormatted = formatMoney(b.capitalUSD);

      return `
        <div class="portfolio-broker-card-item" onclick="if(window.switchPortfolioBroker)window.switchPortfolioBroker('${b.market}','${b.name}');" title="Click to view ${b.name} performance">
          <div class="portfolio-broker-item-left">
            <div class="portfolio-broker-badge-logo" style="background: ${b.logoBg};">
              ${b.logo}
            </div>
            <div class="portfolio-broker-info-col">
              <div class="portfolio-broker-name-row">
                <span class="portfolio-broker-name-txt">${b.name}</span>
                <span class="portfolio-status-pill status-live" style="font-size:8.5px;padding:1px 5px;">${b.status}</span>
              </div>
              <span class="portfolio-broker-market-sub">${b.marketLabel} · ${b.trades} trades</span>
            </div>
          </div>

          <div class="portfolio-broker-mid-col">
            <span style="font-size:11px;font-weight:600;color:var(--text);">${b.winRate}% WR</span>
            <div class="portfolio-broker-wr-bar">
              <div class="portfolio-broker-wr-fill" style="width:${b.winRate}%;background:${b.color};"></div>
            </div>
          </div>

          <div class="portfolio-broker-pnl-col">
            <div class="portfolio-broker-pnl-num ${isProfit ? 'text-profit' : 'text-loss'}">${pnlFormatted}</div>
            <div class="portfolio-broker-alloc-pct">${capitalFormatted} cap</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Instrument Profit Analysis Canvas Render (Screenshot 1) ── */
  function renderInstrumentProfit(data) {
    const canvas = document.getElementById('instrumentProfitCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 360;
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

    const isFx = _activeMarket === 'forex';
    const yMax = 100;
    const yMin = -400;
    const toY = val => pad.t + ((yMax - val) / (yMax - yMin)) * h;

    // Grid lines: $100, $0, -$100, -$200, -$300, -$400
    const steps = [100, 0, -100, -200, -300, -400];
    steps.forEach(val => {
      const gy = toY(val);
      ctx.strokeStyle = val === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash(val === 0 ? [5, 4] : [3, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + w, gy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10.5px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      const label = isFx ? (val >= 0 ? `$${val}.00` : `-$${Math.abs(val)}.00`) : (val >= 0 ? `₹${val}k` : `-₹${Math.abs(val)}k`);
      ctx.fillText(label, pad.l - 8, gy + 3.5);
    });

    const items = isFx ? [
      { symbol: 'XAUUSD', profit: 45, loss: -348, net: -303 },
      { symbol: 'BTCUSD', profit: 2, loss: -12, net: -10 }
    ] : [
      { symbol: 'NIFTY', profit: 80, loss: -120, net: -40 },
      { symbol: 'BANKNIFTY', profit: 95, loss: -310, net: -215 }
    ];

    const barW = Math.min(52, w / (items.length * 2.5));
    const zeroY = toY(0);

    items.forEach((it, idx) => {
      const cx = pad.l + ((idx + 0.6) / items.length) * w;

      // 1. Green top bar (profit)
      if (it.profit > 0) {
        const topY = toY(it.profit);
        const barH = zeroY - topY;
        ctx.fillStyle = '#48B79A';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(cx - barW / 2, topY, barW, barH, [8, 8, 0, 0]);
        } else {
          ctx.rect(cx - barW / 2, topY, barW, barH);
        }
        ctx.fill();
      }

      // 2. Red bottom bar (loss)
      if (it.loss < 0) {
        const botY = toY(it.loss);
        const barH = botY - zeroY;
        ctx.fillStyle = '#E0685A';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(cx - barW / 2, zeroY, barW, barH, [0, 0, 8, 8]);
        } else {
          ctx.rect(cx - barW / 2, zeroY, barW, barH);
        }
        ctx.fill();
      }

      // 3. Gray dot net marker
      const netY = toY(it.net);
      ctx.beginPath();
      ctx.arc(cx, netY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9ca3af';
      ctx.fill();
      ctx.strokeStyle = '#181e36';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Symbol X Label
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '600 11.5px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(it.symbol, cx, pad.t + h + 22);
    });
  }

  /* ── PnL by Trade Duration Canvas Render (Screenshot 2) ── */
  function renderPnlDuration(data) {
    const canvas = document.getElementById('pnlDurationCanvas');
    if (!canvas) return;

    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cssW = wrap.clientWidth || 360;
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

    // Y-Axis: +$200 to -$100
    const isFx = _activeMarket === 'forex';
    const yMax = 200;
    const yMin = -100;
    const toY = pnl => pad.t + ((yMax - pnl) / (yMax - yMin)) * h;

    // X-Axis Duration: 0 to 120 mins (2 hours)
    const maxMins = 120;
    const toX = mins => pad.l + (mins / maxMins) * w;

    // Y Grid lines
    const ySteps = [200, 150, 100, 50, 0, -50, -100];
    ySteps.forEach(val => {
      const gy = toY(val);
      ctx.strokeStyle = val === 0 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash(val === 0 ? [5, 4] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + w, gy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      const label = isFx ? (val >= 0 ? `$${val}.00` : `-$${Math.abs(val)}.00`) : (val >= 0 ? `₹${val}k` : `-₹${Math.abs(val)}k`);
      ctx.fillText(label, pad.l - 8, gy + 3.5);
    });

    // X Grid & Labels: 0s, 17m, 33m, 50m, 1h, 1.5h, 2h
    const xSteps = [
      { mins: 0, label: '0s' },
      { mins: 17, label: '17m' },
      { mins: 33, label: '33m' },
      { mins: 50, label: '50m' },
      { mins: 60, label: '1h' },
      { mins: 80, label: '1h' },
      { mins: 100, label: '2h' },
      { mins: 120, label: '2h' }
    ];

    xSteps.forEach(s => {
      const gx = toX(s.mins);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(gx, pad.t);
      ctx.lineTo(gx, pad.t + h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, gx, pad.t + h + 20);
    });

    // Scatter trade points dataset matching Screenshot 2
    const pts = [
      { m: 1, p: -25 }, { m: 2, p: 52 }, { m: 3, p: -50 }, { m: 4, p: -70 }, { m: 4, p: 115 },
      { m: 6, p: -40 }, { m: 7, p: 35 }, { m: 8, p: -60 }, { m: 9, p: -30 }, { m: 9, p: 170 },
      { m: 10, p: 48 }, { m: 11, p: -45 }, { m: 12, p: 118 }, { m: 13, p: 122 }, { m: 14, p: -38 },
      { m: 15, p: -55 }, { m: 16, p: 15 }, { m: 17, p: -20 }, { m: 18, p: -48 }, { m: 19, p: 51 },
      { m: 22, p: 88 }, { m: 25, p: 50 }, { m: 26, p: -45 }, { m: 27, p: 62 }, { m: 28, p: 148 },
      { m: 30, p: -65 }, { m: 32, p: 25 }, { m: 34, p: 124 }, { m: 36, p: 120 }, { m: 38, p: 126 },
      { m: 40, p: 38 }, { m: 42, p: 45 }, { m: 44, p: 30 }, { m: 45, p: -60 }, { m: 47, p: 38 },
      { m: 52, p: -50 }, { m: 58, p: 3 }, { m: 65, p: 50 }, { m: 75, p: 40 }, { m: 78, p: 50 },
      { m: 82, p: -58 }, { m: 115, p: 70 }, { m: 118, p: -18 }
    ];

    pts.forEach(pt => {
      const cx = toX(pt.m);
      const cy = toY(pt.p);
      const isWin = pt.p >= 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = isWin ? '#48B79A' : '#E0685A';
      ctx.fill();
    });
  }

  /* ── Weekday Performance Bars ── */
  function renderWeekdayBars(data) {
    const list = document.getElementById('portfolioWeekdayList');
    if (!list) return;

    list.innerHTML = data.dailyPerformance.map(d => {
      let pnlDisplay = '';
      let isProfit = true;
      if (d.pnlUSD !== undefined) {
        pnlDisplay = formatMoney(d.pnlUSD, { signed: true });
        isProfit = d.pnlUSD >= 0;
      } else {
        pnlDisplay = d.pnlText || fmtCurrency(d.pnl, _activeMarket === 'forex');
        isProfit = (d.pnl !== undefined ? d.pnl >= 0 : !pnlDisplay.includes('−') && !pnlDisplay.includes('-'));
      }

      return `
        <div class="portfolio-weekday-card">
          <div class="portfolio-wd-header">
            <span class="portfolio-wd-name">${d.fullDay}</span>
            <span class="portfolio-wd-trades">${d.trades} trades</span>
          </div>
          <div class="portfolio-wd-winrate">
            <div class="portfolio-wd-val">${d.winRate}% <span class="portfolio-wd-sub">win rate</span></div>
            <div class="portfolio-bar-wrap">
              <div class="portfolio-bar-fill" style="width: ${d.winRate}%;"></div>
            </div>
          </div>
          <div class="portfolio-wd-pnl ${isProfit ? 'text-profit' : 'text-loss'}">
            ${pnlDisplay}
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Populate DOM with Data ── */
  function updatePortfolioUI() {
    const data = _activeMarket === 'combined' ? COMBINED_DATA : (_activeMarket === 'forex' ? FOREX_DATA : INDIA_DATA);
    const isFx = _activeMarket === 'forex';
    const isCombined = _activeMarket === 'combined';

    // 1. Core 7 Metric Cards
    const elWinRate = document.getElementById('pmWinRate');
    const elAvgWin = document.getElementById('pmAvgWin');
    const elAvgLoss = document.getElementById('pmAvgLoss');
    const elBigWin = document.getElementById('pmBigWin');
    const elBigLoss = document.getElementById('pmBigLoss');
    const elAvgRR = document.getElementById('pmAvgRR');
    const elProfitFactor = document.getElementById('pmProfitFactor');

    if (elWinRate) elWinRate.textContent = `${data.metrics.winRate}%`;

    if (elAvgWin) {
      if (isCombined && data.metrics.avgWinUSD !== undefined) {
        elAvgWin.textContent = formatMoney(data.metrics.avgWinUSD, { signed: true });
      } else {
        elAvgWin.textContent = data.metrics.avgWinText || fmtCurrency(data.metrics.avgWin, isFx);
      }
    }

    if (elAvgLoss) {
      if (isCombined && data.metrics.avgLossUSD !== undefined) {
        elAvgLoss.textContent = formatMoney(data.metrics.avgLossUSD, { signed: true });
      } else {
        elAvgLoss.textContent = data.metrics.avgLossText || fmtCurrency(data.metrics.avgLoss, isFx);
      }
    }

    if (elBigWin) {
      if (isCombined && data.metrics.bigWinUSD !== undefined) {
        elBigWin.textContent = formatMoney(data.metrics.bigWinUSD, { signed: true });
      } else {
        elBigWin.textContent = fmtCurrency(data.metrics.bigWin, isFx);
      }
      const sub = document.getElementById('pmBigWinSub');
      if (sub) sub.textContent = data.metrics.bigWinSymbol || '';
    }

    if (elBigLoss) {
      if (isCombined && data.metrics.bigLossUSD !== undefined) {
        elBigLoss.textContent = formatMoney(data.metrics.bigLossUSD, { signed: true });
      } else {
        elBigLoss.textContent = fmtCurrency(data.metrics.bigLoss, isFx);
      }
      const sub = document.getElementById('pmBigLossSub');
      if (sub) sub.textContent = data.metrics.bigLossSymbol || '';
    }

    if (elAvgRR) elAvgRR.textContent = data.metrics.avgRR;
    if (elProfitFactor) elProfitFactor.textContent = data.metrics.profitFactor.toFixed(2);

    // 2. Long vs Short Cards
    const ls = data.longShort;
    const elLongPnl = document.getElementById('plsLongPnl');
    const elLongWinsLabel = document.getElementById('plsLongWinsLabel');
    const elLongWinsVal = document.getElementById('plsLongWinsVal');
    const elLongWr = document.getElementById('plsLongWinRate');
    const elLongLossesLabel = document.getElementById('plsLongLossesLabel');
    const elLongLossesVal = document.getElementById('plsLongLossesVal');
    const elLongTrades = document.getElementById('plsLongTrades');
    const elLongPf = document.getElementById('plsLongPF');
    const elLongRR = document.getElementById('plsLongRR');

    if (elLongPnl) {
      if (isCombined && ls.long.pnlUSD !== undefined) {
        elLongPnl.textContent = formatMoney(ls.long.pnlUSD, { signed: true });
      } else {
        elLongPnl.textContent = ls.long.pnlText || fmtCurrency(ls.long.pnl, isFx);
      }
    }
    if (elLongWinsLabel) elLongWinsLabel.textContent = ls.long.winsLabel || `Wins (${ls.long.wins})`;
    if (elLongWinsVal) {
      if (isCombined && ls.long.winsValUSD !== undefined) {
        elLongWinsVal.textContent = formatMoney(ls.long.winsValUSD);
      } else {
        elLongWinsVal.textContent = ls.long.winsVal || fmtCurrency(ls.long.wins * 42, isFx);
      }
    }
    if (elLongWr) elLongWr.textContent = `${ls.long.winRate}%`;
    if (elLongLossesLabel) elLongLossesLabel.textContent = ls.long.lossesLabel || `Losses (${ls.long.losses})`;
    if (elLongLossesVal) {
      if (isCombined && ls.long.lossesValUSD !== undefined) {
        elLongLossesVal.textContent = formatMoney(ls.long.lossesValUSD);
      } else {
        elLongLossesVal.textContent = ls.long.lossesVal || fmtCurrency(-Math.abs(ls.long.losses * 35), isFx);
      }
    }
    if (elLongTrades) elLongTrades.textContent = `${ls.long.trades} trades (${ls.long.wins}W · ${ls.long.losses}L)`;
    if (elLongPf) elLongPf.textContent = `PF ${ls.long.profitFactor}`;
    if (elLongRR) elLongRR.textContent = `R:R ${ls.long.avgRR}`;

    const elShortPnl = document.getElementById('plsShortPnl');
    const elShortWinsLabel = document.getElementById('plsShortWinsLabel');
    const elShortWinsVal = document.getElementById('plsShortWinsVal');
    const elShortWr = document.getElementById('plsShortWinRate');
    const elShortLossesLabel = document.getElementById('plsShortLossesLabel');
    const elShortLossesVal = document.getElementById('plsShortLossesVal');
    const elShortTrades = document.getElementById('plsShortTrades');
    const elShortPf = document.getElementById('plsShortPF');
    const elShortRR = document.getElementById('plsShortRR');

    if (elShortPnl) {
      if (isCombined && ls.short.pnlUSD !== undefined) {
        elShortPnl.textContent = formatMoney(ls.short.pnlUSD, { signed: true });
      } else {
        elShortPnl.textContent = ls.short.pnlText || fmtCurrency(ls.short.pnl, isFx);
      }
    }
    if (elShortWinsLabel) elShortWinsLabel.textContent = ls.short.winsLabel || `Wins (${ls.short.wins})`;
    if (elShortWinsVal) {
      if (isCombined && ls.short.winsValUSD !== undefined) {
        elShortWinsVal.textContent = formatMoney(ls.short.winsValUSD);
      } else {
        elShortWinsVal.textContent = ls.short.winsVal || fmtCurrency(ls.short.wins * 35, isFx);
      }
    }
    if (elShortWr) elShortWr.textContent = `${ls.short.winRate}%`;
    if (elShortLossesLabel) elShortLossesLabel.textContent = ls.short.lossesLabel || `Losses (${ls.short.losses})`;
    if (elShortLossesVal) {
      if (isCombined && ls.short.lossesValUSD !== undefined) {
        elShortLossesVal.textContent = formatMoney(ls.short.lossesValUSD);
      } else {
        elShortLossesVal.textContent = ls.short.lossesVal || fmtCurrency(-Math.abs(ls.short.losses * 37), isFx);
      }
    }
    if (elShortTrades) elShortTrades.textContent = `${ls.short.trades} trades (${ls.short.wins}W · ${ls.short.losses}L)`;
    if (elShortPf) elShortPf.textContent = `PF ${ls.short.profitFactor}`;
    if (elShortRR) elShortRR.textContent = `R:R ${ls.short.avgRR}`;

    // 3. Behaviour Card
    const beh = data.behaviour;
    const elDiscipline = document.getElementById('pbDiscipline');
    const elHoldTime = document.getElementById('pbHoldTime');
    const elRiskCompliance = document.getElementById('pbRiskCompliance');
    const elRevenge = document.getElementById('pbRevengeFlags');

    if (elDiscipline) elDiscipline.textContent = `${beh.disciplineScore}%`;
    if (elHoldTime) elHoldTime.textContent = beh.avgHoldTime;
    if (elRiskCompliance) elRiskCompliance.textContent = `${beh.riskCompliance}%`;
    if (elRevenge) elRevenge.textContent = `${beh.revengeTradingFlags} Flags`;

    // 4. Broker-Specific Views (Combined Multi-Market vs Indian Instrument vs Forex Session)
    const combinedView = document.getElementById('portfolioCombinedMarketView');
    const indianView = document.getElementById('portfolioIndianInstrumentView');
    const forexView = document.getElementById('portfolioForexSessionView');

    if (_activeMarket === 'combined') {
      if (combinedView) combinedView.hidden = false;
      if (indianView) indianView.hidden = true;
      if (forexView) forexView.hidden = true;

      const mk = data.marketPerformance || COMBINED_DATA.marketPerformance;
      if (mk) {
        // 1. Indian Market Card
        const elIndWr = document.getElementById('pmkIndianWinRate');
        const elIndBar = document.getElementById('pmkIndianBar');
        const elIndTrades = document.getElementById('pmkIndianTrades');
        const elIndPnl = document.getElementById('pmkIndianPnl');

        if (elIndWr) elIndWr.textContent = `${mk.indian.winRate}% Win Rate`;
        if (elIndBar) elIndBar.style.width = `${mk.indian.winRate}%`;
        if (elIndTrades) elIndTrades.textContent = mk.indian.tradesText;
        if (elIndPnl) elIndPnl.textContent = `${formatMoney(mk.indian.pnlUSD, { signed: true })} P&L`;

        // 2. Forex Market Card
        const elFxWr = document.getElementById('pmkForexWinRate');
        const elFxBar = document.getElementById('pmkForexBar');
        const elFxTrades = document.getElementById('pmkForexTrades');
        const elFxPnl = document.getElementById('pmkForexPnl');

        if (elFxWr) elFxWr.textContent = `${mk.forex.winRate}% Win Rate`;
        if (elFxBar) elFxBar.style.width = `${mk.forex.winRate}%`;
        if (elFxTrades) elFxTrades.textContent = mk.forex.tradesText;
        if (elFxPnl) elFxPnl.textContent = `${formatMoney(mk.forex.pnlUSD, { signed: true })} P&L`;

        // 3. Crypto Market Card
        const elCrWr = document.getElementById('pmkCryptoWinRate');
        const elCrBar = document.getElementById('pmkCryptoBar');
        const elCrTrades = document.getElementById('pmkCryptoTrades');
        const elCrPnl = document.getElementById('pmkCryptoPnl');

        if (elCrWr) elCrWr.textContent = `${mk.crypto.winRate}% Win Rate`;
        if (elCrBar) elCrBar.style.width = `${mk.crypto.winRate}%`;
        if (elCrTrades) elCrTrades.textContent = mk.crypto.tradesText;
        if (elCrPnl) elCrPnl.textContent = `${formatMoney(mk.crypto.pnlUSD, { signed: true })} P&L`;
      }
    } else if (_activeMarket === 'forex') {
      if (combinedView) combinedView.hidden = true;
      if (indianView) indianView.hidden = true;
      if (forexView) forexView.hidden = false;

      const sessionList = document.getElementById('portfolioSessionList');
      if (sessionList && data.sessions) {
        sessionList.innerHTML = data.sessions.map(s => `
          <div class="portfolio-session-row">
            <div class="portfolio-session-hdr">
              <span class="portfolio-session-name">${s.name}</span>
              <span class="portfolio-session-rate">${s.winRate}%</span>
            </div>
            <div class="portfolio-session-bar-track">
              <div class="portfolio-session-bar-fill" style="width: ${s.winRate}%;"></div>
            </div>
          </div>
        `).join('');
      }
    } else {
      // Indian Portfolio shows Instrument Breakdown (Stock vs F&O)
      if (combinedView) combinedView.hidden = true;
      if (indianView) indianView.hidden = false;
      if (forexView) forexView.hidden = true;

      const stk = data.instrumentPerformance.stocks;
      const fo = data.instrumentPerformance.fo;

      const elStkWr = document.getElementById('pinsStockWinRate');
      const elStkPnl = document.getElementById('pinsStockPnl');
      const elStkTrades = document.getElementById('pinsStockTrades');

      if (elStkWr) elStkWr.textContent = `${stk.winRate}% Win Rate`;
      if (elStkPnl) {
        elStkPnl.textContent = stk.pnlText ? `${stk.pnlText} P&L` : `${fmtCurrency(stk.pnl, false)} P&L`;
      }
      if (elStkTrades) elStkTrades.textContent = stk.tradesText || `${stk.trades} trades (${stk.wins}W · ${stk.losses}L)`;

      const elFoWr = document.getElementById('pinsFoWinRate');
      const elFoPnl = document.getElementById('pinsFoPnl');
      const elFoTrades = document.getElementById('pinsFoTrades');

      if (elFoWr) elFoWr.textContent = `${fo.winRate}% Win Rate`;
      if (elFoPnl) {
        elFoPnl.textContent = fo.pnlText ? `${fo.pnlText} P&L` : `${fmtCurrency(fo.pnl, false)} P&L`;
      }
      if (elFoTrades) elFoTrades.textContent = fo.tradesText || `${fo.trades} trades (${fo.wins}W · ${fo.losses}L)`;
    }

    // 5. Strategy Review Table (Last section)
    const stratTbody = document.getElementById('portfolioStrategyTableBody');
    if (stratTbody && data.strategies) {
      stratTbody.innerHTML = data.strategies.map(s => {
        let pnlText = '';
        let isWin = true;
        if (isCombined && s.pnlUSD !== undefined) {
          pnlText = formatMoney(s.pnlUSD, { signed: true });
          isWin = s.pnlUSD >= 0;
        } else {
          pnlText = s.pnlText || fmtCurrency(s.pnl, isFx);
          isWin = s.pnl !== undefined ? s.pnl >= 0 : !pnlText.includes('−') && !pnlText.includes('-');
        }

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
            <td class="${isWin ? 'text-profit' : 'text-loss'}"><strong>${pnlText}</strong></td>
            <td><span class="jtag ${s.status === 'Top Edge' ? 'jtag-active' : ''}">${s.status}</span></td>
          </tr>
        `;
      }).join('');
    }

    // Top Stats & Balance Trackers (Converts dynamically to selected currency)
    const elAccSize = document.getElementById('psAccountSize');
    const elTodayProf = document.getElementById('psTodayProfit');
    const elRadarScore = document.getElementById('psRadarScore');
    const elBalVal = document.getElementById('psBalanceVal');
    const elBalMax = document.getElementById('psBalanceMax');
    const elEqVal = document.getElementById('psEquityVal');
    const elEqMax = document.getElementById('psEquityMax');

    if (isCombined && data.topStats) {
      if (elAccSize) elAccSize.textContent = formatMoney(data.topStats.accountSizeUSD);
      if (elTodayProf) elTodayProf.textContent = formatMoney(data.topStats.todayProfitUSD);
      if (elRadarScore) elRadarScore.textContent = data.topStats.score;
      if (elBalVal) elBalVal.textContent = formatMoney(data.topStats.balanceUSD);
      if (elBalMax) elBalMax.textContent = `${formatMoney(data.topStats.balanceMaxUSD)} Max`;
      if (elEqVal) elEqVal.textContent = formatMoney(data.topStats.equityUSD);
      if (elEqMax) elEqMax.textContent = `${formatMoney(data.topStats.equityMaxUSD)} Max`;
    } else if (data.topStats) {
      if (elAccSize) elAccSize.textContent = data.topStats.accountSize || '$5,000.00';
      if (elTodayProf) elTodayProf.textContent = data.topStats.todayProfit || '$0.00';
      if (elRadarScore) elRadarScore.textContent = data.topStats.score || '2.84';
      if (elBalVal) elBalVal.textContent = data.topStats.balance || '$4,631.66';
      if (elBalMax) elBalMax.textContent = data.topStats.balanceMax || '$5,065.58 Max';
      if (elEqVal) elEqVal.textContent = data.topStats.equity || '$4,631.66';
      if (elEqMax) elEqMax.textContent = data.topStats.equityMax || '$5,124.10 Max';
    }

    // Render Canvas Charts
    renderRadarScore();
    renderPnlCurve(data);
    renderBrokerPnlCompare(data);
    renderBrokerCardsList();
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
  function switchPortfolioBroker(type, name) {
    if (type === 'combined' || type === 'all') {
      _activeMarket = 'combined';
    } else if (type === 'forex') {
      _activeMarket = 'forex';
    } else {
      _activeMarket = 'india';
    }

    const pbDropdown = document.getElementById('portfolioBrokerDropdown');
    if (pbDropdown) pbDropdown.classList.remove('dropdown-open');

    const cmpDropdown = document.getElementById('compareBrokerDropdown');
    if (cmpDropdown) cmpDropdown.classList.remove('dropdown-open');

    const btnSpan = document.querySelector('#portfolioBrokerDropdownBtn span:not(.p-dot)');
    if (btnSpan) {
      btnSpan.textContent = name ? `Connected: ${name}` : 'Connected Brokers';
    }

    const cmpBtnSpan = document.getElementById('compareBrokerDropdownLabel');
    if (cmpBtnSpan) {
      cmpBtnSpan.textContent = name ? `Connected: ${name}` : 'Connected Brokers (5)';
    }

    // Navigate to portfolio view if not already visible
    const pPage = document.getElementById('portfolioPage');
    if (pPage && pPage.hidden) {
      document.querySelectorAll('.page-container').forEach(p => { p.hidden = true; });
      pPage.hidden = false;
      window.location.hash = '#portfolio';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updatePortfolioUI();
  }

  window.switchPortfolioBroker = switchPortfolioBroker;

  /* ── Toggle Dropdown Helper (Zero Conflict Toggle) ── */
  function togglePortfolioDropdown(id, event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    const target = document.getElementById(id);
    if (!target) return;
    const isCurrentlyOpen = target.classList.contains('dropdown-open');

    // Close any other portfolio dropdowns first
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

    // Setup global dropdown outside-click closing listener once
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
      const data = _activeMarket === 'combined' ? COMBINED_DATA : (_activeMarket === 'forex' ? FOREX_DATA : INDIA_DATA);
      renderRadarScore();
      renderPnlCurve(data);
      renderBrokerPnlCompare(data);
      renderInstrumentProfit(data);
      renderPnlDuration(data);
      renderScatterPlot(data);
      renderSemiGauge('longGaugeCanvas', data.longShort.long.winRate);
      renderSemiGauge('shortGaugeCanvas', data.longShort.short.winRate);
    });

    updateBrokerCompareDropdownUI();
    updatePortfolioUI();
  }

  /* ── All Brokers Modal Functions ── */
  let _activeBrokerModalCat = 'all';

  function openAllBrokersModal() {
    const pbDropdown = document.getElementById('portfolioBrokerDropdown');
    if (pbDropdown) pbDropdown.classList.remove('dropdown-open');

    const modal = document.getElementById('allBrokersModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  function closeAllBrokersModal() {
    const modal = document.getElementById('allBrokersModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  function setBrokerModalCat(cat, btnEl) {
    _activeBrokerModalCat = cat;
    document.querySelectorAll('.broker-modal-tab').forEach(b => {
      b.style.background = 'rgba(255,255,255,0.05)';
      b.style.color = 'var(--text)';
      b.style.border = '1px solid rgba(255,255,255,0.1)';
    });
    if (btnEl) {
      btnEl.style.background = 'var(--accent)';
      btnEl.style.color = '#101322';
      btnEl.style.border = 'none';
    }
    filterAllBrokersModal();
  }

  function filterAllBrokersModal() {
    const searchVal = (document.getElementById('allBrokersSearchInput')?.value || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.broker-catalog-card');

    cards.forEach(c => {
      const cat = c.getAttribute('data-cat') || '';
      const name = (c.getAttribute('data-name') || '').toLowerCase();
      const matchesCat = (_activeBrokerModalCat === 'all' || cat === _activeBrokerModalCat);
      const matchesSearch = !searchVal || name.includes(searchVal);

      if (matchesCat && matchesSearch) {
        c.style.display = 'flex';
      } else {
        c.style.display = 'none';
      }
    });
  }

  window.openAllBrokersModal = openAllBrokersModal;
  window.closeAllBrokersModal = closeAllBrokersModal;
  window.setBrokerModalCat = setBrokerModalCat;
  window.filterAllBrokersModal = filterAllBrokersModal;
  window.openBrokerModal = openAllBrokersModal;

  window.initPortfolioPage = initPortfolioPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortfolioPage);
  } else {
    initPortfolioPage();
  }
}());
