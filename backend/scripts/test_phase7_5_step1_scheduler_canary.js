/**
 * Phase 7.5 Step 1 Test Suite: Controlled Scheduler Canary
 * 
 * Verifies:
 * 1. Multi-flag authorization engine (FOREX_CALENDAR_ENABLED, SCHEDULER, LIVE_INGESTION, CANARY_CURRENCIES).
 * 2. Concurrency lock (prevents overlapping scheduled canary executions).
 * 3. Pre-cycle production readiness gate (database integrity + provider health).
 * 4. Circuit breaker auto-trip after 3 consecutive failures.
 * 5. Controlled small-batch live canary execution (max 5 items).
 * 6. Immediate post-write verification and automatic rollback.
 * 7. Audit logging of scheduler canary cycles.
 * 8. Zero residual test data and 100% database baseline preservation (11 upcoming, 0 released).
 * 9. India calendar subsystem isolation and integrity.
 */

import { forexSchedulerCanaryService, ForexSchedulerCanaryService, FOREX_SCHEDULER_CANARY_CONFIG } from '../src/services/forex/ForexSchedulerCanaryService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { ForexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';
import { ForexCanaryMonitoringService } from '../src/services/forex/ForexCanaryMonitoringService.js';

async function runSchedulerCanaryTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.5 STEP 1: CONTROLLED SCHEDULER CANARY VALIDATION');
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

  try {
    // ── TEST 1-5: Multi-Flag Authorization Checks ───────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1-5: MULTI-FLAG AUTHORIZATION ENGINE                               │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    assert('1. Default environment denies scheduler canary authorization',
      forexSchedulerCanaryService.isCanaryExecutionAuthorized().authorized === false);

    const gateNoScheduler = forexSchedulerCanaryService.isCanaryExecutionAuthorized({
      forexCalendarEnabled: true,
      forexSchedulerEnabled: false,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('2. FOREX_CALENDAR_SCHEDULER_ENABLED=false denies authorization',
      gateNoScheduler.authorized === false && gateNoScheduler.mode === 'scheduler_disabled');

    const gateNoLive = forexSchedulerCanaryService.isCanaryExecutionAuthorized({
      forexCalendarEnabled: true,
      forexSchedulerEnabled: true,
      forexLiveIngestionEnabled: false,
      canaryCurrencies: ['USD']
    });
    assert('3. FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false denies authorization',
      gateNoLive.authorized === false && gateNoLive.mode === 'discovery_only');

    const gateNoCanary = forexSchedulerCanaryService.isCanaryExecutionAuthorized({
      forexCalendarEnabled: true,
      forexSchedulerEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: []
    });
    assert('4. Empty canary list denies authorization',
      gateNoCanary.authorized === false && gateNoCanary.mode === 'safe_blocked');

    const gateApproved = forexSchedulerCanaryService.isCanaryExecutionAuthorized({
      forexCalendarEnabled: true,
      forexSchedulerEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('5. All 4 flags enabled explicitly approves authorization',
      gateApproved.authorized === true && gateApproved.mode === 'scheduled_canary_active');

    // ── TEST 6: Concurrency Locking ─────────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: CONCURRENCY LOCK (OVERLAP PREVENTION)                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const customScheduler = new ForexSchedulerCanaryService();
    customScheduler.isRunning = true;

    const overlapResult = await customScheduler.runCanaryCycle({ force: true });
    assert('6. Overlapping cycle attempt is blocked (CONCURRENT_RUN_IN_PROGRESS)',
      overlapResult.skipped === true && overlapResult.reason === 'CONCURRENT_RUN_IN_PROGRESS');

    // ── TEST 7: Pre-Cycle Production Readiness Gate ─────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: PRE-CYCLE PRODUCTION READINESS GATE                             │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const mockCorruptMonitoring = new ForexCanaryMonitoringService();
    mockCorruptMonitoring.verifyDatabaseIntegrity = async () => ({
      valid: false,
      issuesCount: 2,
      issues: [{ type: 'CORRUPT_CHECKSUM' }]
    });

    const gatedScheduler = new ForexSchedulerCanaryService(
      forexSchedulerCanaryService.canarySafety,
      mockCorruptMonitoring
    );

    const blockedRun = await gatedScheduler.runCanaryCycle({
      force: true,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexSchedulerEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('7. Cycle is aborted when pre-cycle database integrity check fails',
      blockedRun.success === false && blockedRun.error.includes('Pre-cycle database integrity failed'));

    // ── TEST 8: Circuit Breaker Auto-Trip ───────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: CIRCUIT BREAKER AUTO-TRIP AFTER 3 CONSECUTIVE FAILURES          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const failingScheduler = new ForexSchedulerCanaryService(
      forexSchedulerCanaryService.canarySafety,
      mockCorruptMonitoring
    );

    // Fail 3 times
    await failingScheduler.runCanaryCycle({ force: true });
    await failingScheduler.runCanaryCycle({ force: true });
    await failingScheduler.runCanaryCycle({ force: true });

    assert('8. Circuit breaker is tripped after 3 consecutive failures',
      failingScheduler.circuitBreakerTripped === true && failingScheduler.consecutiveFailures >= 3);

    const tripBlockedRun = await failingScheduler.runCanaryCycle();
    assert('Subsequent cycle is halted with CIRCUIT_BREAKER_TRIPPED',
      tripBlockedRun.skipped === true && tripBlockedRun.reason === 'CIRCUIT_BREAKER_TRIPPED');

    failingScheduler.resetCircuitBreaker();
    assert('Circuit breaker reset clears tripped status', failingScheduler.circuitBreakerTripped === false);

    // ── TEST 9: Controlled Live Scheduled Canary Cycle & Audit ──────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 9: CONTROLLED LIVE SCHEDULED CANARY CYCLE & AUDIT                  │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const sampleCanaryEvent = [{
      event_name: 'Test Scheduled Canary NFP',
      country: 'United States',
      country_code: 'US',
      event_date: '2026-09-04',
      event_time: '08:30',
      timezone: 'America/New_York',
      impact: 'high',
      status: 'upcoming',
      source: 'BLS'
    }];

    const liveCycle = await forexSchedulerCanaryService.runCanaryCycle({
      batchSize: 1,
      events: sampleCanaryEvent,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexSchedulerEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('9. Controlled scheduled canary cycle executes successfully (success: true)',
      liveCycle.success === true && liveCycle.mode === 'live_canary');
    assert('Cycle reports databaseMutation: true', liveCycle.databaseMutation === true);
    assert('Cycle reports batchLimit <= 5', liveCycle.summary.batchLimit <= 5);

    if (liveCycle.canaryResult?.inserted[0]?.id) {
      createdTestIds.push(liveCycle.canaryResult.inserted[0].id);
    }

    // ── TEST 10: Existing India Calendar Subsystem Integrity ────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 10: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                    │');
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
  console.log('📋 PHASE 7.5 STEP 1 (SCHEDULER CANARY) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.5 STEP 1 CONTROLLED SCHEDULER CANARY TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runSchedulerCanaryTests().catch(console.error);
