/**
 * Phase 7.4 Step 2 Test Suite: Production Forex Dry-Run Validation
 * 
 * Verifies:
 * 1. Real dry-run execution against official BLS, BEA, and Federal Reserve sources.
 * 2. Strict zero database mutation guarantee (databaseMutation: false).
 * 3. Monitoring of discovered events, validation failures, duplicates, and provider errors.
 * 4. Planned synchronization breakdown (plannedInserts, plannedUpdates, skipped).
 * 5. Timezone correctness (America/New_York on 100% of discovered events).
 * 6. Composite deduplication (country_code + canonical_event_name + date + time).
 * 7. Provider error isolation (failure on one provider does not crash dry-run).
 * 8. Status reflection through ForexCalendarRolloutService (admin rollout-status endpoint).
 * 9. India economic calendar subsystem isolation and integrity.
 * 10. Production database baseline preservation (11 upcoming, 0 released).
 */

import { forexCalendarSchedulerService } from '../src/services/forex/ForexCalendarSchedulerService.js';
import { forexCalendarRolloutService } from '../src/services/forex/ForexCalendarRolloutService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from '../src/services/forex/providers/FederalReserveSourceAdapter.js';
import { UnifiedForexDiscoveryService } from '../src/services/forex/UnifiedForexDiscoveryService.js';
import { ForexCalendarSchedulerService } from '../src/services/forex/ForexCalendarSchedulerService.js';

async function runProductionDryRunValidation() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.4 STEP 2: PRODUCTION FOREX DRY-RUN VALIDATION');
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

  // ── TEST 1: Execute Real Official Source Dry-Run ───────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1-3: REAL DRY-RUN EXECUTION & TELEMETRY MONITORING                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRunReport = await forexCalendarSchedulerService.validateProductionDryRun({ daysAhead: 120 });

  assert('1. Real production dry-run executes successfully (success: true)', dryRunReport.success === true);
  assert('2. Dry-run mode is explicitly confirmed (mode: "dry_run")', dryRunReport.mode === 'dry_run');
  assert('3. Zero database mutations guaranteed (databaseMutation: false)', dryRunReport.databaseMutation === false);

  const summary = dryRunReport.summary || {};
  assert('Discovered events count > 0', summary.totalDiscovered > 0, `(${summary.totalDiscovered} found)`);
  assert('Validated events count > 0', summary.totalValidated > 0, `(${summary.totalValidated} valid)`);
  assert('Unique events count > 0', summary.totalUnique > 0, `(${summary.totalUnique} unique)`);
  assert('Duplicates metric is tracked (number >= 0)', typeof summary.duplicatesDetected === 'number');
  assert('Validation failures metric is tracked (number >= 0)', typeof summary.totalRejected === 'number');

  // ── TEST 4: Planned Inserts / Updates / Skips Breakdown ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: PLANNED SYNCHRONIZATION BREAKDOWN MONITORING                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('Planned inserts metric is non-negative number', typeof summary.plannedInserts === 'number' && summary.plannedInserts >= 0);
  assert('Planned updates metric is non-negative number', typeof summary.plannedUpdates === 'number' && summary.plannedUpdates >= 0);
  assert('Planned skipped metric is non-negative number', typeof summary.skipped === 'number' && summary.skipped >= 0);

  // ── TEST 5: Official Provider Telemetry (BLS, BEA, Federal Reserve) ───────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: OFFICIAL MULTI-PROVIDER STATUS & TELEMETRY                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const providers = summary.providers || {};
  assert('BLS provider reported in cycle summary', Boolean(providers.BLS) && providers.BLS.success === true);
  assert('BEA provider reported in cycle summary', Boolean(providers.BEA) && providers.BEA.success === true);
  assert('Federal Reserve provider reported in cycle summary', Boolean(providers['Federal Reserve']) && providers['Federal Reserve'].success === true);

  // ── TEST 6: Timezone Correctness & Normalization ───────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: TIMEZONE CORRECTNESS (America/New_York) & CANONICAL MAPPING     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const discoveryDirect = await forexCalendarSchedulerService.discoveryService.discoverAllForexEvents({ daysAhead: 60 });
  const allEventsHaveNewYorkTz = discoveryDirect.events.every(e => e.timezone === 'America/New_York');
  assert('6. 100% of discovered USD events use "America/New_York" timezone', allEventsHaveNewYorkTz);

  const allEventsHaveUsdCurrency = discoveryDirect.events.every(e => e.currency === 'USD' && e.country_code === 'US');
  assert('100% of discovered events use currency USD and country_code US', allEventsHaveUsdCurrency);

  // ── TEST 7: Deduplication Verification ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: COMPOSITE DEDUPLICATION VERIFICATION                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const keys = discoveryDirect.events.map(e => `${e.country_code}|${e.canonical_event_name || e.event_name}|${e.event_date}|${e.event_time}`);
  const uniqueKeys = new Set(keys);
  assert('7. Discovered events contain zero internal duplicate composite keys', keys.length === uniqueKeys.size, `(${keys.length} === ${uniqueKeys.size})`);

  // ── TEST 8: Provider Failure Handling & Isolation ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: UPSTREAM PROVIDER FAILURE RESILIENCE                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const brokenProvider = {
    getProviderName: () => 'Simulated_Broken_Agency',
    fetchUpcomingEvents: async () => { throw new Error('Simulated upstream HTTP 502 Bad Gateway'); }
  };
  const resilientDiscovery = new UnifiedForexDiscoveryService([
    blsSourceAdapter,
    brokenProvider,
    beaSourceAdapter,
    federalReserveSourceAdapter
  ]);
  const isolatedScheduler = new ForexCalendarSchedulerService(resilientDiscovery);
  const failureTestRun = await isolatedScheduler.validateProductionDryRun({ daysAhead: 30 });
  assert('8. Dry-run completes successfully despite single provider failure', failureTestRun.success === true);
  assert('Failing provider marked with error in cycle summary', failureTestRun.summary.providers['Simulated_Broken_Agency']?.success === false);
  assert('Healthy providers continue discovery uninterrupted', failureTestRun.summary.totalDiscovered > 0);

  // ── TEST 9: Rollout Service Telemetry Integration ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: ROLLOUT MONITORING SERVICE REAL-TIME INTEGRATION                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const rolloutStatus = await forexCalendarRolloutService.getRolloutStatus();
  assert('9. Rollout status reflects last dry-run completed timestamp', Boolean(rolloutStatus.scheduler?.lastCompletedAt));
  assert('Rollout status reflects last cycle summary metrics', Boolean(rolloutStatus.scheduler?.lastCycleSummary));
  assert('Rollout status databaseWritesAllowed remains false', rolloutStatus.databaseWritesAllowed === false);

  // ── TEST 10: Existing India Subsystem Integrity ───────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('10. India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 11: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('11. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.4 STEP 2 (PRODUCTION DRY-RUN) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.4 STEP 2 PRODUCTION DRY-RUN VALIDATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runProductionDryRunValidation().catch(console.error);
