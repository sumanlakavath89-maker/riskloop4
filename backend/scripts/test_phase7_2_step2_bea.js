/**
 * Phase 7.2 Step 2 Test Suite: Official BEA (U.S. Bureau of Economic Analysis) Integration
 * 
 * Verifies:
 * 1. BEA adapter initializes correctly
 * 2. Provider domain is official (bea.gov)
 * 3. Official schedule URLs are accepted
 * 4. Third-party URLs rejected (forexfactory.com, investing.com, tradingeconomics.com, fxstreet.com)
 * 5. Fake BEA domains rejected
 * 6. GDP events discovered
 * 7. GDP naming variations normalize correctly
 * 8. PCE and Core PCE supported deterministically
 * 9. America/New_York timezone applied
 * 10. Official release time handling validated (08:30 ET)
 * 11. GDP metric extraction works with sample official release text
 * 12. PCE & Core PCE metric extraction works with sample official release text
 * 13. Missing metrics return null (No guessing behavior)
 * 14. Provider health telemetry works
 * 15. Three failures mark provider unhealthy
 * 16. Composite deduplication works
 * 17. Dry-run reports databaseMutation false
 * 18. Forex live ingestion remains disabled
 * 19. Existing BLS adapter remains functional
 * 20. Existing India calendar remains functional
 * 21. Production database baseline remains unchanged
 */

