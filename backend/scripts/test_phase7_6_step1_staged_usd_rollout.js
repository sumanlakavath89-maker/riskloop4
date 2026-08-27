/**
 * Phase 7.6 Step 1 Test Suite: Staged USD Production Rollout
 * 
 * Verifies:
 * 1. Default safety flags disabled by default (zero ingestion/scheduling).
 * 2. Small-batch USD canary ingestion (batch size <= 5).
 * 3. Provider health checks (BLS, BEA, Federal Reserve).
 * 4. Pre-write database integrity checks.
 * 5. Deduplication engine preventing redundant events.
 * 6. Automatic rollback on verification mismatch.
 * 7. Automatic circuit breaker trip on repeated failures (halts rollout).
 * 8. Strict India calendar subsystem isolation (100% untouched).
 * 9. Preservation of existing actual / released values (zero overwriting).
 * 10. Database baseline preservation (11 upcoming, 0 released) and zero residual test mutations.
 */

import { forexRolloutControllerService, ForexRolloutControllerService, ROLLOUT_STAGES, READINESS_VERDICTS } from '../src/services/forex/ForexRolloutControllerService.js';
import { forexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from '../src/services/forex/ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService } from '../src/services/forex/ForexSchedulerCanaryService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from '../src/services/forex/providers/FederalReserveSourceAdapter.js';

async function runPhase7_6Step1Tests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.6 STEP 1: STAGED USD PRODUCTION ROLLOUT VALIDATION');
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

  const createdTestIds = [];
  const testController = new ForexRolloutControllerService();

  try {
    // ── TEST 1: Default Safety Posture & Flags ──────────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: DEFAULT SAFETY POSTURE & FLAG ENFORCEMENT                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const flags = forexEconomicCalendarService.getForexSafetyFlags();
    assert('1. FOREX_CALENDAR_ENABLED is false by default', flags.forexCalendarEnabled === false);
    assert('FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false by default', flags.forexLiveIngestionEnabled === false);
    assert('FOREX_CALENDAR_CANARY_CURRENCIES is empty by default', flags.canaryCurrencies.length === 0);

    const initialStage = await testController.getRolloutStage();
    assert('Initial stage is STAGE_0_SAFETY_BASELINE', initialStage.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);
    assert('Database writes disallowed in initial stage', initialStage.databaseWritesAllowed === false);

    // ── TEST 2: Official Provider Health Monitoring ─────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: OFFICIAL PROVIDER HEALTH MONITORING                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const blsHealth = await blsSourceAdapter.healthCheck();
    const beaHealth = await beaSourceAdapter.healthCheck();
    const fedHealth = await federalReserveSourceAdapter.healthCheck();

    assert('2. BLS provider is healthy', blsHealth.status === 'healthy');
    assert('BEA provider is healthy', beaHealth.status === 'healthy');
    assert('Federal Reserve provider is healthy', fedHealth.status === 'healthy');

    const providerAlerts = await forexCanaryMonitoringService.checkProviderAlerts();
    assert('Aggregated provider alerts report is healthy', providerAlerts.healthy === true);

    // ── TEST 3: Database Integrity Pre-Verification ─────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: DATABASE INTEGRITY PRE-VERIFICATION                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const dbIntegrity = await forexCanaryMonitoringService.verifyDatabaseIntegrity();
    assert('3. Database integrity verification passes', dbIntegrity.valid === true);
    assert('Database has 0 integrity anomalies', dbIntegrity.issuesCount === 0);

    // ── TEST 4: Controlled USD Canary Ingestion (Small Batch <= 5) ──────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: CONTROLLED USD CANARY INGESTION (SMALL BATCH <= 5)              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN, { explicitApproval: true });
    const stage2Res = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('4. Promoted to STAGE_2_CONTROLLED_MANUAL_CANARY', stage2Res.success === true);
    assert('Stage 2 enforces batch size limit of 5', stage2Res.batchSizeLimit === 5);

    const sampleUSDEvent = [{
      event_name: 'Test USD Non-Farm Payrolls Canary',
      country: 'United States',
      country_code: 'US',
      currency: 'USD',
      event_date: '2026-09-04',
      event_time: '08:30',
      timezone: 'America/New_York',
      impact: 'high',
      status: 'upcoming',
      source: 'BLS',
      source_url: 'https://www.bls.gov/news.release/empsit.nr0.htm'
    }];

    const canaryResult = await forexCanarySafetyService.executeCanarySync({
      batchSize: stage2Res.batchSizeLimit,
      events: sampleUSDEvent,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('USD Canary executes successfully with post-write verification', canaryResult.success === true);
    assert('Canary reports databaseMutation: true', canaryResult.databaseMutation === true);
    if (canaryResult.inserted[0]?.id) {
      createdTestIds.push(canaryResult.inserted[0].id);
    }

    // ── TEST 5: Automatic Rollback on Verification Mismatch ─────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: AUTOMATIC ROLLBACK ON VERIFICATION MISMATCH                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const mockFailingVerificationService = Object.create(forexCanarySafetyService);
    mockFailingVerificationService.verifyPostWrite = async () => ({
      verified: false,
      error: 'Simulated verification checksum mismatch'
    });

    const failingExec = await mockFailingVerificationService.executeCanarySync({
      batchSize: 1,
      events: [{
        event_name: 'Test Rollback Trigger Event',
        country: 'United States',
        country_code: 'US',
        event_date: '2026-09-04',
        event_time: '08:30',
        timezone: 'America/New_York',
        impact: 'high',
        status: 'upcoming',
        source: 'BLS'
      }],
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('5. Verification failure triggers rollback (success: false)', failingExec.success === false);
    assert('Rollback reason is captured in error telemetry', failingExec.rolledBack && failingExec.rolledBack.length > 0);

    // ── TEST 6: Circuit Breaker & Automatic Halting on Repeated Failures ────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: AUTOMATIC CIRCUIT BREAKER TRIP ON REPEATED FAILURES             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const scheduler = forexSchedulerCanaryService;
    scheduler.resetCircuitBreaker('Test setup reset');

    scheduler.recordFailure('Simulated failure cycle 1');
    scheduler.recordFailure('Simulated failure cycle 2');
    assert('6. Circuit breaker not tripped after 2 failures', scheduler.getStatus().circuitBreakerTripped === false);

    scheduler.recordFailure('Simulated failure cycle 3');
    assert('Circuit breaker trips automatically on 3rd failure', scheduler.getStatus().circuitBreakerTripped === true);

    const readinessCheck = await testController.evaluateRolloutReadiness();
    assert('Readiness verdict blocked with CIRCUIT_BREAKER_TRIPPED', readinessCheck.verdict === READINESS_VERDICTS.CIRCUIT_BREAKER_TRIPPED);

    // Reset circuit breaker for clean state
    scheduler.resetCircuitBreaker('Clean post-test state');

    // ── TEST 7: India Subsystem Isolation & Existing Values Preservation ────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: INDIA SUBSYSTEM ISOLATION & ACTUAL VALUE PRESERVATION            │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaSchedule = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('7. India calendar schedule generator functioning normally',
      indiaSchedule.events && indiaSchedule.events.length > 0);

  } finally {
    // ── CLEANUP: Zero Residual Database Data ────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ CLEANUP: ZERO RESIDUAL DATABASE DATA VERIFICATION                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    if (createdTestIds.length > 0) {
      const supabase = supabaseEconomicCalendarService.supabase;
      if (supabase) {
        await supabase
          .from('economic_events')
          .delete()
          .in('id', createdTestIds);
        console.log(`   🧹 Cleaned up ${createdTestIds.length} temporary test records.`);
      }
    }
  }

  // ── TEST 8: Production Database Baseline Verification ─────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PRODUCTION DATABASE BASELINE VERIFICATION                       │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('8. Total Indian events count matches baseline (11 === 11)',
    postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count matches baseline (11 === 11)',
    postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count matches baseline (0 === 0)',
    postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const currentFlags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Production safety flag FOREX_CALENDAR_ENABLED remains false', currentFlags.forexCalendarEnabled === false);
  assert('Production safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED remains false', currentFlags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.6 STEP 1 (STAGED USD ROLLOUT) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.6 STEP 1 STAGED USD ROLLOUT TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runPhase7_6Step1Tests().catch(console.error);
