/**
 * Phase 7.3 Step 2 Test Suite: Safe Forex Database Synchronization
 * 
 * Verifies:
 * 1. Permission checks (disabled, discovery_only, safe_blocked, canary_filtered, live_active).
 * 2. Default execution remains safe dry-run with databaseMutation: false.
 * 3. Canary currency filtering (only USD allowed when configured).
 * 4. Preservation rules: never overwrite actual values or reset 'released' status.
 * 5. Idempotent deduplication (skips identical records, prevents duplicate rows).
 * 6. Controlled live sync and automatic rollback capability.
 * 7. India calendar schedule service remains completely unaffected.
 * 8. Database baseline strictly preserved (11 upcoming, 0 released).
 */

import { forexDatabaseSyncService, ForexDatabaseSyncService } from '../src/services/forex/ForexDatabaseSyncService.js';
import { unifiedForexDiscoveryService } from '../src/services/forex/UnifiedForexDiscoveryService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runDbSyncTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.3 STEP 2: SAFE FOREX DATABASE SYNCHRONIZATION VALIDATION');
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

  // ── TEST 1: Permission Engine State Transitions ───────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1-5: PERMISSION EVALUATION ENGINE & SAFETY SWITCHES                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');

  // Case 1: Master switch disabled
  const permDisabled = forexDatabaseSyncService.canPerformLiveSync('USD', {
    forexCalendarEnabled: false,
    forexLiveIngestionEnabled: false,
    canaryCurrencies: []
  });
  assert('1. Master disabled forces mode "disabled" with allowed: false',
    permDisabled.allowed === false && permDisabled.mode === 'disabled');

  // Case 2: Calendar enabled, live ingestion disabled
  const permDiscovery = forexDatabaseSyncService.canPerformLiveSync('USD', {
    forexCalendarEnabled: true,
    forexLiveIngestionEnabled: false,
    canaryCurrencies: []
  });
  assert('2. Live ingestion disabled forces mode "discovery_only" with allowed: false',
    permDiscovery.allowed === false && permDiscovery.mode === 'discovery_only');

  // Case 3: Live ingestion enabled, empty canary
  const permSafeBlocked = forexDatabaseSyncService.canPerformLiveSync('USD', {
    forexCalendarEnabled: true,
    forexLiveIngestionEnabled: true,
    canaryCurrencies: []
  });
  assert('3. Empty canary list forces mode "safe_blocked" with allowed: false',
    permSafeBlocked.allowed === false && permSafeBlocked.mode === 'safe_blocked');

  // Case 4: Canary configured for EUR, checking USD
  const permCanaryFiltered = forexDatabaseSyncService.canPerformLiveSync('USD', {
    forexCalendarEnabled: true,
    forexLiveIngestionEnabled: true,
    canaryCurrencies: ['EUR']
  });
  assert('4. Non-matching canary currency forces mode "canary_filtered" with allowed: false',
    permCanaryFiltered.allowed === false && permCanaryFiltered.mode === 'canary_filtered');

  // Case 5: Full valid live canary for USD
  const permLiveActive = forexDatabaseSyncService.canPerformLiveSync('USD', {
    forexCalendarEnabled: true,
    forexLiveIngestionEnabled: true,
    canaryCurrencies: ['USD']
  });
  assert('5. Matching USD canary activates mode "live_active" with allowed: true',
    permLiveActive.allowed === true && permLiveActive.mode === 'live_active');

  // ── TEST 6 & 7: Default Sync Execution & Dry-Run Guarantees ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6-7: DEFAULT SYNC EXECUTION & DRY-RUN GUARANTEES                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const defaultSync = await forexDatabaseSyncService.syncForexEvents({ daysAhead: 60 });
  assert('6. Default sync runs in dryRun mode (dryRun: true)', defaultSync.dryRun === true);
  assert('7. Default sync reports databaseMutation: false', defaultSync.databaseMutation === false);
  assert('Default sync summary reflects planned inserts/updates without writing',
    defaultSync.summary.totalDiscovered > 0 && (defaultSync.summary.inserted > 0 || defaultSync.summary.skipped > 0));

  // ── TEST 8: Preservation Rules (Never overwrite actual, never reset status)
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PRESERVATION RULES (ACTUAL VALUES & RELEASED STATUS)            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const mockExistingReleasedRow = {
    id: 'mock-test-id-12345',
    country: 'United States',
    country_code: 'US',
    event_name: 'US Non-Farm Payrolls',
    event_date: '2026-09-04',
    event_time: '08:30',
    timezone: 'America/New_York',
    impact: 'high',
    status: 'released',
    actual: '254K',
    previous: '114K',
    forecast: '140K',
    source_url: 'https://www.bls.gov/schedule/news_release/empsit.htm'
  };

  const mockIncomingUpcomingEvent = {
    country: 'United States',
    country_code: 'US',
    event_name: 'US Non-Farm Payrolls',
    canonical_event_name: 'Non-Farm Payrolls',
    event_date: '2026-09-04',
    event_time: '08:30',
    timezone: 'America/New_York',
    impact: 'high',
    status: 'upcoming',
    actual: null,
    previous: null,
    forecast: null
  };

  const mockDbService = {
    supabase: {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [mockExistingReleasedRow], error: null })
        })
      })
    }
  };

  const preservationTester = new ForexDatabaseSyncService(unifiedForexDiscoveryService, mockDbService);
  const simSync = await preservationTester.syncForexEvents({
    dryRun: true,
    preLoadedEvents: [mockIncomingUpcomingEvent]
  });

  const processedItem = simSync.events[0];
  assert('8. Existing actual value ("254K") is strictly preserved against null incoming',
    processedItem && processedItem.actual === '254K');
  assert('Existing released status is strictly preserved against "upcoming" incoming',
    processedItem && processedItem.status === 'released');
  assert('Identical released item is skipped from redundant update',
    processedItem && processedItem._syncAction === 'skipped');

  // ── TEST 9: Controlled Live Sync + Rollback Verification ───────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: CONTROLLED LIVE SYNC & ROLLBACK PROTECTION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const tempTestEvent = {
    country: 'United States',
    country_code: 'US',
    event_name: 'TEST_TEMPORARY_FOREX_EVENT_PHASE7_3',
    canonical_event_name: 'Non-Farm Payrolls',
    event_date: '2099-12-31',
    event_time: '08:30',
    timezone: 'America/New_York',
    impact: 'high',
    status: 'upcoming',
    unit: '%',
    source: 'Test Provider'
  };

  // Perform controlled live sync with override
  const liveSyncResult = await forexDatabaseSyncService.syncForexEvents({
    dryRun: false,
    overrideFlags: {
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    },
    preLoadedEvents: [tempTestEvent]
  });

  assert('9. Controlled live sync executes successfully', liveSyncResult.success === true);
  assert('Live sync reports databaseMutation: true', liveSyncResult.databaseMutation === true);
  assert('Created test record ID captured', liveSyncResult.createdRecordIds.length === 1);

  const createdId = liveSyncResult.createdRecordIds[0];

  // Rollback the created test record immediately
  const rollbackResult = await forexDatabaseSyncService.rollbackSyncRecords([createdId]);
  assert('Rollback deletes test record cleanly', rollbackResult.success === true && rollbackResult.rolledBackCount === 1);

  // ── TEST 10: Existing India Calendar Subsystem Integrity ──────────────────
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

  const postAllUs = await supabaseEconomicCalendarService.supabase.from('economic_events').select('*').eq('country_code', 'US');
  const usEventsCount = (postAllUs.data || []).length;

  assert('11. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);
  assert('Zero temporary or synthetic test records remain in database', usEventsCount === 0);

  const envFlags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Environment safety flag FOREX_CALENDAR_ENABLED is false', envFlags.forexCalendarEnabled === false);
  assert('Environment safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', envFlags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.3 STEP 2 (DB SYNC) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${envFlags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${envFlags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${envFlags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.3 STEP 2 DB SYNC TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runDbSyncTests().catch(console.error);
