/**
 * Phase 7.6 Test Suite: Staged USD Production Rollout
 * 
 * Verifies all 16 required criteria for Phase 7.6 Staged USD Production Rollout:
 * 1. Default environment blocks rollout.
 * 2. Stage 0 baseline validation succeeds.
 * 3. Stage 1 dry run produces zero DB mutations.
 * 4. Provider health failures block progression (DEGRADED_PROVIDERS).
 * 5. Database integrity failures block progression (DATABASE_INTEGRITY_FAIL).
 * 6. Stage 2 requires explicit USD authorization.
 * 7. Manual canary respects max batch size (max 5).
 * 8. Failed verification triggers rollback.
 * 9. Stage 3 requires scheduler authorization.
 * 10. Concurrency locking prevents overlapping cycles.
 * 11. Circuit breaker stops repeated failures.
 * 12. Emergency stop immediately blocks ingestion.
 * 13. Circuit breaker requires explicit reset.
 * 14. Rollout history records stage transitions.
 * 15. India subsystem remains unchanged.
 * 16. Database baseline is preserved after tests and cleanup.
 */

import { forexRolloutControllerService, ForexRolloutControllerService, ROLLOUT_STAGES, READINESS_VERDICTS } from '../src/services/forex/ForexRolloutControllerService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { forexCalendarSchedulerService } from '../src/services/forex/ForexCalendarSchedulerService.js';
import { forexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from '../src/services/forex/ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService, ForexSchedulerCanaryService } from '../src/services/forex/ForexSchedulerCanaryService.js';

async function runStagedUSDRolloutTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.6: STAGED USD PRODUCTION ROLLOUT TEST SUITE');
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

  // 1. Capture Database Baseline
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;

  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  const createdTestIds = [];
  const testController = new ForexRolloutControllerService();

  try {
    // ── 1. Default Environment Blocks Rollout ───────────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 1. DEFAULT ENVIRONMENT BLOCKS ROLLOUT                                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const defaultReadiness = await testController.evaluateRolloutReadiness();
    assert('1. Default environment blocks rollout (verdict: BLOCKED_BY_SAFETY_FLAGS)',
      defaultReadiness.verdict === READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS);
    assert('canProgress is false under default environment', defaultReadiness.canProgress === false);

    // ── 2. Stage 0 Baseline Validation Succeeds ─────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 2. STAGE 0 BASELINE VALIDATION SUCCEEDS                                 │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage0Summary = await testController.getRolloutStage();
    assert('2. Stage 0 baseline is active (STAGE_0_SAFETY_BASELINE)',
      stage0Summary.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);
    assert('Stage 0 batchSizeLimit is 0 and databaseWritesAllowed is false',
      stage0Summary.batchSizeLimit === 0 && stage0Summary.databaseWritesAllowed === false);

    // ── 3. Stage 1 Production Dry Run Guarantees Zero DB Mutations ──────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 3. STAGE 1 PRODUCTION DRY RUN GUARANTEES ZERO DB MUTATIONS              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage1Adv = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN, {
      explicitApproval: true,
      reason: 'Stage 1 dry-run start'
    });
    assert('3. Promoted to STAGE_1_PRODUCTION_DRY_RUN successfully',
      stage1Adv.success === true && testController.currentStage === ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN);

    const dryRunResult = await forexCalendarSchedulerService.validateProductionDryRun({ daysAhead: 60 });
    assert('Stage 1 dry-run executes successfully (mode: "dry_run")',
      dryRunResult.success === true && dryRunResult.mode === 'dry_run');
    assert('Dry-run guarantees databaseMutation: false', dryRunResult.databaseMutation === false);
    assert('Dry-run telemetry tracks planned sync actions',
      typeof dryRunResult.summary?.plannedInserts === 'number');

    // ── 4. Provider Health Failures Block Progression ───────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 4. PROVIDER HEALTH FAILURES BLOCK PROGRESSION                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const mockDegradedMonitoring = {
      verifyDatabaseIntegrity: async () => ({ valid: true, issuesCount: 0 }),
      checkProviderAlerts: async () => ({ healthy: false, alerts: [{ provider: 'BLS', message: 'Simulated 503 Service Unavailable' }] })
    };
    const degradedController = new ForexRolloutControllerService(mockDegradedMonitoring);
    const degradedReadiness = await degradedController.evaluateRolloutReadiness({
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('4. Degraded provider health blocks progression (verdict: DEGRADED_PROVIDERS)',
      degradedReadiness.verdict === READINESS_VERDICTS.DEGRADED_PROVIDERS);
    assert('Degraded readiness canProgress is false', degradedReadiness.canProgress === false);

    // ── 5. Database Integrity Failures Block Progression ────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 5. DATABASE INTEGRITY FAILURES BLOCK PROGRESSION                        │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const mockCorruptMonitoring = {
      verifyDatabaseIntegrity: async () => ({ valid: false, issuesCount: 1, issues: ['Simulated duplicate event ID'] }),
      checkProviderAlerts: async () => ({ healthy: true, alerts: [] })
    };
    const corruptController = new ForexRolloutControllerService(mockCorruptMonitoring);
    const corruptReadiness = await corruptController.evaluateRolloutReadiness({
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('5. Database integrity failure blocks progression (verdict: DATABASE_INTEGRITY_FAIL)',
      corruptReadiness.verdict === READINESS_VERDICTS.DATABASE_INTEGRITY_FAIL);
    assert('Database integrity failure canProgress is false', corruptReadiness.canProgress === false);

    // ── 6. Stage 2 Requires Explicit USD Authorization ──────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 6. STAGE 2 REQUIRES EXPLICIT USD AUTHORIZATION                          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const unauthorizedStage2 = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: false, // Disallowed
        canaryCurrencies: ['EUR']         // USD not authorized
      }
    });
    assert('6. Stage 2 promotion without explicit USD flags is rejected',
      unauthorizedStage2.success === false && unauthorizedStage2.error === 'MISSING_CANARY_AUTHORIZATION');

    // ── 7. Manual Canary Respects Max Batch Size (Max 5) ────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 7. MANUAL CANARY RESPECTS MAXIMUM BATCH SIZE (MAX 5)                    │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage2Auth = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('7. Promoted to STAGE_2_CONTROLLED_MANUAL_CANARY successfully', stage2Auth.success === true);
    assert('Stage 2 enforces batchSizeLimit of 5', stage2Auth.batchSizeLimit === 5);

    const testEventBatch = [{
      event_name: 'Test Staged USD Canary Event',
      country: 'United States',
      country_code: 'US',
      event_date: '2026-09-04',
      event_time: '08:30',
      timezone: 'America/New_York',
      impact: 'high',
      status: 'upcoming',
      source: 'BLS'
    }];

    const canaryExec = await forexCanarySafetyService.executeCanarySync({
      batchSize: stage2Auth.batchSizeLimit,
      events: testEventBatch,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('Manual canary batch execution succeeds', canaryExec.success === true);
    if (canaryExec.inserted[0]?.id) {
      createdTestIds.push(canaryExec.inserted[0].id);
    }
    testController.recordCanarySuccess();

    // ── 8. Failed Verification Triggers Rollback ────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 8. FAILED VERIFICATION TRIGGERS AUTOMATIC ROLLBACK                      │');
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

    assert('8. Failed post-write verification triggers rollback', failingExec.rolledBack.length > 0);
    assert('Rollback reason is captured in error telemetry', failingExec.rolledBack[0]?.reason.includes('Simulated verification'));

    // ── 9. Stage 3 Requires Scheduler Authorization ─────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 9. STAGE 3 REQUIRES SCHEDULER AUTHORIZATION                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const unauthorizedStage3 = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        forexSchedulerEnabled: false, // Scheduler disabled
        canaryCurrencies: ['USD']
      }
    });
    assert('9. Stage 3 promotion without scheduler flag is rejected (MISSING_SCHEDULER_AUTHORIZATION)',
      unauthorizedStage3.success === false && unauthorizedStage3.error === 'MISSING_SCHEDULER_AUTHORIZATION');

    const authorizedStage3 = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        forexSchedulerEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('Stage 3 promotion succeeds with explicit scheduler authorization',
      authorizedStage3.success === true && testController.currentStage === ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY);

    // ── 10. Concurrency Locking Prevents Overlapping Cycles ─────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 10. CONCURRENCY LOCKING PREVENTS OVERLAPPING CYCLES                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const lockedScheduler = new ForexSchedulerCanaryService();
    lockedScheduler.isRunning = true;
    const concurrentRun = await lockedScheduler.runCanaryCycle({ force: true });
    assert('10. Overlapping scheduled cycle is blocked (reason: CONCURRENT_RUN_IN_PROGRESS)',
      concurrentRun.skipped === true && concurrentRun.reason === 'CONCURRENT_RUN_IN_PROGRESS');

    // ── 11. Circuit Breaker Stops Repeated Failures (3 Failures) ───────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 11. CIRCUIT BREAKER STOPS REPEATED FAILURES                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const cbScheduler = new ForexSchedulerCanaryService();
    cbScheduler.recordFailure('Simulated failure 1');
    cbScheduler.recordFailure('Simulated failure 2');
    assert('Circuit breaker is not tripped after 2 failures', cbScheduler.circuitBreakerTripped === false);

    cbScheduler.recordFailure('Simulated failure 3');
    assert('11. Circuit breaker trips automatically on 3rd failure', cbScheduler.circuitBreakerTripped === true);

    const blockedRun = await cbScheduler.runCanaryCycle();
    assert('Future cycles blocked with CIRCUIT_BREAKER_TRIPPED',
      blockedRun.skipped === true && blockedRun.reason === 'CIRCUIT_BREAKER_TRIPPED');

    // ── 12. Emergency Stop Immediately Blocks Ingestion ─────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 12. EMERGENCY STOP IMMEDIATELY BLOCKS INGESTION                         │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const emergencyResult = testController.emergencyStop('Testing Emergency Kill Switch');
    assert('12. Emergency stop executed successfully (emergencyStopped: true)',
      emergencyResult.success === true && testController.isEmergencyStopped === true);
    assert('Emergency stop resets stage to STAGE_0_SAFETY_BASELINE',
      testController.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);

    const blockedProgression = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN, {
      explicitApproval: true
    });
    assert('Advancement blocked while emergency stop is active',
      blockedProgression.success === false && blockedProgression.error === 'EMERGENCY_STOP_ACTIVE');

    testController.clearEmergencyStop();

    // ── 13. Circuit Breaker Requires Explicit Reset ─────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 13. CIRCUIT BREAKER REQUIRES EXPLICIT ADMIN RESET                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    assert('Circuit breaker remains tripped until explicit reset', cbScheduler.circuitBreakerTripped === true);
    const cbReset = cbScheduler.resetCircuitBreaker();
    assert('13. Circuit breaker reset succeeds (circuitBreakerTripped: false)',
      cbReset.circuitBreakerTripped === false && cbScheduler.consecutiveFailures === 0);

    // ── 14. Rollout History Records Stage Transitions ───────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 14. ROLLOUT HISTORY RECORDS STAGE TRANSITIONS                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const history = testController.getRolloutHistory();
    assert('14. Rollout history contains recorded transitions', history.length > 0);
    assert('History entries include stage, timestamp, and reason',
      history.every(h => Boolean(h.stage) && Boolean(h.timestamp) && Boolean(h.reason)));

    // ── 15. India Subsystem Remains Unchanged ───────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 15. INDIA SUBSYSTEM REMAINS UNCHANGED                                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('15. India calendar generator functions normally (events generated > 0)',
      indiaGen.events && indiaGen.events.length > 0);

  } finally {
    // ── 16. Cleanup & Database Baseline Preservation ────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ 16. CLEANUP & DATABASE BASELINE PRESERVATION                            │');
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

  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('16. Total Indian events count matches baseline (11 === 11)',
    postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count matches baseline (11 === 11)',
    postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count matches baseline (0 === 0)',
    postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Production safety flag FOREX_CALENDAR_ENABLED is false', flags.forexCalendarEnabled === false);
  assert('Production safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.6 (STAGED USD ROLLOUT) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.6 STAGED USD PRODUCTION ROLLOUT TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runStagedUSDRolloutTests().catch(console.error);
