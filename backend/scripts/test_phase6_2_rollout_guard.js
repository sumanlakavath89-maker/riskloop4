/**
 * Phase 6.2 Step 4 Test Suite: Rollout Guard & Emergency Rollback
 * 
 * Verifies:
 * TEST 1: Healthy environment passes rollout readiness checks.
 * TEST 2: Unhealthy database blocks rollout readiness.
 * TEST 3: Critical unresolved incident blocks rollout readiness.
 * TEST 4: Stale scheduler (> 30h SLA) blocks rollout readiness.
 * TEST 5: Unsupported indicator cannot activate.
 * TEST 6: Indicator outside canary list cannot activate.
 * TEST 7: Emergency rollback activates successfully.
 * TEST 8: Emergency rollback blocks simulated live ingestion (status: 'blocked', reason: 'EMERGENCY_ROLLBACK_ACTIVE').
 * TEST 9: Scheduler/discovery behavior remains available during rollback.
 * TEST 10: Rollback status API reports correct safe state.
 * TEST 11: Production database integrity verification (zero mutations, baseline 11 upcoming, 0 released).
 */

import axios from 'axios';
import { economicCalendarRolloutGuardService } from '../src/services/EconomicCalendarRolloutGuardService.js';
import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { calendarSchedulerService } from '../src/services/CalendarSchedulerService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

const API_BASE = 'http://localhost:3000';

