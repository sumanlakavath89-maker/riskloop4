import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/ai-learning';

async function runSecurityAudit() {
  console.log('🛡️  Starting RiskLoop AI Learning Security & Data-Quality Audit...\n');

  let passed = 0;
  let failed = 0;

  // ── Test 1: Unauthenticated request rejection (401) ─────────────
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      rawPrediction: { symbol: 'NIFTY' },
      finalSavedValues: { symbol: 'NIFTY', entry: 24500, sl: 24450, tp: 24600, outcome: 'Win' }
    });
    console.error('❌ Test 1 FAILED: Expected 401 Unauthorized for unauthenticated POST, received', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('✅ Test 1 PASSED: Unauthenticated POST correctly rejected with 401 Unauthorized');
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Unexpected status code', err.response?.status);
      failed++;
    }
  }

  // ── Test 2: Reject Malformed / Incomplete payload (400) ──────────
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      rawPrediction: { symbol: 'NIFTY' },
      finalSavedValues: { symbol: 'NIFTY', entry: -50, sl: 24450, tp: 24600, outcome: 'Win' } // negative price
    }, {
      headers: { 'x-user-id': 'user_alice' }
    });
    console.error('❌ Test 2 FAILED: Expected 400 Bad Request for negative price, received', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.error?.includes('Validation failed')) {
      console.log('✅ Test 2 PASSED: Malformed input (negative price) rejected with 400 Bad Request:', err.response.data.error);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Unexpected error', err.response?.data || err.message);
      failed++;
    }
  }

  // ── Test 3: Authenticated valid submission (200) ─────────────────
  let sampleIdAlice = null;
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_alice_101',
      market: 'forex',
      source: 'client_ocr',
      imageHash: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      imageName: 'gold_chart.png',
      rawPrediction: { symbol: 'XAUUSD', direction: 'SELL', entry: 2650.2, stop_loss: 2657.8, take_profit: 2634.0, outcome: 'Win' },
      confidenceScores: { symbol: 98, entry: 94, stop_loss: 92, take_profit: 90, outcome: 94 },
      finalSavedValues: { symbol: 'XAUUSD', direction: 'SELL', setup: 'Order Block Breakdown', entry: 2650.2, sl: 2657.8, tp: 2634.0, outcome: 'Win' }
    }, {
      headers: { 'x-user-id': 'user_alice' }
    });

    if (res.data?.success && res.data?.data?.sampleId) {
      sampleIdAlice = res.data.data.sampleId;
      console.log('✅ Test 3 PASSED: Valid authenticated sample recorded, sample ID:', sampleIdAlice);
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Invalid response payload', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 4: Deduplication on repeated submit (idempotent) ────────
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_alice_101', // same tradeId for user_alice
      market: 'forex',
      source: 'client_ocr',
      rawPrediction: { symbol: 'XAUUSD', direction: 'SELL', entry: 2650.2, stop_loss: 2657.8, take_profit: 2634.0, outcome: 'Win' },
      finalSavedValues: { symbol: 'XAUUSD', direction: 'SELL', setup: 'Updated Setup', entry: 2650.2, sl: 2657.8, tp: 2634.0, outcome: 'Win' }
    }, {
      headers: { 'x-user-id': 'user_alice' }
    });

    if (res.data?.data?.sampleId === sampleIdAlice) {
      console.log('✅ Test 4 PASSED: Deduplication verified — updated existing record without duplicate row');
      passed++;
    } else {
      console.error('❌ Test 4 FAILED: Created duplicate ID instead of updating:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 5: Multi-Tenant Data Isolation ──────────────────────────
  try {
    // User Bob requests samples
    const resBob = await axios.get(`${BASE_URL}/samples`, {
      headers: { 'x-user-id': 'user_bob' }
    });

    const bobSamples = resBob.data?.data?.samples || [];
    const containsAliceSample = bobSamples.some(s => s.userId === 'user_alice');

    if (!containsAliceSample && resBob.data?.data?.accessLevel === 'PRIVATE_USER') {
      console.log('✅ Test 5 PASSED: Multi-tenant data isolation verified — User Bob cannot view User Alice samples');
      passed++;
    } else {
      console.error('❌ Test 5 FAILED: Privacy breach, Bob received Alice samples:', bobSamples);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Admin Global Dataset Export Authorization ───────────
  try {
    const resAdmin = await axios.get(`${BASE_URL}/samples`, {
      headers: {
        'x-user-id': 'admin_super',
        'x-user-role': 'admin',
        'x-admin-key': 'riskloop-master-admin-key'
      }
    });

    if (resAdmin.data?.success && resAdmin.data?.data?.accessLevel === 'GLOBAL_EXPORT') {
      console.log('✅ Test 6 PASSED: Verified Admin successfully authorized for global dataset export');
      passed++;
    } else {
      console.error('❌ Test 6 FAILED: Admin authorization failed:', resAdmin.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    failed++;
  }

  console.log(`\n📊 Audit Summary: ${passed} Passed, ${failed} Failed\n`);
}

runSecurityAudit();
