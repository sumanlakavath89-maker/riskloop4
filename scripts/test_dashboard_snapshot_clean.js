import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testDashboardSnapshotIntegrity() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING PORTFOLIO & RISK SNAPSHOT GENUINE EMPTY & REAL DATA STATE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // 1. Check index.html initial static markup
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('id="dashTotalCapital">—</div>'), 'index.html dashTotalCapital starts with "—"');
  assert(html.includes('id="dashTodayPnl">—</div>'), 'index.html dashTodayPnl starts with "—"');
  assert(html.includes('id="dashTodayPnlSub">\n                <span>No trades closed yet</span>'), 'index.html dashTodayPnlSub starts with "No trades closed yet"');
  assert(html.includes('id="dashMtdPnl">—</div>'), 'index.html dashMtdPnl starts with "—"');
  assert(html.includes('id="dashMtdPnlSub">\n                <span>No data available</span>'), 'index.html dashMtdPnlSub starts with "No data available"');
  assert(html.includes('id="dashAvailableCapital">—</div>'), 'index.html dashAvailableCapital starts with "—"');
  assert(html.includes('id="dashOpenExposure">—</div>'), 'index.html dashOpenExposure starts with "—"');
  assert(html.includes('id="dashOpenExposureSub">\n                <span>No active positions</span>'), 'index.html dashOpenExposureSub starts with "No active positions"');
  assert(html.includes('No brokers connected</span>'), 'index.html dashBrokerStatus starts with "No brokers connected"');
  assert(html.includes('id="dashRiskPerTrade">—</div>'), 'index.html dashRiskPerTrade starts with "—"');
  assert(html.includes('id="dashTodayRiskUsed">—</div>'), 'index.html dashTodayRiskUsed starts with "—"');
  assert(html.includes('id="dashDailyDrawdown">—</div>'), 'index.html dashDailyDrawdown starts with "—"');
  assert(html.includes('id="dashOpenRisk">—</div>'), 'index.html dashOpenRisk starts with "—"');
  assert(html.includes('Shield not configured</span>'), 'index.html dashCapitalShieldBadge starts with "Shield not configured"');
  assert(html.includes('id="dashRemainingRiskLimit">—</div>'), 'index.html dashRemainingRiskLimit starts with "—"');

  // Verify zero fake hardcoded numbers in snapshot cards
  assert(!html.includes('id="dashTotalCapital">₹5,00,000</div>'), 'Zero hardcoded ₹5,00,000 in dashTotalCapital');
  assert(!html.includes('id="dashTodayPnl">₹0.00</div>'), 'Zero hardcoded ₹0.00 in dashTodayPnl');
  assert(!html.includes('id="dashAvailableCapital">₹5,00,000</div>'), 'Zero hardcoded ₹5,00,000 in dashAvailableCapital');
  assert(!html.includes('id="dashRemainingRiskLimit">₹15,00,000</div>'), 'Zero hardcoded ₹15,00,000 in dashRemainingRiskLimit');

  // 2. Check script.js for absence of fallback sample mock trades
  const scriptPath = path.join(__dirname, '..', 'script.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert(!script.includes("symbol: 'NIFTY 24800 CE'"), 'Zero sample mock trade "NIFTY 24800 CE" fallback in script.js');
  assert(!script.includes("discipline: 'CPR Breakout'"), 'Zero sample mock trade "CPR Breakout" fallback in script.js');
  assert(!script.includes("symbol: 'BANKNIFTY 52400 PE'"), 'Zero sample mock trade "BANKNIFTY 52400 PE" fallback in script.js');

  // 3. Check brokers.js for dynamic empty initialization
  const brokersPath = path.join(__dirname, '..', 'brokers.js');
  const brokers = fs.readFileSync(brokersPath, 'utf8');

  assert(!brokers.includes("accountName: 'Suman Ghosh'"), 'Zero hardcoded fake account "Suman Ghosh" in brokers.js');
  assert(brokers.includes('connectedBrokers: loadSavedConnectedBrokers()'), 'brokers.js initializes dynamically from persistent state');

  console.log('\n========================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

testDashboardSnapshotIntegrity();
