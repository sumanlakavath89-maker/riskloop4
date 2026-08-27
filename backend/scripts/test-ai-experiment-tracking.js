import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/journal/admin';
const ADMIN_HEADER = { 'x-user-id': 'admin_alice', 'x-user-role': 'admin', 'x-admin-key': 'riskloop-master-admin-key' };
const USER_HEADER = { 'x-user-id': 'trader_bob', 'x-user-role': 'user' };

async function runExperimentTrackingTests() {
  console.log('🧪 Starting Dataset Versioning & AI Experiment Tracking Test Suite...\n');

  let passed = 0;
  let failed = 0;
  let versionId = null;
  let baselineExpId = null;
  let superiorExpId = null;
  let inferiorExpId = null;

  // ── Test 1: Freeze Immutable Dataset Snapshot ────────────────────
  try {
    const res = await axios.post(`${BASE_URL}/ai-dataset/versions`, {
      versionTag: `v1.0.${Date.now().toString().slice(-4)}`,
      name: 'Production Supervised Baseline Snapshot',
      description: 'Gold-standard verified trading chart samples'
    }, { headers: ADMIN_HEADER });

    const v = res.data?.data;
    if (res.data?.success && v?.id && v?.datasetHash && v?.isFrozen) {
      versionId = v.id;
      console.log(`✅ Test 1 PASSED: Frozen immutable dataset version created (${v.versionTag}, SHA-256: ${v.datasetHash.substring(0, 16)}...) with ${v.trainingReadyCount} samples`);
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Invalid version response:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 2: Record Baseline Model Experiment ─────────────────────
  try {
    const res = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Baseline Vision OCR v1',
      datasetVersionId: versionId,
      modelArchitecture: 'Tesseract-Vision-Hybrid',
      overallAccuracyPct: 93.5,
      latencyMs: 380,
      isBaseline: true,
      fieldAccuracies: {
        symbol: 95.0,
        direction: 96.0,
        setup: 88.0,
        entry: 94.0,
        stop_loss: 93.0,
        take_profit: 92.5,
        outcome: 96.0
      },
      notes: 'Initial production baseline benchmark'
    }, { headers: ADMIN_HEADER });

    const exp = res.data?.data;
    if (res.data?.success && exp?.id && exp?.isBaseline) {
      baselineExpId = exp.id;
      console.log(`✅ Test 2 PASSED: Active baseline experiment recorded: ${exp.name} (${exp.overallAccuracyPct}% Acc)`);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Invalid baseline experiment response:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 3: Record Improved & Inferior Experiment Runs ───────────
  try {
    // 3a. Improved Experiment (96.8%)
    const resSuperior = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Gemini 1.5 Flash Supervised Fine-Tuning v1',
      datasetVersionId: versionId,
      modelArchitecture: 'Gemini-1.5-Flash-FT',
      overallAccuracyPct: 96.8,
      latencyMs: 275,
      isBaseline: false,
      fieldAccuracies: {
        symbol: 98.0,
        direction: 99.0,
        setup: 93.0,
        entry: 97.5,
        stop_loss: 96.0,
        take_profit: 95.5,
        outcome: 98.5
      },
      notes: 'Trained on v1 dataset snapshot'
    }, { headers: ADMIN_HEADER });

    superiorExpId = resSuperior.data?.data?.id;

    // 3b. Inferior Experiment (90.2%)
    const resInferior = await axios.post(`${BASE_URL}/ai-experiments`, {
      name: 'Legacy MobileNet Classifier',
      datasetVersionId: versionId,
      modelArchitecture: 'MobileNetV3',
      overallAccuracyPct: 90.2,
      latencyMs: 140,
      isBaseline: false,
      fieldAccuracies: {
        symbol: 91.0,
        direction: 92.0,
        setup: 82.0,
        entry: 89.0,
        stop_loss: 88.0,
        take_profit: 87.5,
        outcome: 92.0
      },
      notes: 'Lightweight model trial'
    }, { headers: ADMIN_HEADER });

    inferiorExpId = resInferior.data?.data?.id;

    if (superiorExpId && inferiorExpId) {
      console.log('✅ Test 3 PASSED: Multiple immutable experiment runs recorded successfully');
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Could not record experiment pair');
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 4: Candidate Promotion Rejected for Inferior Model ───────
  try {
    const res = await axios.post(`${BASE_URL}/ai-experiments/${inferiorExpId}/promote-candidate`, {}, { headers: ADMIN_HEADER });
    console.error('❌ Test 4 FAILED: Expected candidate promotion rejection for inferior model, received', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 400 && String(err.response?.data?.error).includes('does not outperform baseline')) {
      console.log('✅ Test 4 PASSED: Candidate promotion strictly rejected for under-performing model (Delta: -3.3%)');
      passed++;
    } else {
      console.error('❌ Test 4 FAILED: Unexpected error message:', err.response?.data);
      failed++;
    }
  }

  // ── Test 5: Candidate Promotion Allowed for Outperforming Model ───
  try {
    const res = await axios.post(`${BASE_URL}/ai-experiments/${superiorExpId}/promote-candidate`, {}, { headers: ADMIN_HEADER });
    const exp = res.data?.data;

    if (res.data?.success && exp?.isCandidate) {
      console.log(`✅ Test 5 PASSED: Outperforming model (${exp.overallAccuracyPct}% Acc, +3.3% Delta) successfully promoted to Candidate status`);
      passed++;
    } else {
      console.error('❌ Test 5 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 6: Promote Candidate to Active Production Baseline ───────
  try {
    const res = await axios.post(`${BASE_URL}/ai-experiments/${superiorExpId}/set-baseline`, {}, { headers: ADMIN_HEADER });
    const exp = res.data?.data;

    if (res.data?.success && exp?.isBaseline && !exp?.isCandidate) {
      console.log(`✅ Test 6 PASSED: Candidate model promoted to active baseline (Benchmark updated to ${exp.overallAccuracyPct}%)`);
      passed++;
    } else {
      console.error('❌ Test 6 FAILED:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 7: Verify Past Experiment Results Immutability ───────────
  try {
    const res = await axios.get(`${BASE_URL}/ai-experiments`, { headers: ADMIN_HEADER });
    const allExps = res.data?.data?.experiments || [];

    const baselineFound = allExps.find(e => e.id === baselineExpId);
    const superiorFound = allExps.find(e => e.id === superiorExpId);
    const inferiorFound = allExps.find(e => e.id === inferiorExpId);

    if (
      baselineFound && baselineFound.overallAccuracyPct === 93.5 &&
      superiorFound && superiorFound.overallAccuracyPct === 96.8 &&
      inferiorFound && inferiorFound.overallAccuracyPct === 90.2
    ) {
      console.log(`✅ Test 7 PASSED: All ${allExps.length} historical experiment records preserved without overwriting`);
      passed++;
    } else {
      console.error('❌ Test 7 FAILED: Historic experiment mutated:', allExps);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 7 FAILED:', err.response?.data || err.message);
    failed++;
  }

  // ── Test 8: Non-Admin Access Security Gate ───────────────────────
  try {
    const res = await axios.get(`${BASE_URL}/ai-dataset/versions`, { headers: USER_HEADER });
    console.error('❌ Test 8 FAILED: Non-admin accessed versions with status', res.status);
    failed++;
  } catch (err) {
    if (err.response?.status === 403) {
      console.log('✅ Test 8 PASSED: Non-admin access to dataset versioning and experiment routes strictly blocked (403 Forbidden)');
      passed++;
    } else {
      console.error('❌ Test 8 FAILED: Unexpected error status:', err.response?.status);
      failed++;
    }
  }

  console.log(`\n📊 AI Experiment Tracking Test Summary: ${passed} Passed, ${failed} Failed\n`);
}

runExperimentTrackingTests();
