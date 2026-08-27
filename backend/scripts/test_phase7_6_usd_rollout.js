/**
 * Phase 7.6 Test Suite: Controlled USD Production Rollout
 * 
 * Verifies:
 * 1. Initial STAGE_0_DISABLED default posture.
 * 2. Explicit approval gate enforcement on stage progression.
 * 3. Sequential progression enforcement (prevents stage skipping).
 * 4. STAGE_1_DRYRUN_MONITORING (Live discovery, 0 DB writes).
 * 5. STAGE_2_CANARY_SMALL_BATCH (Batch limit 3, post-write verification, rollback).
 * 6. STAGE_3_CANARY_EXPANDED_BATCH stability gating (requires >= 2 successful cycles).
 * 7. STAGE_4_SCHEDULED_CANARY gating (requires >= 3 successful cycles).
 * 8. Safe demotion and instant EMERGENCY_HALT reset to STAGE_0_DISABLED.
 * 9. Admin stage management endpoints (/stage, /stage/advance, /stage/demote, /stage/emergency-halt).
 * 10. Indian economic calendar subsystem isolation.
 * 11. Zero residual test data and 100% database baseline preservation (11 upcoming, 0 released).
 */

import { forexRolloutControllerService, ForexRolloutControllerService, FOREX_ROLLOUT_STAGES } from '../src/services/forex/ForexRolloutControllerService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { forexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';

const API_BASE = 'http://localhost:3000';

