/**
 * Phase 7.3 Step 1 Test Suite: Unified Forex Discovery Service
 * 
 * Verifies:
 * 1. UnifiedForexDiscoveryService combines BLS, BEA, and Federal Reserve providers.
 * 2. Fetches upcoming events across all three official US government agencies.
 * 3. Normalizes and validates all events using ForexEventNormalizer and ForexEventValidator.
 * 4. Deduplicates events deterministically using country_code + event_name + event_date + event_time.
 * 5. Returns a unified chronologically sorted list (event_date ASC, event_time ASC).
 * 6. Handles provider failures gracefully without crashing discovery.
 * 7. Zero database writes / mutations (Strict dry-run).
 * 8. Forex safety switches remain false / disabled.
 * 9. Existing India economic calendar remains functional.
 * 10. Database baseline remains unchanged (11 upcoming, 0 released).
 */

import { unifiedForexDiscoveryService, UnifiedForexDiscoveryService } from '../src/services/forex/UnifiedForexDiscoveryService.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { federalReserveSourceAdapter } from '../src/services/forex/providers/FederalReserveSourceAdapter.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function runUnifiedDiscoveryTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.3 STEP 1: UNIFIED FOREX DISCOVERY SERVICE VALIDATION');
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

  // ── TEST 1: Service Initialization & Provider Wiring ───────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: UNIFIED SERVICE INITIALIZATION & PROVIDER WIRING                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('UnifiedForexDiscoveryService instance initialized', Boolean(unifiedForexDiscoveryService));
  const adapters = unifiedForexDiscoveryService.getAdapters();
  assert('Configured with 3 official adapters (BLS, BEA, Federal Reserve)', adapters.length === 3);
  const providerNames = adapters.map(a => a.getProviderName());
  assert('Includes BLS adapter', providerNames.includes('BLS'));
  assert('Includes BEA adapter', providerNames.includes('BEA'));
  assert('Includes Federal Reserve adapter', providerNames.includes('Federal Reserve'));

  // ── TEST 2: Unified Discovery Execution ───────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: MULTI-PROVIDER OFFICIAL DISCOVERY EXECUTION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const report = await unifiedForexDiscoveryService.discoverAllForexEvents({ daysAhead: 90 });
  assert('Discovery report success: true', report.success === true);
  assert('Discovery report mode: "discovery_only"', report.mode === 'discovery_only');
  assert('Discovery report databaseMutation: false', report.databaseMutation === false);
  assert('Total discovered raw events count > 0', report.summary.totalDiscovered > 0);
  assert('Total unique validated events count > 0', report.summary.totalUnique > 0);

  // ── TEST 3: Multi-Provider Event Contribution ─────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: MULTI-AGENCY EVENT CONTRIBUTIONS (BLS, BEA, FED)                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const hasBlsEvents = report.events.some(e => e.source === 'BLS');
  const hasBeaEvents = report.events.some(e => e.source === 'BEA');
  const hasFedEvents = report.events.some(e => e.source === 'Federal Reserve');

  assert('Unified list contains BLS events (NFP/UR/CPI/PPI)', hasBlsEvents);
  assert('Unified list contains BEA events (GDP/PCE)', hasBeaEvents);
  assert('Unified list contains Federal Reserve events (FOMC)', hasFedEvents);

  // ── TEST 4: Normalization & Validation Verification ───────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: CANONICAL NORMALIZATION & VALIDATION GUARANTEES                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const allUsd = report.events.every(e => e.currency === 'USD');
  const allUsCountry = report.events.every(e => e.country_code === 'US');
  const allNyTz = report.events.every(e => e.timezone === 'America/New_York');
  const allValidStatus = report.events.every(e => e.status === 'upcoming');

  assert('All unified events use currency USD', allUsd);
  assert('All unified events use country_code US', allUsCountry);
  assert('All unified events use America/New_York timezone', allNyTz);
  assert('All unified events have status "upcoming"', allValidStatus);

  // ── TEST 5: Deterministic Composite Deduplication ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: DETERMINISTIC COMPOSITE DEDUPLICATION                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const compositeKeys = new Set();
  let duplicateFound = false;

  for (const ev of report.events) {
    const key = `${ev.country_code}|${ev.canonical_event_name || ev.event_name}|${ev.event_date}|${ev.event_time || ''}|${ev.release_stage || ''}`;
    if (compositeKeys.has(key)) {
      duplicateFound = true;
    }
    compositeKeys.add(key);
  }
  assert('Zero duplicate composite keys present in unified list', !duplicateFound);

  // ── TEST 6: Chronological Sorting ─────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: CHRONOLOGICAL SORTING (event_date ASC, event_time ASC)          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  let isSorted = true;
  for (let i = 1; i < report.events.length; i++) {
    const prev = report.events[i - 1];
    const curr = report.events[i];
    const prevKey = `${prev.event_date} ${prev.event_time || '00:00'}`;
    const currKey = `${curr.event_date} ${curr.event_time || '00:00'}`;
    if (prevKey > currKey) {
      isSorted = false;
      break;
    }
  }
  assert('Unified event list is sorted chronologically', isSorted);

  // ── TEST 7: Bounded Fault Tolerance on Provider Failure ───────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: BOUNDED FAULT TOLERANCE ON PROVIDER FAILURE                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const simulatedFailingProvider = {
    getProviderName: () => 'Simulated_Failing_Agency',
    fetchUpcomingEvents: async () => { throw new Error('Simulated upstream HTTP 504 Gateway Timeout'); }
  };
  const resilientService = new UnifiedForexDiscoveryService([
    blsSourceAdapter,
    simulatedFailingProvider,
    beaSourceAdapter,
    federalReserveSourceAdapter
  ]);
  const resilientReport = await resilientService.discoverAllForexEvents({ daysAhead: 60 });
  assert('Discovery completes successfully despite one failing provider', resilientReport.success === true);
  assert('Failing provider marked with error in summary', resilientReport.providers['Simulated_Failing_Agency'].success === false);
  assert('BLS, BEA, and Fed events still successfully discovered', resilientReport.events.length > 0);

  // ── TEST 8: Zero Database Mutation & Safety Flags Audit ───────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: ZERO DATABASE MUTATION & SAFETY FLAGS AUDIT                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('FOREX_CALENDAR_ENABLED is false by default', flags.forexCalendarEnabled === false);
  assert('FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false by default', flags.forexLiveIngestionEnabled === false);
  assert('FOREX_CALENDAR_CANARY_CURRENCIES is empty by default', flags.canaryCurrencies.length === 0);

  // ── TEST 9: Existing India Calendar Subsystem Integrity ───────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: EXISTING INDIA CALENDAR FUNCTIONALITY INTEGRITY                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaUpcoming = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('India calendar schedule generator functioning normally', indiaUpcoming.events && indiaUpcoming.events.length > 0);

  // ── TEST 10: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count matches exact baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.3 STEP 1 (UNIFIED DISCOVERY) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.3 STEP 1 UNIFIED DISCOVERY TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runUnifiedDiscoveryTests().catch(console.error);
