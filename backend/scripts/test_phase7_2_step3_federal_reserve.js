/**
 * Phase 7.2 Step 3 Test Suite: Official Federal Reserve (FOMC) Integration
 * 
 * Verifies:
 * 1. Federal Reserve adapter initializes correctly
 * 2. Provider name is "Federal Reserve"
 * 3. Official domain is federalreserve.gov
 * 4. Official FOMC calendar & statements URLs are accepted
 * 5. Third-party URLs rejected (Forex Factory, Investing.com, TradingEconomics)
 * 6. Fake Federal Reserve domains rejected
 * 7. FOMC meeting events discovered
 * 8. FOMC event normalization works
 * 9. America/New_York timezone applied
 * 10. Official release time validated (14:00 ET)
 * 11. Interest rate target range extraction works (e.g. "5-1/4 to 5-1/2 percent" -> "5.25-5.50")
 * 12. Decimal rate extraction works (e.g. "5.25 to 5.50 percent" -> "5.25-5.50")
 * 13. Missing rates return null (Strict Zero Guessing Policy)
 * 14. Provider health telemetry works
 * 15. Three failures mark provider unhealthy
 * 16. Composite deduplication works
 * 17. Dry-run reports databaseMutation: false
 * 18. Forex live ingestion remains disabled
 * 19. Existing BLS adapter remains functional
 * 20. Existing BEA adapter remains functional
 * 21. Existing India calendar remains functional
 * 22. Production database baseline remains unchanged (11 upcoming, 0 released)
 */