async function runRolloutGuardTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 4: ROLLOUT GUARD & EMERGENCY ROLLBACK VALIDATION');
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

  const cpiEvent = baseline.find(e => e.event_name.includes('CPI')) || { event_date: '2026-09-14' };

  // Ensure emergency rollback is clean before starting
  economicCalendarRolloutGuardService.resetEmergencyRollback();

  // ── TEST 1: Healthy Environment Passes Readiness Checks ───────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: HEALTHY ENVIRONMENT PASSES ROLLOUT READINESS CHECKS             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const healthyRes = await economicCalendarRolloutGuardService.validateRolloutReadiness({
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideIncidents: [],
    overrideLock: { isLocked: false },
    overrideLatestRun: { started_at: new Date().toISOString() },
    overrideLiveIngestion: true,
    indicator: 'CPI Inflation',
    overrideCanaryList: 'CPI Inflation'
  });
  assert('Healthy environment reports readiness ready: true', healthyRes.ready === true && healthyRes.failures.length === 0);

  // ── TEST 2: Unhealthy Database Blocks Readiness ───────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: UNHEALTHY DATABASE BLOCKS ROLLOUT READINESS                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dbFailRes = await economicCalendarRolloutGuardService.validateRolloutReadiness({
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'unhealthy',
    overrideIncidents: [],
    overrideLiveIngestion: true
  });
  assert('Database connection failure blocks rollout readiness',
    dbFailRes.ready === false && dbFailRes.failures.some(f => f.id === 'database_health'));

  // ── TEST 3: Critical Unresolved Incident Blocks Readiness ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: CRITICAL UNRESOLVED INCIDENT BLOCKS ROLLOUT READINESS            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const incidentFailRes = await economicCalendarRolloutGuardService.validateRolloutReadiness({
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideIncidents: [{ id: 'inc-1', severity: 'critical', status: 'open', title: 'Feed source failure' }],
    overrideLiveIngestion: true
  });
  assert('Open critical incident blocks rollout readiness',
    incidentFailRes.ready === false && incidentFailRes.failures.some(f => f.id === 'unresolved_incidents'));

  // ── TEST 4: Stale Scheduler Blocks Readiness ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: STALE SCHEDULER (> 30h SLA) BLOCKS ROLLOUT READINESS             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const staleDate = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const staleRes = await economicCalendarRolloutGuardService.validateRolloutReadiness({
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideIncidents: [],
    overrideLatestRun: { started_at: staleDate },
    overrideLiveIngestion: true
  });
  assert('Scheduler run older than 30h SLA blocks rollout readiness',
    staleRes.ready === false && staleRes.failures.some(f => f.id === 'freshness_sla'));

  // ── TEST 5: Unsupported Indicator Cannot Activate ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: UNSUPPORTED INDICATOR CANNOT ACTIVATE                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const unsupportedRes = await economicCalendarRolloutGuardService.canActivateCanary(
    'NonExistent Metric Indicator',
    {
      overrideHealth: { status: 'healthy' },
      overrideDbStatus: 'healthy',
      overrideIncidents: [],
      overrideLiveIngestion: true,
      overrideCanaryList: 'all'
    }
  );
  assert('Unsupported indicator activation is rejected',
    unsupportedRes.canActivate === false && unsupportedRes.failures.some(f => f.id === 'canonical_indicator'));

  // ── TEST 6: Indicator Outside Canary List Cannot Activate ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: INDICATOR OUTSIDE CANARY LIST CANNOT ACTIVATE                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const nonCanaryRes = await economicCalendarRolloutGuardService.canActivateCanary(
    'IIP',
    {
      overrideHealth: { status: 'healthy' },
      overrideDbStatus: 'healthy',
      overrideIncidents: [],
      overrideLiveIngestion: true,
      overrideCanaryList: 'CPI Inflation' // IIP not present
    }
  );
  assert('Indicator outside canary list is rejected',
    nonCanaryRes.canActivate === false && nonCanaryRes.failures.some(f => f.id === 'canary_whitelist'));

  // ── TEST 7: Emergency Rollback Activates Successfully ─────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: EMERGENCY ROLLBACK ACTIVATION                                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const rollbackTrigger = economicCalendarRolloutGuardService.triggerEmergencyRollback(
    'Test simulated operational hazard',
    { user: 'lead-sre@riskloop.io' }
  );
  assert('Emergency rollback marked active in memory', rollbackTrigger.active === true);
  assert('Rollback reason and actor recorded accurately',
    rollbackTrigger.reason === 'Test simulated operational hazard' && rollbackTrigger.activatedBy === 'lead-sre@riskloop.io');
  assert('economicCalendarRolloutGuardService reports active', economicCalendarRolloutGuardService.isEmergencyRollbackActive() === true);

  // ── TEST 8: Emergency Rollback Blocks Simulated Live Ingestion ───────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: EMERGENCY ROLLBACK BLOCKS LIVE DATABASE INGESTION               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blockedIngestRes = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=777',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true, // Even when live ingestion is explicitly true!
      overrideCanaryIndicators: 'all', // Even when canary is all!
      allowFutureRelease: true
    }
  );
  assert('Emergency rollback override blocks database mutation with Priority 1',
    blockedIngestRes.status === 'blocked' && blockedIngestRes.reason === 'EMERGENCY_ROLLBACK_ACTIVE');

  // ── TEST 9: Scheduler / Discovery Behavior Remains Available ──────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: SCHEDULER & DISCOVERY OPERATE NORMALLY DURING ROLLBACK          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRunCycle = await calendarSchedulerService.runSchedulerCycle({ dryRun: true, isManual: true });
  assert('Scheduler cycle executes cleanly during rollback without crashing', dryRunCycle.success === true);

  // ── TEST 10: Rollback Status & Admin API Endpoints ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: ADMIN API ENDPOINTS (READINESS & ROLLBACK STATUS)              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const adminClient = axios.create({
    baseURL: `${API_BASE}/api/admin/economic-calendar`,
    headers: { 'x-user-role': 'admin' }
  });

  // Activate rollback via HTTP API
  const apiTrigger = await adminClient.post('/emergency-rollback', {
    reason: 'Admin API integration test rollback'
  });
  assert('POST /emergency-rollback returns HTTP 200 OK and activates',
    apiTrigger.status === 200 && apiTrigger.data.active === true);

  const apiStatus = await adminClient.get('/rollback-status');
  assert('GET /rollback-status reports active: true', apiStatus.status === 200 && apiStatus.data.active === true);
  assert('databaseWritesBlocked is reported true by API', apiStatus.data.databaseWritesBlocked === true);

  const apiReadiness = await adminClient.get('/rollout-readiness?indicator=CPI%20Inflation');
  assert('GET /rollout-readiness returns HTTP 200 OK', apiReadiness.status === 200 && apiReadiness.data.success === true);
  assert('Readiness correctly reports ready: false because rollback is active',
    apiReadiness.data.ready === false && apiReadiness.data.failures.some(f => f.id === 'emergency_rollback'));

  // Reset rollback via admin endpoint
  const resetRes = await adminClient.post('/emergency-rollback/reset');
  assert('POST /emergency-rollback/reset successfully clears rollback state',
    resetRes.status === 200 && resetRes.data.active === false);

  const apiStatusAfterReset = await adminClient.get('/rollback-status');
  assert('GET /rollback-status reports active: false after reset',
    apiStatusAfterReset.status === 200 && apiStatusAfterReset.data.active === false);

  // ── TEST 11: Production Database Integrity & Zero Mutations ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: PRODUCTION DATABASE INTEGRITY & ZERO-MUTATION VERIFICATION     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 ROLLOUT GUARD TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}"`);

  if (passed === total) {
    console.log('\n🎉 ALL ROLLOUT GUARD & EMERGENCY ROLLBACK TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runRolloutGuardTests().catch(console.error);
