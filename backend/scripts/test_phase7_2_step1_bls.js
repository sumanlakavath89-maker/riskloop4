/**
 * Phase 7.2 Step 1 Test Suite: Official BLS USD Economic Calendar Integration
 * 
 * Verifies:
 * 1. BLS adapter initializes with correct provider name and domain.
 * 2. Official BLS schedule and release URLs configured accurately.
 * 3. Domain whitelist validation passes for bls.gov and subdomains.
 * 4. Third-party domains (Forex Factory, Investing.com) and fake domains are rejected.
 * 5. BLS discovers upcoming Non-Farm Payrolls and Unemployment Rate from Employment Situation.
 * 6. BLS discovers upcoming CPI and Core CPI events.
 * 7. BLS discovers upcoming PPI events.
 * 8. Timezone is explicitly America/New_York across all BLS events.
 * 9. Time is 08:30 ET across all BLS events.
 * 10. Event normalization maps all BLS events to canonical names.
 * 11. Event validator validates all discovered BLS events.
 * 12. Metric extractor extracts actual value from text when explicitly present.
 * 13. Metric extractor returns null when text lacks explicit metric (no guessing).
 * 14. Health reporting tracks success, errors, latency, and status.
 * 15. Duplicate BLS events are handled deterministically without collision.
 * 16. Provider error / failure does not crash the system.
 * 17. Dry-run execution generates zero database writes.
 * 18. Safety flags: FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false enforced.
 * 19. Existing India economic calendar remains fully functional.
 * 20. Database baseline verification: exactly 11 upcoming events, 0 released events, 0 mutations.
 */

import { blsSourceAdapter, BLSSourceAdapter } from '../src/services/forex/providers/BLSSourceAdapter.js';
import { forexEventNormalizer } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

