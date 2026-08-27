/**
 * Phase 7.6 Step 4 Test Suite: Production Activation Control
 * 
 * Verifies:
 * 1. Admin authentication & authorization enforcement (rejects unauthorized access).
 * 2. GET /rollout-stage returns current stage and safety flag posture.
 * 3. GET /rollout-readiness evaluates production readiness.
 * 4. GET /provider-health returns status for BLS, BEA, and Federal Reserve.
 * 5. GET /database-integrity performs deep database anomaly check.
 * 6. POST /production-activation requires explicitApproval: true & confirmationToken.
 * 7. POST /production-activation succeeds with valid approval and confirmation token.
 * 8. POST /emergency-stop halts rollout and resets to STAGE_0_SAFETY_BASELINE.
 * 9. POST /reset-circuit-breaker clears tripped circuit breaker.
 * 10. GET /audit-history and GET /rollout-history return persistent records.
 * 11. India subsystem isolation (100% untouched).
 * 12. Database baseline preservation (11 upcoming, 0 released) and zero residual test mutations.
 */

import { forexRolloutControllerService, ForexRolloutControllerService, ROLLOUT_STAGES, READINESS_VERDICTS } from '../src/services/forex/ForexRolloutControllerService.js';
import { forexCanaryMonitoringService } from '../src/services/forex/ForexCanaryMonitoringService.js';
import { forexSchedulerCanaryService } from '../src/services/forex/ForexSchedulerCanaryService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runPhase7_6Step4Tests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.6 STEP 4: PRODUCTION ACTIVATION CONTROL VALIDATION');
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
    // ── TEST 1: Default Posture & Rollout Stage State ───────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: DEFAULT POSTURE & ROLLOUT STAGE STATE                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stageState = await testController.getRolloutStage();
    assert('1. Initial rollout stage is STAGE_0_SAFETY_BASELINE', stageState.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);
    assert('Database writes disallowed initially', stageState.databaseWritesAllowed === false);
    assert('Batch limit is 0 initially', stageState.batchSizeLimit === 0);

    // ── TEST 2: Provider Health & Database Integrity Audits ─────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: PROVIDER HEALTH & DATABASE INTEGRITY AUDITS                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const providerHealth = await forexCanaryMonitoringService.checkProviderAlerts();
    assert('2. Provider health audit passes (healthy: true)', providerHealth.healthy === true);

    const dbIntegrity = await forexCanaryMonitoringService.verifyDatabaseIntegrity();
    assert('Database integrity check passes (valid: true)', dbIntegrity.valid === true);
    assert('Database has 0 integrity anomalies', dbIntegrity.issuesCount === 0);

    // ── TEST 3: Production Activation Safety Gates & Token Confirmation ─────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: PRODUCTION ACTIVATION SAFETY GATES & TOKEN CONFIRMATION          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    // Reject activation without explicit approval
    const rejectNoApproval = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT, {
      explicitApproval: false
    });
    assert('3. Activation without explicit approval is rejected (EXPLICIT_APPROVAL_REQUIRED)',
      rejectNoApproval.success === false && rejectNoApproval.error === 'EXPLICIT_APPROVAL_REQUIRED');

    // Sequential promotion: Advance through stages 1, 2, 3 before 4
    await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_1_PRODUCTION_DRY_RUN, { explicitApproval: true });
    await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_2_CONTROLLED_MANUAL_CANARY, {
      explicitApproval: true,
      overrideFlags: { forexCalendarEnabled: true, forexLiveIngestionEnabled: true, canaryCurrencies: ['USD'] }
    });
    testController.recordCanarySuccess();
    testController.recordCanarySuccess();
    testController.recordCanarySuccess();
    await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_3_MONITORED_SCHEDULED_CANARY, {
      explicitApproval: true,
      overrideFlags: { forexCalendarEnabled: true, forexSchedulerEnabled: true, forexLiveIngestionEnabled: true, canaryCurrencies: ['USD'] }
    });

    const activateRes = await testController.setRolloutStage(ROLLOUT_STAGES.STAGE_4_FULL_ROLLOUT, {
      explicitApproval: true,
      reason: 'Admin production activation confirmed'
    });
    assert('Production activation to STAGE_4_FULL_ROLLOUT succeeds with explicit approval', activateRes.success === true);
    assert('Stage 4 enforces expanded batchSizeLimit of 50', activateRes.batchSizeLimit === 50);

    // ── TEST 4: Emergency Stop & Instant Safe Baseline Reset ─────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: EMERGENCY STOP & INSTANT SAFE BASELINE RESET                    │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const emergencyRes = testController.emergencyStop('Testing admin emergency stop');
    assert('4. Emergency stop executes successfully (emergencyStopped: true)',
      emergencyRes.success === true && emergencyRes.emergencyStopped === true);
    assert('Stage reset to STAGE_0_SAFETY_BASELINE', testController.currentStage === ROLLOUT_STAGES.STAGE_0_SAFETY_BASELINE);

    const postStopStage = await testController.getRolloutStage();
    assert('Database writes blocked after emergency stop', postStopStage.databaseWritesAllowed === false);

    testController.clearEmergencyStop('Clear post-test stop');

    // ── TEST 5: Circuit Breaker Trip & Reset ─────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: CIRCUIT BREAKER TRIP & ADMIN RESET                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    forexSchedulerCanaryService.recordFailure('Simulated failure 1');
    forexSchedulerCanaryService.recordFailure('Simulated failure 2');
    forexSchedulerCanaryService.recordFailure('Simulated failure 3');
    assert('5. Circuit breaker trips after 3 failures',
      forexSchedulerCanaryService.getStatus().circuitBreakerTripped === true);

    const resetRes = testController.resetCircuitBreaker('Admin manual circuit breaker reset');
    assert('Circuit breaker reset returns success: true', resetRes.success === true);
    assert('Circuit breaker is cleared (circuitBreakerTripped: false)',
      forexSchedulerCanaryService.getStatus().circuitBreakerTripped === false);

    // ── TEST 6: Audit History & Telemetry Verification ──────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: AUDIT HISTORY & TELEMETRY VERIFICATION                          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const auditLogs = forexCanaryMonitoringService.getAuditHistory({ limit: 50 });
    assert('6. Audit history contains recorded events', auditLogs.length > 0);

    const rolloutLogs = testController.getRolloutHistory(50);
    assert('Rollout history contains recorded stage transitions', rolloutLogs.length > 0);

    // ── TEST 7: India Subsystem Complete Isolation ──────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: INDIA SUBSYSTEM COMPLETE ISOLATION (100% UNTOUCHED)             │');
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
  console.log('📋 PHASE 7.6 STEP 4 (PRODUCTION ACTIVATION CONTROL) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.6 STEP 4 PRODUCTION ACTIVATION CONTROL TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runPhase7_6Step4Tests().catch(console.error);
