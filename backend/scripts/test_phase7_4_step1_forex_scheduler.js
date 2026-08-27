/**
 * Phase 7.4 Step 1 Test Suite: Forex Economic Calendar Scheduler in Dry-Run Mode
 * 
 * Verifies:
 * 1. ForexCalendarSchedulerService initialization & default disabled state.
 * 2. Disabled mode execution skips cycle cleanly (databaseMutation: false).
 * 3. Dry-run cycle execution aggregates BLS, BEA, and Federal Reserve releases.
 * 4. Dry-run sync metrics are calculated without database mutations.
 * 5. Overlap prevention blocks concurrent/simultaneous executions.
 * 6. Provider failure fault tolerance (scheduler isolates failing provider).
 * 7. Scheduler status telemetry exposed in ForexCalendarRolloutService.
 * 8. India calendar scheduler and schedule services remain completely functional.
 * 9. Production database baseline strictly preserved (11 upcoming, 0 released).
 */

import { forexCalendarSchedulerService, ForexCalendarSchedulerService } from '../src/services/forex/ForexCalendarSchedulerService.js';
import { forexCalendarRolloutService } from '../src/services/forex/ForexCalendarRolloutService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from '../src/services/forex/providers/FederalReserveSourceAdapter.js';
import { UnifiedForexDiscoveryService } from '../src/services/forex/UnifiedForexDiscoveryService.js';

async function runForexSchedulerTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.4 STEP 1: FOREX CALENDAR SCHEDULER (DRY-RUN) VALIDATION');
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

  // ── TEST 1: Service Initialization & Default Disabled Mode ────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1-2: SCHEDULER INITIALIZATION & DEFAULT DISABLED STATE             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('1. ForexCalendarSchedulerService initializes correctly', Boolean(forexCalendarSchedulerService));
  const isEnabled = forexCalendarSchedulerService.isSchedulerEnabled();
  assert('2. Scheduler is disabled by default in production environment', isEnabled === false);

  // ── TEST 3: Disabled Mode Execution ───────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: DISABLED MODE EXECUTION (Clean Skip)                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const disabledRun = await forexCalendarSchedulerService.runSchedulerCycle();
  assert('3. Disabled run is skipped with reason FOREX_SCHEDULER_DISABLED',
    disabledRun.skipped === true && disabledRun.reason === 'FOREX_SCHEDULER_DISABLED');
  assert('Disabled run reports databaseMutation: false', disabledRun.databaseMutation === false);

  // ── TEST 4 & 5: Dry-Run Scheduler Cycle Execution ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4-5: DRY-RUN SCHEDULER CYCLE EXECUTION & METRICS                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRunCycle = await forexCalendarSchedulerService.triggerManualRun({ daysAhead: 90 });
  assert('4. Manual/forced cycle executes successfully (success: true)', dryRunCycle.success === true);
  assert('Cycle operates in mode "dry_run"', dryRunCycle.mode === 'dry_run');
  assert('5. Dry-run cycle reports databaseMutation: false', dryRunCycle.databaseMutation === false);
  assert('Cycle summary aggregates total discovered events (> 0)', dryRunCycle.summary.totalDiscovered > 0);
  assert('Cycle summary tracks planned dry-run inserts / skips',
    dryRunCycle.summary.plannedInserts > 0 || dryRunCycle.summary.skipped > 0);

  // ── TEST 6: Overlap Prevention (Concurrency Lock) ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: OVERLAP PREVENTION (CONCURRENCY LOCK)                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const customScheduler = new ForexCalendarSchedulerService();
  customScheduler.isRunning = true; // Simulate active cycle

  const overlapAttempt = await customScheduler.runSchedulerCycle({ force: true });
  assert('6. Overlapping run attempt is blocked (skipped: true, CONCURRENT_RUN_IN_PROGRESS)',
    overlapAttempt.skipped === true && overlapAttempt.reason === 'CONCURRENT_RUN_IN_PROGRESS');
  assert('Overlap attempt reports databaseMutation: false', overlapAttempt.databaseMutation === false);

  // ── TEST 7: Bounded Provider Failure Fault Tolerance ──────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: PROVIDER FAILURE FAULT TOLERANCE                                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const simulatedFailingAdapter = {
    getProviderName: () => 'Simulated_Broken_Provider',
    fetchUpcomingEvents: async () => { throw new Error('Simulated upstream 503 Service Unavailable'); }
  };

  const resilientDiscovery = new UnifiedForexDiscoveryService([
    blsSourceAdapter,
    simulatedFailingAdapter,
    beaSourceAdapter,
    federalReserveSourceAdapter
  ]);

  const faultTolerantScheduler = new ForexCalendarSchedulerService(resilientDiscovery);
  const resilientCycle = await faultTolerantScheduler.triggerManualRun({ daysAhead: 60 });
  assert('7. Scheduler completes successfully even with 1 failing provider', resilientCycle.success === true);
  assert('Failing provider recorded with error in summary',
    resilientCycle.summary.providers['Simulated_Broken_Provider']?.success === false);
  assert('Valid events from healthy providers still processed', resilientCycle.summary.totalDiscovered > 0);

  // ── TEST 8: Telemetry & Rollout Status Integration ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: TELEMETRY & ROLLOUT STATUS INTEGRATION                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const rolloutStatus = await forexCalendarRolloutService.getRolloutStatus();
  assert('8. Rollout status includes scheduler telemetry', Boolean(rolloutStatus.scheduler));
  assert('Scheduler status reports enabled: false by default', rolloutStatus.scheduler.enabled === false);
  assert('Scheduler status tracks totalRunsCount', typeof rolloutStatus.scheduler.totalRunsCount === 'number');

  // ── TEST 9: Existing India Subsystems Integrity ───────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('9. India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 10: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('10. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.4 STEP 1 (FOREX SCHEDULER) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.4 STEP 1 FOREX SCHEDULER TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runForexSchedulerTests().catch(console.error);