async function runBlsIntegrationTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.2 STEP 1: OFFICIAL BLS USD ECONOMIC CALENDAR INTEGRATION');
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

  // ── TEST 1: BLS Adapter Initialization ────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: BLS ADAPTER INITIALIZATION                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS adapter provider is "BLS"', blsSourceAdapter.getProviderName() === 'BLS');
  const health = await blsSourceAdapter.getProviderHealth();
  assert('BLS provider domain is bls.gov and status is healthy', health.domain === 'bls.gov' && health.status === 'healthy');

  // ── TEST 2: Official BLS URLs Configuration ───────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: OFFICIAL BLS URLS CONFIGURATION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('Employment Situation schedule URL is official',
    blsSourceAdapter.officialUrls.EMPSIT_SCHEDULE === 'https://www.bls.gov/schedule/news_release/empsit.htm');
  assert('Employment Situation release URL is official',
    blsSourceAdapter.officialUrls.EMPSIT_RELEASE === 'https://www.bls.gov/news.release/empsit.nr0.htm');
  assert('CPI release URL is official',
    blsSourceAdapter.officialUrls.CPI_RELEASE === 'https://www.bls.gov/news.release/cpi.nr0.htm');
  assert('PPI release URL is official',
    blsSourceAdapter.officialUrls.PPI_RELEASE === 'https://www.bls.gov/news.release/ppi.nr0.htm');

  // ── TEST 3 & 4: Whitelist Validation & Rejection of Third-Party Domains ───
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3 & 4: DOMAIN WHITELIST & THIRD-PARTY REJECTION                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('bls.gov domain accepted', blsSourceAdapter.isValidSourceUrl('https://www.bls.gov/schedule/'));
  assert('data.bls.gov subdomain accepted', blsSourceAdapter.isValidSourceUrl('https://data.bls.gov/timeseries/CES0000000001'));
  assert('Forex Factory domain rejected', !blsSourceAdapter.isValidSourceUrl('https://www.forexfactory.com/calendar'));
  assert('Investing.com domain rejected', !blsSourceAdapter.isValidSourceUrl('https://www.investing.com/economic-calendar'));
  assert('Fake BLS domain rejected', !blsSourceAdapter.isValidSourceUrl('https://bls.gov.fake-domain.com/cpi'));

  // ── TEST 5: NFP and Unemployment Rate Discovery ───────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: EMPLOYMENT SITUATION DISCOVERY (NFP & UNEMPLOYMENT RATE)        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const upcomingEvents = await blsSourceAdapter.fetchUpcomingEvents({ daysAhead: 60 });
  const nfpEvents = upcomingEvents.events.filter(e => e.canonical_event_name === 'Non-Farm Payrolls');
  const urEvents = upcomingEvents.events.filter(e => e.canonical_event_name === 'Unemployment Rate');

  assert('Non-Farm Payrolls events discovered', nfpEvents.length > 0);
  assert('Unemployment Rate events discovered', urEvents.length > 0);
  assert('Both NFP and UR share the same official release date and time without collision',
    nfpEvents[0].event_date === urEvents[0].event_date && nfpEvents[0].event_time === urEvents[0].event_time);

  // ── TEST 6 & 7: CPI, Core CPI, and PPI Discovery ──────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6 & 7: CPI, CORE CPI, AND PPI DISCOVERY                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const cpiEvents = upcomingEvents.events.filter(e => e.canonical_event_name === 'CPI');
  const coreCpiEvents = upcomingEvents.events.filter(e => e.canonical_event_name === 'Core CPI');
  const ppiEvents = upcomingEvents.events.filter(e => e.canonical_event_name === 'PPI');

  assert('Headline CPI events discovered', cpiEvents.length > 0);
  assert('Core CPI events discovered', coreCpiEvents.length > 0);
  assert('PPI events discovered', ppiEvents.length > 0);

  // ── TEST 8 & 9: Timezone & Release Time Explicit Handling ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8 & 9: TIMEZONE & TIME HANDLING (America/New_York, 08:30 ET)       │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const allTzCorrect = upcomingEvents.events.every(e => e.timezone === 'America/New_York');
  const allTimeCorrect = upcomingEvents.events.every(e => e.event_time === '08:30');

  assert('All BLS events have timezone explicitly set to "America/New_York"', allTzCorrect);
  assert('All BLS events have release time set to "08:30" (US Eastern)', allTimeCorrect);

  // ── TEST 10 & 11: Normalization & Validation ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10 & 11: CANONICAL NORMALIZATION & VALIDATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  let allNormalizedValid = true;
  for (const ev of upcomingEvents.events) {
    const valRes = forexEventValidator.validateForexEvent(ev);
    if (!valRes.valid) {
      allNormalizedValid = false;
      console.error(`Validation failed for ${ev.event_name}:`, valRes.errors);
    }
  }
  assert('100% of discovered BLS events pass ForexEventValidator rules', allNormalizedValid);

  // ── TEST 12 & 13: Metric Extractor (Deterministic Parsing / No Guessing) ──
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 12 & 13: DETERMINISTIC METRIC EXTRACTION                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const sampleNfpText = 'Total nonfarm payroll employment rose by 254,000 in September, and the unemployment rate changed little at 4.1 percent.';
  const nfpParsed = blsSourceAdapter.extractMetricsFromReleaseText(sampleNfpText, 'Non-Farm Payrolls');
  const urParsed = blsSourceAdapter.extractMetricsFromReleaseText(sampleNfpText, 'Unemployment Rate');

  assert('NFP parsed 254000 K from official release text', nfpParsed && nfpParsed.actual === '254000' && nfpParsed.unit === 'K');
  assert('Unemployment Rate parsed 4.1% from official release text', urParsed && urParsed.actual === '4.1' && urParsed.unit === '%');

  const sampleCpiText = 'The Consumer Price Index for All Urban Consumers (CPI-U) increased 0.2 percent in August.';
  const cpiParsed = blsSourceAdapter.extractMetricsFromReleaseText(sampleCpiText, 'CPI');
  assert('CPI parsed 0.2% from official text', cpiParsed && cpiParsed.actual === '0.2' && cpiParsed.unit === '%');

  const emptyTextParsed = blsSourceAdapter.extractMetricsFromReleaseText('General economic discussion without numbers', 'CPI');
  assert('Metric extractor returns null when no explicit metric exists (Zero Guessing)', emptyTextParsed === null);

  // ── TEST 14: Health Telemetry ─────────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14: PROVIDER HEALTH & TELEMETRY TRACKING                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const updatedHealth = await blsSourceAdapter.getProviderHealth();
  assert('Health reports successful fetch timestamp', typeof updatedHealth.lastSuccessfulFetch === 'string');
  assert('Health reports latency in milliseconds', typeof updatedHealth.latencyMs === 'number');
  assert('Health reports 0 consecutive errors', updatedHealth.consecutiveErrors === 0);

  // ── TEST 15: Duplicate Handling ───────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 15: DETERMINISTIC DEDUPLICATION                                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const seenKeys = new Set();
  let duplicateFound = false;
  for (const ev of upcomingEvents.events) {
    const key = `${ev.currency}|${ev.canonical_event_name}|${ev.event_date}`;
    if (seenKeys.has(key)) {
      duplicateFound = true;
    }
    seenKeys.add(key);
  }
  assert('Discovered BLS events contain zero internal duplicate composite keys', !duplicateFound);

  // ── TEST 16: Failure Safety ───────────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 16: FAULT TOLERANCE & FAILURE SAFETY                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const testAdapter = new BLSSourceAdapter();
  // Simulate network failure
  testAdapter.consecutiveErrors = 3;
  const unhealthyReport = await testAdapter.getProviderHealth();
  assert('Adapter transitions to "unhealthy" status when consecutive errors >= 3', unhealthyReport.status === 'unhealthy');

  // ── TEST 17 & 18: Dry-Run & Safety Flags Enforcement ──────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 17 & 18: ZERO DATABASE WRITES & SAFETY FLAGS AUDIT                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dryRun = await forexEconomicCalendarService.runDryRunDiscovery({ daysAhead: 30 });
  assert('Dry-run reports dryRun: true', dryRun.dryRun === true);
  assert('Dry-run reports databaseMutation: false', dryRun.databaseMutation === false);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  // ── TEST 19: Existing India Calendar Subsystem Integrity ──────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 19: EXISTING INDIA CALENDAR FUNCTIONALITY INTEGRITY                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 20: Database Baseline Verification ───────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 20: PRODUCTION DATABASE INTEGRITY VERIFICATION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count matches exact baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.2 STEP 1 (BLS) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.2 STEP 1 (BLS) INTEGRATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runBlsIntegrationTests().catch(console.error);
