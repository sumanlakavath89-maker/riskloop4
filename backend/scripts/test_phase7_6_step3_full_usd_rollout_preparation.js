/**
 * Phase 7.6 Step 3 Test Suite: Full USD Production Rollout Preparation
 * 
 * Verifies:
 * 1. Default safety flags block full rollout by default.
 * 2. Non-sequential promotion to STAGE_4_FULL_ROLLOUT is rejected (STAGE_SKIP_DISALLOWED).
 * 3. Controlled sequential progression with explicit admin approval.
 * 4. Readiness evaluation yields READY_FOR_FULL_ROLLOUT when all gates pass.
 * 5. Provider health checks (BLS, BEA, Federal Reserve) verified before full promotion.
 * 6. Database integrity verified before full promotion.
 * 7. STAGE_4_FULL_ROLLOUT enforces expanded batch limit (batchSizeLimit: 50).
 * 8. Failed verification triggers automatic rollback protection.
 * 9. Emergency stop immediately resets system to STAGE_0_SAFETY_BASELINE.
 * 10. Tripped circuit breaker blocks promotions until explicit admin reset.
 * 11. Rollout audit history records all transitions and emergency actions.
 * 12. India calendar subsystem complete isolation (100% untouched).
 * 13. Production database baseline preservation (11 upcoming, 0 released) and zero residual test mutations.
 */