import { beaSourceAdapter, BEASourceAdapter } from '../src/services/forex/providers/BEASourceAdapter.js';
import { blsSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { forexEventNormalizer } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function runBeaIntegrationTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.2 STEP 2: OFFICIAL BEA (U.S. BEA) INTEGRATION VALIDATION');
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

  // ── TEST 1 & 2: BEA Adapter Initialization & Official Domain ──────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1-2: BEA ADAPTER INITIALIZATION & OFFICIAL DOMAIN                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('1. BEA adapter initializes correctly', Boolean(beaSourceAdapter));
  const health = await beaSourceAdapter.getProviderHealth();
  assert('2. Provider domain is official (bea.gov) and provider name is "BEA"',
    health.domain === 'bea.gov' && beaSourceAdapter.getProviderName() === 'BEA');

  // ── TEST 3, 4, 5: Official Schedule URLs Accepted & Third-Party Rejected ──
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3-5: OFFICIAL URLS ACCEPTED & THIRD-PARTY / FAKE DOMAINS REJECTED  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('3. Official BEA schedule URLs are accepted',
    beaSourceAdapter.isValidSourceUrl('https://www.bea.gov/news/schedule') &&
    beaSourceAdapter.isValidSourceUrl('https://www.bea.gov/news/schedule/full'));

  const thirdPartyUrls = [
    'https://www.forexfactory.com/calendar',
    'https://www.investing.com/economic-calendar',
    'https://tradingeconomics.com/united-states/gdp',
    'https://www.fxstreet.com/economic-calendar'
  ];
  const allThirdPartyRejected = thirdPartyUrls.every(u => !beaSourceAdapter.isValidSourceUrl(u));
  assert('4. Third-party domains (Forex Factory, Investing, TradingEconomics, FXStreet) are rejected', allThirdPartyRejected);
  assert('5. Fake BEA domains are rejected',
    !beaSourceAdapter.isValidSourceUrl('https://bea.gov.imposter-site.com/news/schedule'));

  // ── TEST 6: GDP Events Discovered ─────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: GDP EVENTS DISCOVERED                                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const beaDiscovery = await beaSourceAdapter.fetchUpcomingEvents({ daysAhead: 90 });
  const gdpEvents = beaDiscovery.events.filter(e => e.canonical_event_name === 'GDP');
  assert('6. GDP events discovered from official BEA schedule', gdpEvents.length > 0);

  // ── TEST 7: GDP Naming Variations Normalize Correctly ─────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: GDP NAMING VARIATIONS NORMALIZATION                             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const gdpVariations = [
    'Gross Domestic Product',
    'GDP Advance Estimate',
    'GDP Second Estimate',
    'GDP Third Estimate',
    'Gross Domestic Product, First Quarter',
    'Gross Domestic Product (Advance Estimate)',
    'Real Gross Domestic Product',
    'US Gross Domestic Product (GDP Annualized)'
  ];
  const allGdpNormalized = gdpVariations.every(v => forexEventNormalizer.normalizeEventName(v) === 'GDP');
  assert('7. All GDP naming variations normalize to "GDP"', allGdpNormalized);

  // ── TEST 8: PCE and Core PCE Supported ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PCE AND CORE PCE SUPPORTED DETERMINISTICALLY                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const pceEvents = beaDiscovery.events.filter(e => e.canonical_event_name === 'PCE');
  const corePceEvents = beaDiscovery.events.filter(e => e.canonical_event_name === 'Core PCE');
  assert('8. Headline PCE and Core PCE events discovered from official schedule', pceEvents.length > 0 && corePceEvents.length > 0);
  assert('PCE naming variation normalizes to "PCE"', forexEventNormalizer.normalizeEventName('US PCE Price Index (MoM)') === 'PCE');
  assert('Core PCE naming variation normalizes to "Core PCE"', forexEventNormalizer.normalizeEventName('US Core PCE Price Index (MoM)') === 'Core PCE');

  // ── TEST 9 & 10: Timezone & Official Release Time Validated ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9-10: TIMEZONE (America/New_York) & RELEASE TIME (08:30 ET)        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const allNyTz = beaDiscovery.events.every(e => e.timezone === 'America/New_York');
  const allTimeValid = beaDiscovery.events.every(e => e.event_time === '08:30' || e.event_time === null);
  assert('9. America/New_York timezone applied across all BEA events', allNyTz);
  assert('10. Official release time validated (08:30 ET without guessing missing times)', allTimeValid);

  // ── TEST 11, 12, 13: Deterministic Metric Extraction & No Guessing ────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11-13: DETERMINISTIC METRIC EXTRACTION (GDP, PCE, Core PCE)        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const sampleGdpText = 'Real gross domestic product (GDP) increased at an annual rate of 3.0 percent in the second quarter of 2026.';
  const gdpMetrics = beaSourceAdapter.extractMetricsFromReleaseText(sampleGdpText, 'GDP');
  assert('11. GDP metric extraction works with sample official text (3.0%)',
    gdpMetrics && gdpMetrics.actual === '3.0' && gdpMetrics.unit === '%');

  const samplePceText = 'The PCE price index increased 0.2 percent in August.';
  const pceMetrics = beaSourceAdapter.extractMetricsFromReleaseText(samplePceText, 'PCE');
  assert('12. PCE metric extraction works with sample official text (0.2%)',
    pceMetrics && pceMetrics.actual === '0.2' && pceMetrics.unit === '%');

  const sampleCorePceText = 'The PCE price index excluding food and energy increased 0.1 percent in August.';
  const corePceMetrics = beaSourceAdapter.extractMetricsFromReleaseText(sampleCorePceText, 'Core PCE');
  assert('Core PCE metric extraction works with sample official text (0.1%)',
    corePceMetrics && corePceMetrics.actual === '0.1' && corePceMetrics.unit === '%');

  const emptyMetrics = beaSourceAdapter.extractMetricsFromReleaseText('General economic outlook narrative without figures', 'GDP');
  assert('13. Missing metrics return null (Strict Zero Guessing Policy)', emptyMetrics === null);

  // ── TEST 14 & 15: Provider Health & Transition on Failures ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14-15: PROVIDER HEALTH TELEMETRY & SAFE TRANSITIONS                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const currentHealth = await beaSourceAdapter.getProviderHealth();
  assert('14. Provider health telemetry tracks successful fetches and latency',
    typeof currentHealth.lastSuccessfulFetch === 'string' && typeof currentHealth.latencyMs === 'number');

  const simulatedFailingBea = new BEASourceAdapter();
  simulatedFailingBea.consecutiveErrors = 3;
  const failedHealth = await simulatedFailingBea.getProviderHealth();
  assert('15. Three consecutive failures transition provider safely to "unhealthy"', failedHealth.status === 'unhealthy');

  // ── TEST 16: Composite Deduplication ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 16: COMPOSITE DEDUPLICATION                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const seenKeys = new Set();
  let duplicateCount = 0;
  for (const ev of beaDiscovery.events) {
    const key = `${ev.country_code}|${ev.canonical_event_name}|${ev.event_date}|${ev.event_time}|${ev.release_stage || ''}`;
    if (seenKeys.has(key)) {
      duplicateCount++;
    }
    seenKeys.add(key);
  }
  assert('16. Composite deduplication prevents duplicate events (0 duplicate keys)', duplicateCount === 0);

  // ── TEST 17 & 18: Dry-Run Mode & Live Ingestion Safety Switch ─────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 17-18: DRY-RUN MODE & SAFETY SWITCHES AUDIT                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRun = await forexEconomicCalendarService.runDryRunDiscovery({ daysAhead: 90 });
  assert('17. Dry-run reports databaseMutation: false', dryRun.databaseMutation === false);
  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('18. Forex live ingestion remains disabled (FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false)',
    flags.forexLiveIngestionEnabled === false);

  // ── TEST 19 & 20: Existing BLS & India Subsystem Integrity ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 19-20: EXISTING BLS & INDIA CALENDAR INTEGRITY                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blsUpcoming = await blsSourceAdapter.fetchUpcomingEvents({ daysAhead: 30 });
  assert('19. Existing BLS adapter remains functional', blsUpcoming.events.length > 0);
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('20. Existing India calendar remains functional', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 21: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 21: PRODUCTION DATABASE BASELINE VERIFICATION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('21. Production database baseline remains unchanged', postTest.length === baseline.length);
  assert('Total economic_events count matches baseline (11 === 11)', postTest.length === 11, `(${postTest.length} === 11)`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === 11, `(${postUpcoming} === 11)`);
  assert('Released event count matches baseline (0 === 0)', postReleased === 0, `(${postReleased} === 0)`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.2 STEP 2 (BEA) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.2 STEP 2 (BEA) INTEGRATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runBeaIntegrationTests().catch(console.error);
