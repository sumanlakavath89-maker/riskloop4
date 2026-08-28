// Automated Test for Leaderboard Real Data Engine & Empty States
const fs = require('fs');
const path = require('path');

console.log('Testing Leaderboard Real Data Engine & Empty States...');

// Read leaderboard.js and backend/src/routes/leaderboard.js
const frontendCode = fs.readFileSync(path.join(__dirname, '../leaderboard.js'), 'utf8');
const backendCode = fs.readFileSync(path.join(__dirname, '../backend/src/routes/leaderboard.js'), 'utf8');

// 1. Verify no fake static mock data sets remain
const forbiddenStrings = ['Aarav Sharma', 'Vikram Mehta', 'SEED_TRADERS', 'totalParticipants = 2184', 'rank: 47'];
forbiddenStrings.forEach(str => {
  if (frontendCode.includes(str) || backendCode.includes(str)) {
    console.error(`FAIL: Found forbidden string "${str}" in code`);
    process.exit(1);
  }
});
console.log('PASS: No legacy hardcoded mock constants found in frontend or backend leaderboard files');

// 2. Mock browser DOM and LocalStorage environment
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const domElements = {};
function getOrCreateEl(id) {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      setAttribute: () => {},
      getAttribute: () => '',
      addEventListener: () => {},
      removeEventListener: () => {},
      textContent: '',
      className: '',
      innerHTML: '',
      hidden: false
    };
  }
  return domElements[id];
}

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  devicePixelRatio: 1,
  location: { hash: '' }
};
global.document = {
  getElementById: (id) => getOrCreateEl(id),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  body: { style: {} },
  readyState: 'complete'
};

// Evaluate leaderboard.js
eval(frontendCode);

if (typeof window.calculateRiskLoopScore !== 'function') {
  console.error('FAIL: window.calculateRiskLoopScore is not exposed');
  process.exit(1);
}
console.log('PASS: window.calculateRiskLoopScore is exposed and callable');

// 3. Test Empty State
localStorage.clear();
window.initLeaderboardPage();

console.log('\n--- Empty State Verification ---');
console.log('User Rank:', getOrCreateEl('lbUserRankVal').textContent);
console.log('User Score:', getOrCreateEl('lbUserScoreVal').textContent);
console.log('User Score Sub:', getOrCreateEl('lbUserScoreSub').textContent);
console.log('User Return:', getOrCreateEl('lbUserReturnVal').textContent);
console.log('User Win Rate:', getOrCreateEl('lbUserWinRateVal').textContent);
console.log('Empty Notice Hidden:', getOrCreateEl('lbEmptyNotice').hidden);
console.log('Empty Notice Content:', getOrCreateEl('lbEmptyNotice').innerHTML);

if (getOrCreateEl('lbUserRankVal').textContent !== '—') throw new Error('User rank must be "—" in empty state');
if (getOrCreateEl('lbUserScoreVal').textContent !== '—') throw new Error('User score must be "—" in empty state');
if (getOrCreateEl('lbUserReturnVal').textContent !== '—') throw new Error('User return must be "—" in empty state');
if (getOrCreateEl('lbUserScoreSub').textContent !== 'No performance data available yet') throw new Error('Score subtext must indicate no performance data');
if (!getOrCreateEl('lbEmptyNotice').innerHTML.includes('No leaderboard data available yet')) throw new Error('Empty notice must contain "No leaderboard data available yet"');
if (!getOrCreateEl('lbEmptyNotice').innerHTML.includes('Be among the first traders to build a verified track record.')) throw new Error('Empty notice must contain subtitle');

console.log('PASS: All Leaderboard Empty State checks passed!');

// 4. Test Populated State with Real Journal Trades and Broker
localStorage.setItem('riskloop_connected_brokers', JSON.stringify([
  { id: 'angelone', name: 'Angel One', brokerName: 'Angel One', balance: 500000, capital: 500000, currency: 'INR', category: 'india', connected: true }
]));

const todayStr = new Date().toISOString().split('T')[0];
localStorage.setItem('riskloop_journal_trades', JSON.stringify([
  { id: 't1', date: `${todayStr} 09:30:00`, symbol: 'NIFTY 24500 CE', pnl: 8500, side: 'BUY', status: 'CLOSED', entryPrice: 100, exitPrice: 135, stopLoss: 80 },
  { id: 't2', date: `${todayStr} 11:15:00`, symbol: 'BANKNIFTY 52000 PE', pnl: -2200, side: 'SELL', status: 'CLOSED', entryPrice: 200, exitPrice: 224, stopLoss: 180 },
  { id: 't3', date: '2026-08-20 10:00:00', symbol: 'RELIANCE', pnl: 12800, side: 'BUY', status: 'CLOSED', entryPrice: 2900, exitPrice: 2980, stopLoss: 2850 },
  { id: 't4', date: '2026-08-21 14:00:00', symbol: 'TCS', pnl: 6200, side: 'BUY', status: 'CLOSED', entryPrice: 4200, exitPrice: 4280, stopLoss: 4150 },
  { id: 't5', date: '2026-08-22 10:30:00', symbol: 'INFY', pnl: -1800, side: 'SELL', status: 'CLOSED', entryPrice: 1800, exitPrice: 1816, stopLoss: 1780 },
  { id: 't6', date: '2026-08-23 11:00:00', symbol: 'TATAMOTORS', pnl: 4500, side: 'BUY', status: 'CLOSED', entryPrice: 1000, exitPrice: 1030, stopLoss: 980 }
]));

window.initLeaderboardPage();

console.log('\n--- Real Data Computation Verification ---');
console.log('User Score:', getOrCreateEl('lbUserScoreVal').textContent);
console.log('User Score Sub:', getOrCreateEl('lbUserScoreSub').textContent);
console.log('User Return:', getOrCreateEl('lbUserReturnVal').textContent);
console.log('User Win Rate:', getOrCreateEl('lbUserWinRateVal').textContent);
console.log('User Profit Factor:', getOrCreateEl('lbUserPfVal').textContent);
console.log('User Avg R:', getOrCreateEl('lbUserAvgRVal').textContent);

if (getOrCreateEl('lbUserScoreVal').textContent === '—') throw new Error('Score should be calculated when >= 5 trades exist');
if (getOrCreateEl('lbUserReturnVal').textContent !== '+5.6%') throw new Error(`Expected +5.6% return, got ${getOrCreateEl('lbUserReturnVal').textContent}`);
if (getOrCreateEl('lbUserWinRateVal').textContent !== '66.7%') throw new Error(`Expected 66.7% win rate, got ${getOrCreateEl('lbUserWinRateVal').textContent}`);

console.log('\nALL LEADERBOARD TESTS PASSED SUCCESSFULLY! 🚀');
