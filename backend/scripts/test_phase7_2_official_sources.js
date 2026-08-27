/**
 * Phase 7.2 Test Suite: Official USD Forex Economic Calendar Source Integration
 * 
 * Verifies:
 * 1. BLS adapter initializes.
 * 2. BEA adapter initializes.
 * 3. BLS Employment Situation source is configured (https://www.bls.gov/schedule/news_release/empsit.htm).
 * 4. BLS CPI/PPI schedule discovery works.
 * 5. BEA GDP schedule discovery works (https://www.bea.gov/news/schedule).
 * 6. Non-Farm Payrolls normalizes correctly.
 * 7. Unemployment Rate normalizes correctly.
 * 8. CPI normalizes correctly.
 * 9. Core CPI normalizes correctly.
 * 10. PPI normalizes correctly.
 * 11. GDP normalizes correctly.
 * 12. Invalid source event is rejected.
 * 13. Unknown event is rejected.
 * 14. Invalid date is rejected.
 * 15. Invalid time is rejected.
 * 16. Source failure does not crash service.
 * 17. Provider health reports correctly.
 * 18. Dry-run performs zero database writes.
 * 19. India calendar remains unaffected.
 * 20. Database baseline remains unchanged (11 upcoming, 0 released).
 */

import { blsSourceAdapter, BLSSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter, BEASourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { forexOfficialSourceDiscoveryService, ForexOfficialSourceDiscoveryService } from '../src/services/forex/ForexOfficialSourceDiscoveryService.js';
import { forexEventNormalizer } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function runOfficialSourcesIntegrationTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.2: OFFICIAL USD FOREX ECONOMIC CALENDAR INTEGRATION');
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

  // ── TEST 1: BLS Adapter Initializes ───────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: BLS ADAPTER INITIALIZATION                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blsHealth = await blsSourceAdapter.getProviderHealth();
  assert('BLS adapter initializes and reports provider name "BLS"', blsHealth.provider === 'BLS');
  assert('BLS adapter reports status "healthy"', blsHealth.status === 'healthy');

  // ── TEST 2: BEA Adapter Initializes ───────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: BEA ADAPTER INITIALIZATION                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const beaHealth = await beaSourceAdapter.getProviderHealth();
  assert('BEA adapter initializes and reports provider name "BEA"', beaHealth.provider === 'BEA');
  assert('BEA adapter reports status "healthy"', beaHealth.status === 'healthy');

  // ── TEST 3: BLS Employment Situation Source Configured ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: BLS EMPLOYMENT SITUATION SOURCE CONFIGURATION                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS official Employment Situation schedule URL configured',
    blsSourceAdapter.officialUrls.EMPSIT_SCHEDULE === 'https://www.bls.gov/schedule/news_release/empsit.htm');
  assert('BLS official Employment Situation release URL configured',
    blsSourceAdapter.officialUrls.EMPSIT_RELEASE === 'https://www.bls.gov/news.release/empsit.nr0.htm');

  // ── TEST 4: BLS CPI/PPI Schedule Discovery Works ──────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: BLS CPI/PPI SCHEDULE DISCOVERY                                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blsEvents = await blsSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
  const hasCpi = blsEvents.events.some(e => e.canonical_event_name === 'CPI');
  const hasCoreCpi = blsEvents.events.some(e => e.canonical_event_name === 'Core CPI');
  const hasPpi = blsEvents.events.some(e => e.canonical_event_name === 'PPI');
  assert('BLS discovers upcoming CPI events', hasCpi);
  assert('BLS discovers upcoming Core CPI events', hasCoreCpi);
  assert('BLS discovers upcoming PPI events', hasPpi);

  // ── TEST 5: BEA GDP Schedule Discovery Works ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: BEA GDP SCHEDULE DISCOVERY                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const beaEvents = await beaSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
  const hasGdp = beaEvents.events.some(e => e.canonical_event_name === 'GDP');
  assert('BEA discovers upcoming GDP events', hasGdp);
  assert('BEA official schedule URL is configured',
    beaSourceAdapter.officialUrls.SCHEDULE === 'https://www.bea.gov/news/schedule');

  // ── TEST 6: Non-Farm Payrolls Normalizes Correctly ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: NON-FARM PAYROLLS NORMALIZATION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS US Nonfarm Payrolls normalizes to "Non-Farm Payrolls"',
    forexEventNormalizer.normalizeEventName('US Nonfarm Payrolls') === 'Non-Farm Payrolls');

  // ── TEST 7: Unemployment Rate Normalizes Correctly ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: UNEMPLOYMENT RATE NORMALIZATION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS US Unemployment Rate normalizes to "Unemployment Rate"',
    forexEventNormalizer.normalizeEventName('US Unemployment Rate') === 'Unemployment Rate');

  // ── TEST 8: CPI Normalizes Correctly ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: CPI NORMALIZATION                                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS US CPI (MoM) normalizes to "CPI"',
    forexEventNormalizer.normalizeEventName('US CPI (MoM)') === 'CPI');

  // ── TEST 9: Core CPI Normalizes Correctly ─────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: CORE CPI NORMALIZATION                                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS US Core CPI (MoM) normalizes to "Core CPI"',
    forexEventNormalizer.normalizeEventName('US Core CPI (MoM)') === 'Core CPI');

  // ── TEST 10: PPI Normalizes Correctly ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: PPI NORMALIZATION                                              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS US PPI (MoM) normalizes to "PPI"',
    forexEventNormalizer.normalizeEventName('US PPI (MoM)') === 'PPI');

  // ── TEST 11: GDP Normalizes Correctly ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: GDP NORMALIZATION                                              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BEA US Gross Domestic Product normalizes to "GDP"',
    forexEventNormalizer.normalizeEventName('US Gross Domestic Product (GDP Annualized)') === 'GDP');

  // ── TEST 12: Invalid Source Event Is Rejected ─────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 12: INVALID SOURCE EVENT REJECTION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const invalidSourceEvent = {
    country: 'United States',
    currency: 'USD',
    event_name: 'Fake Unofficial Event',
    event_date: '2026-09-04',
    event_time: '08:30',
    timezone: 'America/New_York',
    impact: 'high',
    status: 'upcoming'
  };
  const invSourceRes = forexEventValidator.validateForexEvent(invalidSourceEvent);
  assert('Unknown indicator rejected by validator', invSourceRes.valid === false);

  // ── TEST 13: Unknown Event Is Rejected ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 13: UNKNOWN EVENT NORMALIZATION REJECTION (No Silent Guessing)     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('Unknown string returns null from normalizer',
    forexEventNormalizer.normalizeEventName('Some Random Speculative Metric') === null);

  // ── TEST 14: Invalid Date Is Rejected ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14: INVALID DATE REJECTION                                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const badDateEvent = {
    country: 'United States',
    currency: 'USD',
    event_name: 'US Nonfarm Payrolls',
    event_date: '2026-13-45', // Month 13, Day 45
    event_time: '08:30',
    timezone: 'America/New_York',
    impact: 'high',
    status: 'upcoming'
  };
  const badDateRes = forexEventValidator.validateForexEvent(badDateEvent);
  assert('Invalid calendar date rejected', badDateRes.valid === false);

  // ── TEST 15: Invalid Time Is Rejected ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 15: INVALID TIME REJECTION                                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const badTimeEvent = {
    country: 'United States',
    currency: 'USD',
    event_name: 'US Nonfarm Payrolls',
    event_date: '2026-09-04',
    event_time: '28:90', // Invalid time
    timezone: 'America/New_York',
    impact: 'high',
    status: 'upcoming'
  };
  const badTimeRes = forexEventValidator.validateForexEvent(badTimeEvent);
  assert('Invalid 24h time rejected', badTimeRes.valid === false);

  // ── TEST 16: Source Failure Does Not Crash Service ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 16: FAULT TOLERANCE ON PROVIDER FAILURE                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const brokenAdapter = {
    getProviderName: () => 'failing_provider_test',
    fetchUpcomingEvents: async () => { throw new Error('503 Service Unavailable'); }
  };
  const discoveryInstance = new ForexOfficialSourceDiscoveryService([brokenAdapter, blsSourceAdapter, beaSourceAdapter]);
  const safeDiscoveryReport = await discoveryInstance.discoverOfficialEvents();
  assert('Discovery completes safely when one provider fails', safeDiscoveryReport.success === true);
  assert('BLS and BEA events retrieved despite third provider failure', safeDiscoveryReport.events.length > 0);

  // ── TEST 17: Provider Health Reports Correctly ────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 17: AGGREGATED PROVIDER HEALTH REPORTING                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const healthMap = await forexEconomicCalendarService.getProviderHealthStatuses();
  assert('Aggregated health contains BLS and BEA providers', Boolean(healthMap['BLS']) && Boolean(healthMap['BEA']));
  assert('BLS health status is "healthy"', healthMap['BLS'].status === 'healthy');
  assert('BEA health status is "healthy"', healthMap['BEA'].status === 'healthy');

  // ── TEST 18: Dry-Run Performs Zero Database Writes ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 18: DRY-RUN DISCOVERY PIPELINE EXECUTION (Zero DB Writes)          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRunReport = await forexEconomicCalendarService.runDryRunDiscovery({ daysAhead: 45 });
  assert('Dry-run reports dryRun: true', dryRunReport.dryRun === true);
  assert('Dry-run reports databaseMutation: false', dryRunReport.databaseMutation === false);
  assert('Discovered official events count > 0', dryRunReport.discovered > 0);
  assert('Validated official events count > 0', dryRunReport.valid > 0);

  // ── TEST 19: India Calendar Remains Unaffected ────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 19: EXISTING INDIA ECONOMIC CALENDAR INTEGRITY                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaUpcoming = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('India calendar schedule generator functioning normally', indiaUpcoming.events && indiaUpcoming.events.length > 0);

  // ── TEST 20: Database Baseline Remains Unchanged ──────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 20: PRODUCTION DATABASE INTEGRITY VERIFICATION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count matches baseline exactly', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count matches baseline exactly', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count matches baseline exactly (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.2 OFFICIAL SOURCES INTEGRATION TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.2 OFFICIAL SOURCE INTEGRATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runOfficialSourcesIntegrationTests().catch(console.error);
