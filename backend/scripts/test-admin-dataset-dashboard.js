import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/admin/ai-dataset';
const USER_HEADER = { 'x-user-id': 'trader_bob', 'x-user-role': 'user' };
const ADMIN_HEADER = { 'x-user-id': 'admin_alice', 'x-user-role': 'admin', 'x-admin-key': 'riskloop-master-admin-key' };

async function runAdminDashboardTests() {
  console.log('🏛️  Starting Admin AI Dataset Dashboard & Export Test Suite...\n');

  let passed = 0;
  let failed = 0;

  // ── Test 1: Non-Admin access to Analytics rejected with 403 ──────
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: USER_HEADER });
    console.error('❌ Test 1 FAILED: Expected 403 Forbidden for non-admin user, received', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Test 1 PASSED: Non-admin access to global dataset analytics rejected with 403 Forbidden');
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Unexpected status code', err.response?.status);
      failed++;
    }
  }

  // ── Test 2: Admin access to Analytics returns full dataset metrics ─
  try {
    const res = await axios.get(`${BASE_URL}/analytics`, { headers: ADMIN_HEADER });
    const d = res.data?.data;

    if (
      res.data?.success &&
      d?.totalSamples !== undefined &&
      d?.trainingReadySamples !== undefined &&
      d?.qualityBreakdown &&
      Array.isArray(d?.correctedFieldsRank) &&
      Array.isArray(d?.invalidReasons) &&
      d?.modelMilestoneTarget === 1000
    ) {
      console.log('✅ Test 2 PASSED: Admin successfully retrieved full dataset analytics:', {
        totalSamples: d.totalSamples,
        trainingReadySamples: d.trainingReadySamples,
        qualityScore: d.avgQualityScore,
        mostCorrectedField: d.correctedFieldsRank[0]?.field || 'None',
        topInvalidReason: d.invalidReasons[0]?.reason || 'None'
      });
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Incomplete admin analytics payload:', d);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 3: Market-Filtered Admin Analytics ──────────────────────
  try {
    const res = await axios.get(`${BASE_URL}/analytics?market=forex`, { headers: ADMIN_HEADER });
    const d = res.data?.data;

    if (res.data?.success && d?.totalSamples !== undefined) {
      console.log(`✅ Test 3 PASSED: Market-filtered query (?market=forex) returned ${d.totalSamples} forex samples`);
      passed++;
    } else {
      console.error('❌ Test 3 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 4: Non-Admin Export rejected with 403 ───────────────────
  try {
    const res = await axios.get(`${BASE_URL}/export?format=json`, { headers: USER_HEADER });
    console.error('❌ Test 4 FAILED: Expected 403 Forbidden for non-admin export, received', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Test 4 PASSED: Non-admin dataset export attempt rejected with 403 Forbidden');
      passed++;
    } else {
      console.error('❌ Test 4 FAILED: Unexpected status code', err.response?.status);
      failed++;
    }
  }

  // ── Test 5: Admin JSON Export ────────────────────────────────────
  try {
    const res = await axios.get(`${BASE_URL}/export?format=json&training_ready=true`, { headers: ADMIN_HEADER });
    const data = res.data;

    if (data?.dataset_name && Array.isArray(data?.samples) && data.samples.length > 0) {
      const firstSample = data.samples[0];
      const hasPrivateUserId = Boolean(firstSample.userId || firstSample.user_id);

      if (!hasPrivateUserId && firstSample.ground_truth && firstSample.raw_prediction) {
        console.log(`✅ Test 5 PASSED: Admin exported sanitized JSON dataset (${data.samples.length} training-ready samples)`);
        passed++;
      } else {
        console.error('❌ Test 5 FAILED: Sanitization failed or invalid structure:', firstSample);
        failed++;
      }
    } else {
      console.error('❌ Test 5 FAILED: Invalid JSON export response:', data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Admin CSV Export ─────────────────────────────────────
  try {
    const res = await axios.get(`${BASE_URL}/export?format=csv&training_ready=true`, { headers: ADMIN_HEADER });
    const csvText = String(res.data || '');

    if (csvText.startsWith('sample_id,market,source') && csvText.includes('\n')) {
      const lines = csvText.trim().split('\n');
      console.log(`✅ Test 6 PASSED: Admin exported CSV dataset (${lines.length - 1} rows + headers)`);
      passed++;
    } else {
      console.error('❌ Test 6 FAILED: Invalid CSV structure:', csvText.substring(0, 100));
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    failed++;
  }

  console.log(`\n📊 Admin Dashboard Test Summary: ${passed} Passed, ${failed} Failed\n`);
}

runAdminDashboardTests();
