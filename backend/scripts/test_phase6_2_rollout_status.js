/**
 * Phase 6.2 Step 3 Test Suite: Rollout Status Monitoring
 * 
 * Verifies:
 * Test 1: Scheduler false -> rolloutMode: 'disabled'
 * Test 2: Scheduler true + Live Ingestion false -> rolloutMode: 'discovery_only'
 * Test 3: Scheduler true + Live Ingestion true + Canary empty -> rolloutMode: 'safe_blocked'
 * Test 4: Scheduler true + Live Ingestion true + Canary 'CPI Inflation' -> rolloutMode: 'canary'
 * Test 5: Scheduler true + Live Ingestion true + Canary 'all' -> rolloutMode: 'full'
 * Test 6: Verify all 5 indicator permissions correctly computed
 * Test 7: Verify no secrets, credentials, or internal tokens exposed in response
 * Test 8: Production database integrity preserved with 0 mutations
 */

import axios from 'axios';
import { economicCalendarRolloutService, ROLLOUT_MODES } from '../src/services/EconomicCalendarRolloutService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

const API_BASE = 'http://localhost:3000';

async function runRolloutStatusTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 3: ROLLOUT STATUS MONITORING VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, extraInfo = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`   ✅ [PASS] ${name} ${extraInfo}`);
      return true;
    } else {
      console.error(`   ❌ [FAIL] ${name} ${extraInfo}`);
      return false;
    }
  }

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;

  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  // ── TEST 1: Scheduler False -> disabled ──────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: SCHEDULER DISABLED -> rolloutMode: "disabled"                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t1 = economicCalendarRolloutService.getRolloutStatus({
    overrideSchedulerEnabled: false,
    overrideLiveIngestion: true,
    overrideCanary: 'all'
  });
  assert('Scheduler disabled forces rolloutMode "disabled"', t1.rolloutMode === ROLLOUT_MODES.DISABLED);
  assert('CPI liveIngestionAllowed is false when scheduler is disabled', t1.indicatorPermissions['CPI Inflation']?.liveIngestionAllowed === false);

  // ── TEST 2: Scheduler True + Live Ingestion False -> discovery_only ──────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: SCHEDULER ENABLED + LIVE INGESTION DISABLED -> "discovery_only" │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t2 = economicCalendarRolloutService.getRolloutStatus({
    overrideSchedulerEnabled: true,
    overrideLiveIngestion: false,
    overrideCanary: 'all'
  });
  assert('Scheduler on + Live Ingestion off results in "discovery_only"', t2.rolloutMode === ROLLOUT_MODES.DISCOVERY_ONLY);
  assert('Discovery allowed across all indicators in discovery_only mode',
    Object.values(t2.indicatorPermissions).every(p => p.discoveryAllowed === true));
  assert('Live ingestion disallowed across all indicators in discovery_only mode',
    Object.values(t2.indicatorPermissions).every(p => p.liveIngestionAllowed === false));

  // ── TEST 3: Scheduler True + Live Ingestion True + Canary Empty ───────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: LIVE INGESTION ENABLED + EMPTY CANARY -> "safe_blocked"         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t3 = economicCalendarRolloutService.getRolloutStatus({
    overrideSchedulerEnabled: true,
    overrideLiveIngestion: true,
    overrideCanary: ''
  });
  assert('Empty canary list results in "safe_blocked" mode', t3.rolloutMode === ROLLOUT_MODES.SAFE_BLOCKED);
  assert('Live ingestion disallowed for all indicators under empty canary',
    Object.values(t3.indicatorPermissions).every(p => p.liveIngestionAllowed === false));

  // ── TEST 4: Scheduler True + Live Ingestion True + Canary Specific ────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: LIVE INGESTION ENABLED + CANARY "CPI Inflation" -> "canary"     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t4 = economicCalendarRolloutService.getRolloutStatus({
    overrideSchedulerEnabled: true,
    overrideLiveIngestion: true,
    overrideCanary: 'CPI Inflation'
  });
  assert('Specific canary list results in "canary" mode', t4.rolloutMode === ROLLOUT_MODES.CANARY);
  assert('CPI Inflation has liveIngestionAllowed: true', t4.indicatorPermissions['CPI Inflation']?.liveIngestionAllowed === true);
  assert('IIP has liveIngestionAllowed: false', t4.indicatorPermissions['IIP']?.liveIngestionAllowed === false);
  assert('WPI has liveIngestionAllowed: false', t4.indicatorPermissions['WPI Inflation']?.liveIngestionAllowed === false);

  // ── TEST 5: Scheduler True + Live Ingestion True + Canary "all" ───────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: LIVE INGESTION ENABLED + CANARY "all" -> "full"                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t5 = economicCalendarRolloutService.getRolloutStatus({
    overrideSchedulerEnabled: true,
    overrideLiveIngestion: true,
    overrideCanary: 'all'
  });
  assert('Canary "all" results in "full" rollout mode', t5.rolloutMode === ROLLOUT_MODES.FULL);
  assert('All 5 supported indicators have liveIngestionAllowed: true in full mode',
    Object.values(t5.indicatorPermissions).every(p => p.liveIngestionAllowed === true));

  // ── TEST 6: Verify All 5 Supported Indicators Structure ──────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: VERIFY ALL 5 SUPPORTED INDICATORS                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const expected5 = ['CPI Inflation', 'IIP', 'WPI Inflation', 'GDP', 'RBI Repo Rate'];
  const hasAll5 = expected5.every(i => t5.supportedIndicators.includes(i) && t5.indicatorPermissions[i]);
  assert('All 5 canonical macro indicators present in status report', hasAll5);

  // ── TEST 7: Admin Endpoint Security & Secret Sanitization ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: ADMIN ENDPOINT SECURITY & SECRET SANITIZATION                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const adminClient = axios.create({
    baseURL: `${API_BASE}/api/admin/economic-calendar`,
    headers: { 'x-user-role': 'admin' }
  });

  const apiRes = await adminClient.get('/rollout-status');
  assert('Admin GET /rollout-status returns HTTP 200 OK', apiRes.status === 200 && apiRes.data.success === true);
  assert('Default environment reflects "disabled" mode', apiRes.data.rolloutMode === 'disabled');

  const rawJson = JSON.stringify(apiRes.data);
  const leaksSecret = /supabase_service_role_key|secret|password|process\.pid/i.test(rawJson);
  assert('Response contains zero leaked keys, secrets, or internal IDs', !leaksSecret);

  // ── TEST 8: Production Database Zero-Mutation Verification ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PRODUCTION DATABASE INTEGRITY & ZERO-MUTATION VERIFICATION      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 ROLLOUT STATUS TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}"`);

  if (passed === total) {
    console.log('\n🎉 ALL ROLLOUT STATUS MONITORING TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runRolloutStatusTests().catch(console.error);
