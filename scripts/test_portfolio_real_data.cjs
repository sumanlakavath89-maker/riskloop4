// Automated Test for Portfolio Real Data Engine & Clean Empty States
const fs = require('fs');
const path = require('path');

console.log('Testing Portfolio Real Data Engine & Empty States...');

// Read portfolio.js and check for any leftover fake hardcoded numbers
const portfolioCode = fs.readFileSync(path.join(__dirname, '../portfolio.js'), 'utf8');

// 1. Verify no fake static mock data sets remain
if (portfolioCode.includes('COMBINED_DATA') || portfolioCode.includes('INDIA_DATA') || portfolioCode.includes('FOREX_DATA')) {
  console.error('FAIL: Found legacy COMBINED_DATA / INDIA_DATA / FOREX_DATA constants in portfolio.js');
  process.exit(1);
} else {
  console.log('PASS: No legacy hardcoded mock constants found in portfolio.js');
}

// 2. Mock browser DOM and LocalStorage environment
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const mockCtx = {
  setTransform: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  fill: () => {},
  arc: () => {},
  fillRect: () => {},
  setLineDash: () => {},
  fillText: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} })
};

const mockEl = {
  style: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  setAttribute: () => {},
  getAttribute: () => '',
  getContext: () => mockCtx,
  parentElement: { clientWidth: 600 },
  textContent: '',
  className: '',
  innerHTML: ''
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
  location: { hash: '' }
};
global.document = {
  getElementById: () => mockEl,
  querySelectorAll: () => [mockEl],
  querySelector: () => mockEl,
  addEventListener: () => {},
  readyState: 'complete'
};

// Evaluate portfolio.js
eval(portfolioCode);

if (typeof window.computePortfolioData !== 'function') {
  console.error('FAIL: window.computePortfolioData is not exposed');
  process.exit(1);
}
console.log('PASS: window.computePortfolioData is exposed and callable');

// 3. Test Empty State
localStorage.clear();
const emptyData = window.computePortfolioData('india');

console.log('\n--- Empty State Verification ---');
console.log('accountSize:', emptyData.accountSize);
console.log('todayProfit:', emptyData.todayProfit);
console.log('score:', emptyData.score);
console.log('balance:', emptyData.balance);
console.log('equity:', emptyData.equity);
console.log('pnlCurve length:', emptyData.pnlCurve.length);
console.log('scatterTrades length:', emptyData.scatterTrades.length);
console.log('winRate:', emptyData.metrics.winRate);

if (emptyData.accountSize !== null) throw new Error('accountSize must be null in empty state');
if (emptyData.todayProfit !== null) throw new Error('todayProfit must be null in empty state');
if (emptyData.score !== null) throw new Error('score must be null in empty state');
if (emptyData.balance !== null) throw new Error('balance must be null in empty state');
if (emptyData.equity !== null) throw new Error('equity must be null in empty state');
if (emptyData.pnlCurve.length !== 0) throw new Error('pnlCurve must be empty in empty state');
if (emptyData.scatterTrades.length !== 0) throw new Error('scatterTrades must be empty in empty state');
if (emptyData.metrics.winRate !== null) throw new Error('winRate must be null in empty state');

console.log('PASS: All Empty State checks passed!');

// 4. Test Populated State with Real Journal Trades and Broker
localStorage.setItem('riskloop_connected_brokers', JSON.stringify([
  { id: 'angelone', name: 'Angel One', brokerName: 'Angel One', balance: 250000, capital: 250000, currency: 'INR', category: 'india', connected: true }
]));

const todayStr = new Date().toISOString().split('T')[0];
localStorage.setItem('riskloop_journal_trades', JSON.stringify([
  { id: 't1', date: `${todayStr} 09:30:00`, symbol: 'NIFTY 24500 CE', pnl: 3500, side: 'BUY', status: 'CLOSED', entryPrice: 100, exitPrice: 135, stopLoss: 80 },
  { id: 't2', date: `${todayStr} 11:15:00`, symbol: 'BANKNIFTY 52000 PE', pnl: -1200, side: 'SELL', status: 'CLOSED', entryPrice: 200, exitPrice: 224, stopLoss: 180 },
  { id: 't3', date: '2026-08-20 10:00:00', symbol: 'RELIANCE', pnl: 4800, side: 'BUY', status: 'CLOSED', entryPrice: 2900, exitPrice: 2980, stopLoss: 2850 },
  { id: 't4', date: '2026-08-21 14:00:00', symbol: 'TCS', pnl: 2200, side: 'BUY', status: 'CLOSED', entryPrice: 4200, exitPrice: 4280, stopLoss: 4150 },
  { id: 't5', date: '2026-08-22 10:30:00', symbol: 'INFY', pnl: -800, side: 'SELL', status: 'CLOSED', entryPrice: 1800, exitPrice: 1816, stopLoss: 1780 },
  { id: 't6', date: '2026-08-23 11:00:00', symbol: 'TATAMOTORS', pnl: 1500, side: 'BUY', status: 'CLOSED', entryPrice: 1000, exitPrice: 1030, stopLoss: 980 }
]));

const realData = window.computePortfolioData('india');

console.log('\n--- Real Data Computation Verification ---');
console.log('Account Size:', realData.accountSize);
console.log('Today Profit:', realData.todayProfit);
console.log('Score:', realData.score);
console.log('Balance:', realData.balance);
console.log('Total Trades:', realData.metrics.totalTrades);
console.log('Win Rate:', realData.metrics.winRate.toFixed(1) + '%');
console.log('Avg Win:', realData.metrics.avgWin);
console.log('Avg Loss:', realData.metrics.avgLoss);
console.log('Profit Factor:', realData.metrics.profitFactor.toFixed(2));
console.log('PnL Curve points:', realData.pnlCurve.length);
console.log('Scatter points:', realData.scatterTrades.length);

if (realData.accountSize !== 250000) throw new Error('accountSize mismatch');
if (realData.todayProfit !== 2300) throw new Error(`todayProfit mismatch: expected 2300, got ${realData.todayProfit}`);
if (realData.balance !== 260000) throw new Error(`balance mismatch: expected 260000, got ${realData.balance}`);
if (realData.metrics.totalTrades !== 6) throw new Error('totalTrades mismatch');
if (realData.metrics.wins !== 4 || realData.metrics.losses !== 2) throw new Error('wins/losses mismatch');
if (Number(realData.score) <= 0) throw new Error('score must be computed when >= 5 trades exist');
if (realData.pnlCurve.length < 2) throw new Error('pnlCurve points missing');

console.log('\nALL TESTS PASSED SUCCESSFULLY! 🚀');