import { federalReserveSourceAdapter, FederalReserveSourceAdapter } from '../src/services/forex/providers/FederalReserveSourceAdapter.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { beaSourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { forexEventNormalizer } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function runFederalReserveIntegrationTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.2 STEP 3: OFFICIAL FEDERAL RESERVE (FOMC) INTEGRATION');
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

  // ── TEST 1, 2, 3: Federal Reserve Adapter Initialization & Metadata ───────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1-3: FEDERAL RESERVE ADAPTER INITIALIZATION, NAME & DOMAIN         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('1. Federal Reserve adapter initializes correctly', Boolean(federalReserveSourceAdapter));
  assert('2. Provider name is "Federal Reserve"', federalReserveSourceAdapter.getProviderName() === 'Federal Reserve');
  const health = await federalReserveSourceAdapter.getProviderHealth();
  assert('3. Official domain is federalreserve.gov', health.domain === 'federalreserve.gov');

  // ── TEST 4, 5, 6: Official URLs Accepted & Imposter Domains Rejected ──────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4-6: OFFICIAL URLS ACCEPTED & THIRD-PARTY / FAKE DOMAINS REJECTED  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('4. Official FOMC calendar URL is accepted',
    federalReserveSourceAdapter.isValidSourceUrl('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'));
  assert('Official FOMC statements URL is accepted',
    federalReserveSourceAdapter.isValidSourceUrl('https://www.federalreserve.gov/monetarypolicy/fomcstatements.htm'));

  const thirdPartyUrls = [
    'https://www.forexfactory.com/calendar',
    'https://www.investing.com/central-banks/fed',
    'https://tradingeconomics.com/united-states/interest-rate',
    'https://www.fxstreet.com/economic-calendar'
  ];
  const allThirdPartyRejected = thirdPartyUrls.every(u => !federalReserveSourceAdapter.isValidSourceUrl(u));
  assert('5. Third-party domains (Forex Factory, Investing, TradingEconomics) rejected', allThirdPartyRejected);
  assert('6. Fake Federal Reserve domains rejected',
    !federalReserveSourceAdapter.isValidSourceUrl('https://federalreserve.gov.imposter-bank.com/fomc'));

  // ── TEST 7: FOMC Events Discovered ────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: FOMC EVENTS DISCOVERY                                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fedDiscovery = await federalReserveSourceAdapter.fetchUpcomingEvents({ daysAhead: 180 });
  const fomcEvents = fedDiscovery.events.filter(e => e.canonical_event_name === 'FOMC Interest Rate Decision');
  assert('7. FOMC meeting events discovered from official schedule', fomcEvents.length > 0);

  // ── TEST 8: Event Normalization ───────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: FOMC EVENT NORMALIZATION                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fomcVariations = [
    'FOMC Interest Rate Decision',
    'FOMC Rate Decision',
    'US FOMC Interest Rate Decision',
    'Federal Funds Target Rate',
    'Federal Reserve Interest Rate Decision',
    'Fed Interest Rate Decision'
  ];
  const allFomcNormalized = fomcVariations.every(v => forexEventNormalizer.normalizeEventName(v) === 'FOMC Interest Rate Decision');
  assert('8. All FOMC naming variations normalize to "FOMC Interest Rate Decision"', allFomcNormalized);

  // ── TEST 9 & 10: Timezone & Official Release Time ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9-10: TIMEZONE (America/New_York) & RELEASE TIME (14:00 ET)        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const allNyTz = fomcEvents.every(e => e.timezone === 'America/New_York');
  const allTime1400 = fomcEvents.every(e => e.event_time === '14:00');
  assert('9. America/New_York timezone applied across all FOMC events', allNyTz);
  assert('10. Official release time set to 14:00 ET (2:00 PM Eastern standard)', allTime1400);

  // ── TEST 11, 12, 13: Deterministic Interest Rate Metric Extraction ────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11-13: DETERMINISTIC RATE EXTRACTION & ZERO GUESSING POLICY        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fractionStatement = 'The Committee decided to maintain the target range for the federal funds rate at 5-1/4 to 5-1/2 percent.';
  const fractionRate = federalReserveSourceAdapter.extractMetricsFromReleaseText(fractionStatement, 'FOMC Interest Rate Decision');
  assert('11. Fractional rate target "5-1/4 to 5-1/2 percent" parsed as "5.25-5.50%"',
    fractionRate && fractionRate.actual === '5.25-5.50' && fractionRate.unit === '%');

  const decimalStatement = 'The Federal Open Market Committee decided to lower the target range for the federal funds rate of 4.75 to 5.00 percent.';
  const decimalRate = federalReserveSourceAdapter.extractMetricsFromReleaseText(decimalStatement, 'FOMC Interest Rate Decision');
  assert('12. Decimal rate target "4.75 to 5.00 percent" parsed as "4.75-5.00%"',
    decimalRate && decimalRate.actual === '4.75-5.00' && decimalRate.unit === '%');

  const narrativeOnly = 'The Committee seeks to achieve maximum employment and inflation at the rate of 2 percent over the longer run.';
  const narrativeRate = federalReserveSourceAdapter.extractMetricsFromReleaseText(narrativeOnly, 'FOMC Interest Rate Decision');
  assert('13. Missing rates return null without guessing or hallucinating', narrativeRate === null);

  // ── TEST 14 & 15: Provider Health Telemetry & Safe Degradation ────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14-15: PROVIDER HEALTH TELEMETRY & SAFE TRANSITIONS                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fedHealth = await federalReserveSourceAdapter.getProviderHealth();
  assert('14. Provider health telemetry tracks successful fetches and latency',
    typeof fedHealth.lastSuccessfulFetch === 'string' && typeof fedHealth.latencyMs === 'number');

  const simulatedFailingFed = new FederalReserveSourceAdapter();
  simulatedFailingFed.consecutiveErrors = 3;
  const failedFedHealth = await simulatedFailingFed.getProviderHealth();
  assert('15. Three consecutive failures transition provider safely to "unhealthy"', failedFedHealth.status === 'unhealthy');

  // ── TEST 16: Composite Deduplication ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 16: COMPOSITE DEDUPLICATION                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const seenKeys = new Set();
  let duplicateCount = 0;
  for (const ev of fomcEvents) {
    const key = `${ev.country_code}|${ev.canonical_event_name}|${ev.event_date}|${ev.event_time}`;
    if (seenKeys.has(key)) {
      duplicateCount++;
    }
    seenKeys.add(key);
  }
  assert('16. Composite deduplication prevents duplicate FOMC events (0 duplicates)', duplicateCount === 0);

  // ── TEST 17 & 18: Dry-Run Mode & Live Ingestion Safety Switch ─────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 17-18: DRY-RUN MODE & SAFETY SWITCHES AUDIT                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRun = await forexEconomicCalendarService.runDryRunDiscovery({ daysAhead: 180 });
  assert('17. Dry-run reports databaseMutation: false', dryRun.databaseMutation === false);
  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('18. Forex live ingestion remains disabled (FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false)',
    flags.forexLiveIngestionEnabled === false);

  // ── TEST 19, 20, 21: Existing BLS, BEA & India Subsystems Integrity ───────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 19-21: EXISTING BLS, BEA & INDIA CALENDARS INTEGRITY               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blsUpcoming = await blsSourceAdapter.fetchUpcomingEvents({ daysAhead: 30 });
  assert('19. Existing BLS adapter remains functional', blsUpcoming.events.length > 0);
  const beaUpcoming = await beaSourceAdapter.fetchUpcomingEvents({ daysAhead: 30 });
  assert('20. Existing BEA adapter remains functional', beaUpcoming.events.length > 0);
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('21. Existing India calendar remains functional', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 22: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 22: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('22. Production database baseline remains unchanged', postTest.length === baseline.length);
  assert('Total economic_events count matches baseline (11 === 11)', postTest.length === 11, `(${postTest.length} === 11)`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === 11, `(${postUpcoming} === 11)`);
  assert('Released event count matches baseline (0 === 0)', postReleased === 0, `(${postReleased} === 0)`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.2 STEP 3 (FOMC) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.2 STEP 3 (FOMC) INTEGRATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runFederalReserveIntegrationTests().catch(console.error);