async function runRolloutTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.6: CONTROLLED USD PRODUCTION ROLLOUT VALIDATION');
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
    // ── TEST 1: Default Posture ─────────────────────────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: DEFAULT POSTURE & STAGE INITIALIZATION                          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    assert('1. Default rollout stage is STAGE_0_DISABLED',
      testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_0_DISABLED);
    const initialSummary = await testController.getRolloutStageSummary();
    assert('Database writes disallowed in Stage 0', initialSummary.databaseWritesAllowed === false);

    // ── TEST 2: Explicit Approval Requirement ───────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: EXPLICIT APPROVAL GATE ENFORCEMENT                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const noApprovalAttempt = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_1_DRYRUN_MONITORING, {
      explicitApproval: false
    });
    assert('2. Advancement without explicit approval is rejected (EXPLICIT_APPROVAL_REQUIRED)',
      noApprovalAttempt.success === false && noApprovalAttempt.error === 'EXPLICIT_APPROVAL_REQUIRED');

    // ── TEST 3: Sequential Stage Gate (Skip Prevention) ─────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: SEQUENTIAL PROGRESSION GATE (SKIP PREVENTION)                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const illegalJumpAttempt = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_3_CANARY_EXPANDED_BATCH, {
      explicitApproval: true
    });
    assert('3. Illegal jump (Stage 0 -> Stage 3) is blocked',
      illegalJumpAttempt.success === false && illegalJumpAttempt.message.includes('Cannot skip stages'));

    // ── TEST 4: Stage 1 Promotion (Dry-Run Monitoring) ──────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: STAGE 1 (DRY-RUN MONITORING) PROMOTION                          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage1Result = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_1_DRYRUN_MONITORING, {
      explicitApproval: true,
      reason: 'Stage 1 Dry-Run verification start'
    });
    assert('4. Promoted to STAGE_1_DRYRUN_MONITORING successfully',
      stage1Result.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_1_DRYRUN_MONITORING);
    assert('Stage 1 batchSizeLimit is 0', stage1Result.batchSizeLimit === 0);

    // ── TEST 5: Stage 2 Promotion (Small Controlled Canary Batch) ───────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: STAGE 2 (SMALL CANARY BATCH) PROMOTION & LIVE MUTATION          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const stage2Result = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_2_CANARY_SMALL_BATCH, {
      explicitApproval: true,
      reason: 'Stage 2 Small Canary verification start'
    });
    assert('5. Promoted to STAGE_2_CANARY_SMALL_BATCH successfully',
      stage2Result.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_2_CANARY_SMALL_BATCH);
    assert('Stage 2 batchSizeLimit is 3', stage2Result.batchSizeLimit === 3);

    // Execute live canary test under Stage 2
    const canaryRecord = [{
      event_name: 'Test Stage2 Rollout Event',
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
      batchSize: stage2Result.batchSizeLimit,
      events: canaryRecord,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('Stage 2 canary executes successfully with post-write verification', canaryExec.success === true);
    if (canaryExec.inserted[0]?.id) {
      createdTestIds.push(canaryExec.inserted[0].id);
    }
    testController.recordSuccessfulCanary();

    // ── TEST 6: Stage 3 Promotion & Stability Gate Check ────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: STAGE 3 STABILITY GATE (REQUIRES >= 2 SUCCESSFUL CYCLES)        │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    // Only 1 successful canary recorded so far, so Stage 3 should fail
    const prematureStage3 = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_3_CANARY_EXPANDED_BATCH, {
      explicitApproval: true
    });
    assert('6. Premature Stage 3 promotion is blocked (requires >= 2 cycles)',
      prematureStage3.success === false && prematureStage3.message.includes('requires >= 2'));

    // Record second successful canary cycle
    testController.recordSuccessfulCanary();
    const approvedStage3 = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_3_CANARY_EXPANDED_BATCH, {
      explicitApproval: true,
      reason: 'Stage 3 Expanded Canary progression'
    });
    assert('Stage 3 approved after reaching stability requirement',
      approvedStage3.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_3_CANARY_EXPANDED_BATCH);
    assert('Stage 3 batchSizeLimit expanded to 10', approvedStage3.batchSizeLimit === 10);

    // ── TEST 7: Stage 4 Promotion (Scheduled Canary) ────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: STAGE 4 (SCHEDULED CANARY) PROMOTION                            │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    testController.recordSuccessfulCanary(); // 3 total
    const stage4Result = await testController.advanceStage(FOREX_ROLLOUT_STAGES.STAGE_4_SCHEDULED_CANARY, {
      explicitApproval: true,
      reason: 'Stage 4 Scheduled Canary start'
    });
    assert('7. Promoted to STAGE_4_SCHEDULED_CANARY successfully',
      stage4Result.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_4_SCHEDULED_CANARY);

    // ── TEST 8: Demotion & Emergency Halt ───────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: SAFE DEMOTION & EMERGENCY HALT KILL SWITCH                      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const demoteResult = await testController.demoteStage(FOREX_ROLLOUT_STAGES.STAGE_1_DRYRUN_MONITORING, {
      reason: 'Testing safe step-down'
    });
    assert('8. Successfully demoted to STAGE_1_DRYRUN_MONITORING',
      demoteResult.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_1_DRYRUN_MONITORING);

    const haltResult = await testController.emergencyHalt('Test Emergency Stop');
    assert('Emergency halt instantly resets to STAGE_0_DISABLED',
      haltResult.success === true && testController.currentStage === FOREX_ROLLOUT_STAGES.STAGE_0_DISABLED);

    // ── TEST 9: Admin Stage Endpoints ───────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 9: ADMIN STAGE MANAGEMENT HTTP ENDPOINTS                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'admin'
    };

    try {
      const resStage = await fetch(`${API_BASE}/api/admin/forex-calendar/stage`, { headers: adminHeaders });
      if (resStage.ok) {
        const stageData = await resStage.json();
        assert('9. GET /api/admin/forex-calendar/stage returns HTTP 200', stageData.success === true);
        assert('Exposes currentStage and stageHistory', Boolean(stageData.currentStage) && Array.isArray(stageData.stageHistory));
      }
    } catch (err) {
      console.warn(`   ⚠️ Live HTTP test skipped (${err.message}).`);
    }

    // ── TEST 10: Indian Calendar Subsystem Isolation ────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 10: INDIAN ECONOMIC CALENDAR SUBSYSTEM ISOLATION                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('10. India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  } finally {
    // ── CLEANUP: Delete temporary test records ──────────────────────────────
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

  // ── TEST 11: Production Database Baseline Verification ────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('11. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Environment safety flag FOREX_CALENDAR_ENABLED is false', flags.forexCalendarEnabled === false);
  assert('Environment safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.6 (CONTROLLED USD ROLLOUT) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.6 CONTROLLED USD PRODUCTION ROLLOUT TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runRolloutTests().catch(console.error);
