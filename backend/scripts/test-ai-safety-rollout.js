import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/admin';
const ADMIN_HEADER = { 'x-user-id': 'admin_alice', 'x-user-role': 'admin', 'x-admin-key': 'riskloop-master-admin-key' };
const USER_HEADER = { 'x-user-id': 'trader_bob', 'x-user-role': 'user' };

async function runSafetyAndRolloutTests() {
  console.log('🛡️  Starting Production AI Model Safety & Staged Rollout Gate Test Suite...\n');

  let passed = 0;
  let failed = 0;
  let versionId = null;
  let baselineModelId = null;
  let safeCandidateId = null;
  let unsafeCandidateId = null;
  let rolloutId = null;

  // Setup: Create dataset snapshot & models
  try {
    const vRes = await axios.post(`${BASE_URL}/ai-dataset/versions`, {
      versionTag: `v2.0.${Date.now().toString().slice(-4)}`,
      name: 'Safety Verification Golden Test Snapshot'
    }, { headers: ADMIN_HEADER });
    versionId = vRes.data?.data?.id;

    // Baseline Model (94.0%)
    const bRes = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Active Benchmark Model v1',
      datasetVersionId: versionId,
      modelArchitecture: 'Vision-ViT-Base',
      overallAccuracyPct: 94.0,
      latencyMs: 320,
      isBaseline: true,
      fieldAccuracies: { symbol: 95, direction: 96, setup: 90, entry: 94.5, stop_loss: 94.0, take_profit: 94.0, outcome: 95 }
    }, { headers: ADMIN_HEADER });
    baselineModelId = bRes.data?.data?.id;

    // Safe Candidate Model (97.5% Acc, Entry: 97%, SL: 96.5%, TP: 96%, Latency: 260ms)
    const sRes = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Gemini 1.5 Pro Safety Certified Model',
      datasetVersionId: versionId,
      modelArchitecture: 'Gemini-1.5-Pro-FT',
      overallAccuracyPct: 97.5,
      latencyMs: 260,
      fieldAccuracies: { symbol: 99, direction: 99, setup: 95, entry: 97.0, stop_loss: 96.5, take_profit: 96.0, outcome: 99 }
    }, { headers: ADMIN_HEADER });
    safeCandidateId = sRes.data?.data?.id;

    // Unsafe Candidate Model (High overall 95.5%, but Stop Loss fails critical threshold at 91.0%)
    const uRes = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Unsafe Regression Model Trial',
      datasetVersionId: versionId,
      modelArchitecture: 'Experimental-CNN',
      overallAccuracyPct: 95.5,
      latencyMs: 520, // Also breaches 450ms budget
      fieldAccuracies: { symbol: 98, direction: 98, setup: 95, entry: 96.0, stop_loss: 91.0, take_profit: 96.0, outcome: 98 }
    }, { headers: ADMIN_HEADER });
    unsafeCandidateId = uRes.data?.data?.id;
  } catch (err) {
    console.error('Setup error:', err.message);
  }

  // ── Test 1: 5-Point Safety Gate Evaluation on Candidate ──────────
  try {
    const res = await axios.get(`${BASE_URL}/ai-rollout/safety-check/${safeCandidateId}`, { headers: ADMIN_HEADER });
    const data = res.data?.data;

    if (res.data?.success && data?.isApproved && data?.checks?.length === 5) {
      console.log(`✅ Test 1 PASSED: 5-point safety gate passed for certified candidate (${data.gateStatus})`);
      passed++;
    } else {
      console.error('❌ Test 1 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 2: Safety Gate Rejection on Unsafe Candidate ─────────────
  try {
    const res = await axios.get(`${BASE_URL}/ai-rollout/safety-check/${unsafeCandidateId}`, { headers: ADMIN_HEADER });
    const data = res.data?.data;

    if (res.data?.success && !data?.isApproved && data?.reasons?.length > 0) {
      console.log(`✅ Test 2 PASSED: Safety gate rejected unsafe model: ${data.reasons.join(' | ')}`);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Expected rejection, got', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 3: Block Starting Canary for Safety Violator ─────────────
  try {
    await axios.post(`${BASE_URL}/ai-rollout/start-canary`, {
      modelId: unsafeCandidateId,
      trafficPercentage: 10
    }, { headers: ADMIN_HEADER });
    console.error('❌ Test 3 FAILED: Canary allowed on unsafe candidate');
    failed++;
  } catch (err) {
    if (err.response?.status === 400 && String(err.response?.data?.error).includes('Safety Gate Rejected')) {
      console.log('✅ Test 3 PASSED: Canary rollout strictly blocked for unsafe candidate (400 Bad Request)');
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Unexpected error:', err.response?.data);
      failed++;
    }
  }

  // ── Test 4: Start Staged 10% Canary on Approved Model ─────────────
  try {
    const res = await axios.post(`${BASE_URL}/ai-rollout/start-canary`, {
      modelId: safeCandidateId,
      trafficPercentage: 10
    }, { headers: ADMIN_HEADER });

    const rollout = res.data?.data;
    if (res.data?.success && rollout?.rolloutStatus === 'STAGED_CANARY' && rollout?.trafficPercentage === 10) {
      rolloutId = rollout.id;
      console.log(`✅ Test 4 PASSED: Staged canary initiated successfully: ${rollout.modelName} at 10% live traffic`);
      passed++;
    } else {
      console.error('❌ Test 4 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 5: Dynamic Canary Traffic Adjustments (10% -> 25% -> 50%) ─
  try {
    const res25 = await axios.post(`${BASE_URL}/ai-rollout/adjust-traffic`, {
      rolloutId,
      trafficPercentage: 25
    }, { headers: ADMIN_HEADER });

    const res50 = await axios.post(`${BASE_URL}/ai-rollout/adjust-traffic`, {
      rolloutId,
      trafficPercentage: 50
    }, { headers: ADMIN_HEADER });

    if (res25.data?.data?.trafficPercentage === 25 && res50.data?.data?.trafficPercentage === 50) {
      console.log('✅ Test 5 PASSED: Canary traffic dynamically staged from 10% -> 25% -> 50%');
      passed++;
    } else {
      console.error('❌ Test 5 FAILED:', res50.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Production Anomaly Detection & Automated Rollback ────
  try {
    // Simulate high error rate (4.8% > 3.0% threshold)
    const res = await axios.post(`${BASE_URL}/ai-rollout/telemetry-event`, {
      rolloutId,
      modelId: safeCandidateId,
      trafficCount: 250,
      productionAccuracyPct: 92.0,
      userCorrectionRatePct: 24.5, // > 20%
      criticalPriceCorrectionRatePct: 4.0,
      errorRatePct: 4.8, // > 3%
      avgLatencyMs: 310
    }, { headers: ADMIN_HEADER });

    const data = res.data?.data;
    if (data?.rollbackTriggered && data?.rollout?.trafficPercentage === 0 && data?.rollout?.rolloutStatus === 'ROLLED_BACK') {
      console.log(`✅ Test 6 PASSED: Automated rollback triggered instantly: ${data.rollbackReason} (Traffic reverted to 0%)`);
      passed++;
    } else {
      console.error('❌ Test 6 FAILED:', data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 7: Full Production Promotion for Stable Canary ──────────
  try {
    // Re-start canary and promote to full production
    const reStart = await axios.post(`${BASE_URL}/ai-rollout/start-canary`, {
      modelId: safeCandidateId,
      trafficPercentage: 50
    }, { headers: ADMIN_HEADER });

    const newRolloutId = reStart.data?.data?.id;

    const res = await axios.post(`${BASE_URL}/ai-rollout/promote-full`, {
      rolloutId: newRolloutId
    }, { headers: ADMIN_HEADER });

    const rollout = res.data?.data;
    if (rollout?.rolloutStatus === 'FULL_PRODUCTION' && rollout?.trafficPercentage === 100) {
      console.log(`✅ Test 7 PASSED: Stable canary promoted to 100% full production baseline`);
      passed++;
    } else {
      console.error('❌ Test 7 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 7 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 8: Non-Admin Access Protection ──────────────────────────
  try {
    await axios.get(`${BASE_URL}/ai-rollout/active`, { headers: USER_HEADER });
    console.error('❌ Test 8 FAILED: Non-admin accessed rollout controller');
    failed++;
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Test 8 PASSED: Non-admin access to rollout and safety routes strictly blocked (403 Forbidden)');
      passed++;
    } else {
      console.error('❌ Test 8 FAILED:', err.response?.status);
      failed++;
    }
  }

  console.log(`\n📊 Safety & Rollout Gate Test Summary: ${passed} Passed, ${failed} Failed\n`);
}

runSafetyAndRolloutTests();
