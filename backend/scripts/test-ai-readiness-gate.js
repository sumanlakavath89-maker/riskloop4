import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/admin/ai-dataset';
const ADMIN_HEADER = { 'x-user-id': 'admin_alice', 'x-user-role': 'admin', 'x-admin-key': 'riskloop-master-admin-key' };
const USER_HEADER = { 'x-user-id': 'trader_bob', 'x-user-role': 'user' };

async function runReadinessGateTests() {
  console.log('⚖️  Starting Multi-Dimensional Dataset Training Readiness Gate Test Suite...\n');

  let passed = 0;
  let failed = 0;

  // ── Test 1: Verify all 7 Gate Dimensions in Analytics API ─────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const gateData = res.data?.data?.readinessGate;

    const expectedGateIds = [
      'volume_scale',
      'quality_ratio',
      'market_coverage',
      'directional_balance',
      'platform_diversity',
      'field_completeness',
      'per_field_quality'
    ];

    if (
      res.data?.success &&
      gateData &&
      gateData.overallStatus &&
      Array.isArray(gateData.gates) &&
      gateData.gates.length === 7 &&
      expectedGateIds.every(id => gateData.gates.some(g => g.id === id))
    ) {
      console.log(`✅ Test 1 PASSED: All 7 gate dimensions returned in readiness gate evaluation:`, {
        overallStatus: gateData.overallStatus,
        badge: gateData.overallBadgeText,
        gateCount: gateData.gates.length
      });
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Incomplete gates returned:', gateData);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 2: Volume & Scale Gate Deficit Explanation ──────────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const volGate = res.data?.data?.readinessGate?.gates?.find(g => g.id === 'volume_scale');

    if (volGate && (volGate.status === 'FAIL' || volGate.status === 'WARNING') && volGate.deficit.length > 0) {
      console.log(`✅ Test 2 PASSED: Volume gate evaluated correctly with deficit explanation: "${volGate.deficit}"`);
      passed++;
    } else if (volGate && volGate.status === 'PASS') {
      console.log(`✅ Test 2 PASSED: Volume gate evaluated with status ${volGate.status}`);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Volume gate missing deficit explanation:', volGate);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 3: Market-Class Coverage Gate Evaluation ────────────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const mktGate = res.data?.data?.readinessGate?.gates?.find(g => g.id === 'market_coverage');

    if (mktGate && mktGate.current && mktGate.status) {
      console.log(`✅ Test 3 PASSED: Market-class coverage gate evaluated: Status = ${mktGate.status}, Current = ${mktGate.current}`);
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Invalid market coverage gate:', mktGate);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 4: Directional Equilibrium Gate Evaluation ──────────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const dirGate = res.data?.data?.readinessGate?.gates?.find(g => g.id === 'directional_balance');

    if (dirGate && dirGate.current && dirGate.status) {
      console.log(`✅ Test 4 PASSED: BUY/SELL directional balance gate evaluated: Status = ${dirGate.status}, Current = ${dirGate.current}`);
      passed++;
    } else {
      console.error('❌ Test 4 FAILED: Invalid directional balance gate:', dirGate);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 5: Overall Readiness Status Blocked when Thresholds Unmet ─
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const gateData = res.data?.data?.readinessGate;

    const hasFails = gateData.gates.some(g => g.status === 'FAIL');
    if (hasFails && gateData.overallStatus === 'NOT_READY_BLOCKED' && gateData.isReadyForTraining === false) {
      console.log(`✅ Test 5 PASSED: Dataset correctly blocked from training (Status = ${gateData.overallStatus}) due to ${gateData.failCount} failed gate(s)`);
      passed++;
    } else if (!hasFails && gateData.overallStatus !== 'NOT_READY_BLOCKED') {
      console.log(`✅ Test 5 PASSED: Overall status is ${gateData.overallStatus}`);
      passed++;
    } else {
      console.error('❌ Test 5 FAILED: Unexpected overall status calculation:', gateData);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Non-Admin Access Security Gate ───────────────────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: USER_HEADER });
    console.error('❌ Test 6 FAILED: Non-admin accessed readiness gate analytics with', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Test 6 PASSED: Non-admin access to readiness gate analytics strictly blocked (403 Forbidden)');
      passed++;
    } else {
      console.error('❌ Test 6 FAILED: Unexpected error status:', err.response?.status);
      failed++;
    }
  }

  console.log(`\n📊 Readiness Gate Test Summary: ${passed} Passed, ${failed} Failed\n`);
}

runReadinessGateTests();
