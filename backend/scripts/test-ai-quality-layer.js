import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/ai-learning';
const AUTH_HEADER = { 'x-user-id': 'quality_tester_1', 'x-user-role': 'admin' };

async function runQualityTests() {
  console.log('🧪 Starting Dataset Quality & Verification Layer Tests...\n');

  let passed = 0;
  let failed = 0;

  // ── Test 1: VERIFIED Sample (AI predictions match final values 100%) ──
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_qual_verified_1',
      market: 'indian',
      rawPrediction: { symbol: 'NIFTY', direction: 'BUY', setup: 'Breakout', entry: 24500.0, stop_loss: 24420.0, take_profit: 24680.0, outcome: 'Win' },
      finalSavedValues: { symbol: 'NIFTY', direction: 'BUY', setup: 'Breakout', entry: 24500.0, sl: 24420.0, tp: 24680.0, outcome: 'Win' },
      userReviewed: true,
      editedFields: []
    }, { headers: AUTH_HEADER });

    const d = res.data?.data;
    if (d?.verificationStatus === 'VERIFIED' && d?.isTrainingReady === true && d?.inconsistencyFlags?.length === 0) {
      console.log('✅ Test 1 PASSED: Clean 100% match correctly classified as VERIFIED and isTrainingReady = true');
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Unexpected classification', d);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 2: USER_EDITED Sample (User edited Take Profit & Setup) ──
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_qual_edited_1',
      market: 'forex',
      rawPrediction: { symbol: 'XAUUSD', direction: 'SELL', entry: 2650.2, stop_loss: 2657.8, take_profit: 2634.0, outcome: 'Win' },
      finalSavedValues: { symbol: 'XAUUSD', direction: 'SELL', setup: 'Order Block Breakdown', entry: 2650.2, sl: 2657.8, tp: 2625.0, outcome: 'Win' }, // user changed TP to 2625.0
      userReviewed: true,
      editedFields: ['tp', 'setup']
    }, { headers: AUTH_HEADER });

    const d = res.data?.data;
    if (d?.verificationStatus === 'USER_EDITED' && d?.isTrainingReady === true && d?.editedFields?.includes('tp')) {
      console.log('✅ Test 2 PASSED: User corrections correctly classified as USER_EDITED with tracked fields:', d.editedFields);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Unexpected classification', d);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 3: Inconsistent BUY trade (SL >= Entry) classified as INVALID ──
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_qual_invalid_buy',
      market: 'indian',
      rawPrediction: { symbol: 'BANKNIFTY', direction: 'BUY', entry: 51000.0, stop_loss: 51200.0, take_profit: 52000.0, outcome: 'Win' },
      finalSavedValues: { symbol: 'BANKNIFTY', direction: 'BUY', setup: 'Failed Trap', entry: 51000.0, sl: 51200.0, tp: 52000.0, outcome: 'Win' }, // SL above Entry on BUY
      userReviewed: true,
      editedFields: []
    }, { headers: AUTH_HEADER });

    const d = res.data?.data;
    if (d?.verificationStatus === 'INVALID' && d?.isTrainingReady === false && d?.inconsistencyFlags?.includes('BUY_SL_ABOVE_OR_EQUAL_ENTRY')) {
      console.log('✅ Test 3 PASSED: Inconsistent BUY trade (SL >= Entry) correctly marked INVALID and excluded from training');
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Inconsistent trade was not marked INVALID:', d);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 4: Inconsistent SELL trade (SL <= Entry) classified as INVALID ──
  try {
    const res = await axios.post(`${BASE_URL}/sample`, {
      tradeId: 'tr_qual_invalid_sell',
      market: 'crypto',
      rawPrediction: { symbol: 'BTCUSDT', direction: 'SELL', entry: 64000.0, stop_loss: 62000.0, take_profit: 60000.0, outcome: 'Win' },
      finalSavedValues: { symbol: 'BTCUSDT', direction: 'SELL', setup: 'Short Trap', entry: 64000.0, sl: 62000.0, tp: 60000.0, outcome: 'Win' }, // SL below Entry on SELL
      userReviewed: true,
      editedFields: []
    }, { headers: AUTH_HEADER });

    const d = res.data?.data;
    if (d?.verificationStatus === 'INVALID' && d?.isTrainingReady === false && d?.inconsistencyFlags?.includes('SELL_SL_BELOW_OR_EQUAL_ENTRY')) {
      console.log('✅ Test 4 PASSED: Inconsistent SELL trade (SL <= Entry) correctly marked INVALID and excluded from training');
      passed++;
    } else {
      console.error('❌ Test 4 FAILED: Inconsistent trade was not marked INVALID:', d);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 5: Analytics & Quality Stats Breakdown ─────────────────
  try {
    const res = await axios.get(`${BASE_URL}/stats`, { headers: AUTH_HEADER });
    const stats = res.data?.data;

    if (stats && stats.qualityBreakdown && stats.trainingReadySamples !== undefined) {
      console.log('✅ Test 5 PASSED: Quality metrics returned accurately:', {
        totalSamples: stats.totalSamples,
        trainingReadySamples: stats.trainingReadySamples,
        qualityBreakdown: stats.qualityBreakdown
      });
      passed++;
    } else {
      console.error('❌ Test 5 FAILED: Incomplete stats returned:', stats);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Training-Ready Filter on Dataset Export ──────────────
  try {
    const res = await axios.get(`${BASE_URL}/samples?training_ready=true`, { headers: AUTH_HEADER });
    const samples = res.data?.data?.samples || [];

    const hasInvalid = samples.some(s => s.verificationStatus === 'INVALID' || s.isTrainingReady === false);
    if (!hasInvalid && samples.length > 0) {
      console.log(`✅ Test 6 PASSED: Export query ?training_ready=true returned ${samples.length} valid samples, 0 invalid samples leaked`);
      passed++;
    } else {
      console.error('❌ Test 6 FAILED: Invalid samples leaked in training-ready export:', samples);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    failed++;
  }

  console.log(`\n📊 Quality Test Summary: ${passed} Passed, ${failed} Failed\n`);
}

runQualityTests();