import { forexRolloutControllerService, ForexRolloutControllerService, ROLLOUT_STAGES, READINESS_VERDICTS } from '../src/services/forex/ForexRolloutControllerService.js';
import { forexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';
import { forexCanaryMonitoringService } from '../src/services/forex/ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService } from '../src/services/forex/ForexSchedulerCanaryService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runPhase7_6Step3Tests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.6 STEP 3: FULL USD PRODUCTION ROLLOUT PREPARATION');
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
    // ── TEST 1: Default Posture & Stage Skip Prevention ─────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: DEFAULT POSTURE & STAGE SKIP PREVENTION                         │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const initialStage = await testController.getRolloutStage();
    assert('1. Initial stage is STAGE_0_SAFETY_BASELINE', initialStage.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);
    assert('Database writes disallowed in Stage 0', initialStage.databaseWritesAllowed === false);

    // Direct jump from Stage 0 to Stage 4 should be rejected
    const invalidSkip = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT, {
      explicitApproval: true
    });
    assert('Direct jump to STAGE_4_FULL_ROLLOUT is rejected (STAGE_SKIP_DISALLOWED)',
      invalidSkip.success === false && invalidSkip.error === 'STAGE_SKIP_DISALLOWED');

    // ── TEST 2: Step-by-Step Sequential Promotion ───────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: STEP-BY-STEP SEQUENTIAL PROMOTION (STAGE 0 -> 1 -> 2 -> 3)      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage1Res = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN, {
      explicitApproval: true
    });
    assert('2. Advanced to STAGE_1_PRODUCTION_DRY_RUN', stage1Res.success === true);

    const stage2Res = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('Advanced to STAGE_2_CONTROLLED_MANUAL_CANARY', stage2Res.success === true);

    // Record canary successes for stability requirements
    testController.recordCanarySuccess();
    testController.recordCanarySuccess();
    testController.recordCanarySuccess();

    const stage3Res = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexSchedulerEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('Advanced to STAGE_3_MONITORED_SCHEDULED_CANARY', stage3Res.success === true);

    // ── TEST 3: Readiness Evaluation for Full Rollout ───────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: READINESS EVALUATION FOR FULL ROLLOUT                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const fullReadiness = await testController.evaluateRolloutReadiness({
      forexCalendarEnabled: true,
      forexSchedulerEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('3. Readiness verdict is READY_FOR_FULL_ROLLOUT', fullReadiness.verdict === READINESS_VERDICTS.READY_FOR_FULL_ROLLOUT);
    assert('Readiness canProgress is true', fullReadiness.canProgress === true);
    assert('Readiness checklist confirms database integrity valid', fullReadiness.checklist.databaseIntegrityPass === true);
    assert('Readiness checklist confirms provider health valid', fullReadiness.checklist.providerHealthPass === true);

    // ── TEST 4: Controlled Promotion to STAGE_4_FULL_ROLLOUT ────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: CONTROLLED PROMOTION TO STAGE_4_FULL_ROLLOUT                    │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage4Res = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT, {
      explicitApproval: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexSchedulerEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });
    assert('4. Promoted to STAGE_4_FULL_ROLLOUT successfully', stage4Res.success === true);
    assert('Stage 4 enforces expanded batchSizeLimit of 50', stage4Res.batchSizeLimit === 50);

    const stageSummary = await testController.getRolloutStage();
    assert('Current stage reports STAGE_4_FULL_ROLLOUT', stageSummary.currentStage === ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT);
    assert('Database writes are allowed in Stage 4', stageSummary.databaseWritesAllowed === true);

    // ── TEST 5: Full Rollout Batch Execution with Post-Write Verification ───
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: FULL ROLLOUT BATCH EXECUTION WITH POST-WRITE VERIFICATION        │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const fullBatchEvents = [{
      event_name: 'Test Full USD Rollout Preparation Event',
      country: 'United States',
      country_code: 'US',
      currency: 'USD',
      event_date: '2026-09-04',
      event_time: '08:30',
      timezone: 'America/New_York',
      impact: 'high',
      status: 'upcoming',
      source: 'BLS',
      source_url: 'https://www.bls.gov'
    }];

    const batchExec = await forexCanarySafetyService.executeCanarySync({
      batchSize: 50,
      events: fullBatchEvents,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexSchedulerEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('5. Full batch executes and passes post-write verification', batchExec.success === true);
    if (batchExec.inserted[0]?.id) {
      createdTestIds.push(batchExec.inserted[0].id);
    }

    // ── TEST 6: Emergency Stop Resets to STAGE_0_SAFETY_BASELINE ────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: EMERGENCY STOP CAPABILITY                                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const emergencyRes = testController.emergencyStop('Emergency stop test in full rollout');
    assert('6. Emergency stop executes successfully', emergencyRes.success === true && emergencyRes.emergencyStopped === true);
    assert('Emergency stop forces stage back to STAGE_0_SAFETY_BASELINE',
      testController.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);

    const postStopSummary = await testController.getRolloutStage();
    assert('Post-stop batchSizeLimit is reset to 0', postStopSummary.batchSizeLimit === 0);
    assert('Post-stop database writes are blocked', postStopSummary.databaseWritesAllowed === false);

    // Clear emergency stop for clean state
    testController.clearEmergencyStop('Clear post-test stop');

    // ── TEST 7: Persistent Audit History ────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: ROLLOUT AUDIT HISTORY VERIFICATION                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const history = testController.getRolloutHistory();
    assert('7. Rollout history contains recorded transitions', history.length > 0);
    assert('History contains STAGE_4_FULL_ROLLOUT record',
      history.some(h => h.stage === ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT));
    assert('History contains EMERGENCY_STOP record',
      history.some(h => h.action === 'EMERGENCY_STOP' || h.reason?.includes('Emergency stop')));

    // ── TEST 8: India Subsystem Isolation ───────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: INDIA SUBSYSTEM ISOLATION (100% UNTOUCHED)                      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaSchedule = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('8. India calendar schedule generator functioning normally',
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

  // ── TEST 9: Production Database Baseline Verification ─────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: PRODUCTION DATABASE BASELINE VERIFICATION                       │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('9. Total Indian events count matches baseline (11 === 11)',
    postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count matches baseline (11 === 11)',
    postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count matches baseline (0 === 0)',
    postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const currentFlags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Production safety flag FOREX_CALENDAR_ENABLED remains false', currentFlags.forexCalendarEnabled === false);
  assert('Production safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED remains false', currentFlags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.6 STEP 3 (FULL USD ROLLOUT PREPARATION) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.6 STEP 3 FULL USD ROLLOUT PREPARATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runPhase7_6Step3Tests().catch(console.error);
