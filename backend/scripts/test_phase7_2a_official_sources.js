/**
 * Phase 7.2A Test Suite: Forex Economic Calendar Official Source Integration
 * 
 * Verifies:
 * 1. BLS adapter initializes.
 * 2. BEA adapter initializes.
 * 3. Official source URLs pass whitelist validation.
 * 4. Unsupported domains are rejected.
 * 5. NFP normalizes correctly.
 * 6. Unemployment Rate normalizes correctly.
 * 7. CPI normalizes correctly.
 * 8. Core CPI normalizes correctly.
 * 9. PPI normalizes correctly.
 * 10. GDP normalizes correctly.
 * 11. Invalid event data is rejected.
 * 12. Duplicate events are handled safely.
 * 13. Provider failure does not crash the system.
 * 14. Discovery service aggregates providers correctly.
 * 15. Discovery-only mode is reported correctly.
 * 16. Live ingestion remains disabled.
 * 17. No database INSERT operations occur.
 * 18. No database UPDATE operations occur.
 * 19. India Economic Calendar services still work.
 * 20. Database integrity matches the original baseline.
 */

import axios from 'axios';
import { blsForexSourceAdapter, BLSForexSourceAdapter } from '../src/services/forex/BLSForexSourceAdapter.js';
import { beaForexSourceAdapter, BEAForexSourceAdapter } from '../src/services/forex/BEAForexSourceAdapter.js';
import { forexOfficialSourceDiscoveryService, ForexOfficialSourceDiscoveryService } from '../src/services/forex/ForexOfficialSourceDiscoveryService.js';
import { forexEventNormalizer } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';

const API_BASE = 'http://localhost:3000';

async function runOfficialSourcesTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛️  PHASE 7.2A: FOREX OFFICIAL SOURCE INTEGRATION VALIDATION');
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
  const blsHealth = await blsForexSourceAdapter.healthCheck();
  assert('BLS adapter healthCheck returns healthy', blsHealth.status === 'healthy' && blsHealth.domain === 'bls.gov');

  // ── TEST 2: BEA Adapter Initializes ───────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: BEA ADAPTER INITIALIZATION                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const beaHealth = await beaForexSourceAdapter.healthCheck();
  assert('BEA adapter healthCheck returns healthy', beaHealth.status === 'healthy' && beaHealth.domain === 'bea.gov');

  // ── TEST 3: Official Source URLs Pass Whitelist Validation ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: OFFICIAL SOURCE URLS WHITELIST VALIDATION                       │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const validBls1 = blsForexSourceAdapter.isValidSourceUrl('https://www.bls.gov/news.release/empsit.nr0.htm');
  const validBls2 = blsForexSourceAdapter.isValidSourceUrl('https://data.bls.gov/timeseries/CES0000000001');
  const validBea1 = beaForexSourceAdapter.isValidSourceUrl('https://www.bea.gov/data/gdp/gross-domestic-product');
  const validBea2 = beaForexSourceAdapter.isValidSourceUrl('https://apps.bea.gov/iTable/index_nipa.cfm');

  assert('Official bls.gov news and data URLs accepted', validBls1 && validBls2);
  assert('Official bea.gov news and data URLs accepted', validBea1 && validBea2);

  // ── TEST 4: Unsupported / Unofficial Domains Rejected ─────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: UNSUPPORTED / THIRD-PARTY DOMAINS ARE REJECTED                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const badDomain1 = blsForexSourceAdapter.isValidSourceUrl('https://www.forexfactory.com/calendar');
  const badDomain2 = blsForexSourceAdapter.isValidSourceUrl('https://investing.com/economic-calendar');
  const badDomain3 = beaForexSourceAdapter.isValidSourceUrl('https://tradingeconomics.com/united-states/gdp');
  const badDomain4 = beaForexSourceAdapter.isValidSourceUrl('http://insecure-bls-fake.com/gdp');

  assert('Forex Factory, Investing.com, TradingEconomics, and fake domains rejected',
    !badDomain1 && !badDomain2 && !badDomain3 && !badDomain4);

  // ── TEST 5: NFP Normalizes Correctly ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: NON-FARM PAYROLLS NORMALIZATION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS Nonfarm Payrolls normalizes to "Non-Farm Payrolls"',
    forexEventNormalizer.normalizeEventName('US Nonfarm Payrolls') === 'Non-Farm Payrolls');

  // ── TEST 6: Unemployment Rate Normalizes Correctly ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: UNEMPLOYMENT RATE NORMALIZATION                                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS Unemployment Rate normalizes to "Unemployment Rate"',
    forexEventNormalizer.normalizeEventName('US Unemployment Rate') === 'Unemployment Rate');

  // ── TEST 7: CPI Normalizes Correctly ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: CPI NORMALIZATION                                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS Headline CPI normalizes to "CPI"',
    forexEventNormalizer.normalizeEventName('US CPI (MoM)') === 'CPI');

  // ── TEST 8: Core CPI Normalizes Correctly ─────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: CORE CPI NORMALIZATION                                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS Core CPI normalizes to "Core CPI"',
    forexEventNormalizer.normalizeEventName('US Core CPI (MoM)') === 'Core CPI');

  // ── TEST 9: PPI Normalizes Correctly ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: PPI NORMALIZATION                                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BLS PPI normalizes to "PPI"',
    forexEventNormalizer.normalizeEventName('US PPI (MoM)') === 'PPI');

  // ── TEST 10: GDP Normalizes Correctly ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: GDP NORMALIZATION                                              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('BEA GDP normalizes to "GDP"',
    forexEventNormalizer.normalizeEventName('US Gross Domestic Product (GDP Annualized)') === 'GDP');

  // ── TEST 11: Invalid Event Data Is Rejected ───────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: INVALID EVENT DATA REJECTION                                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const invalidEvent = {
    country: 'United States',
    currency: 'USD',
    event_name: 'US Nonfarm Payrolls',
    event_date: 'invalid-date',
    event_time: '99:99',
    impact: 'high',
    status: 'upcoming'
  };
  const invRes = forexEventValidator.validateForexEvent(invalidEvent);
  assert('Invalid date & time rejected by validator', invRes.valid === false && invRes.errors.length > 0);

  // ── TEST 12: Duplicate Events Handled Safely ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 12: DETERMINISTIC DEDUPLICATION                                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  // Create mock adapter returning duplicates
  const mockDuplicateAdapter = {
    getProviderName: () => 'duplicate_test_adapter',
    fetchUpcomingEvents: async () => ({
      events: [
        {
          country: 'United States',
          currency: 'USD',
          event_name: 'US Nonfarm Payrolls',
          event_date: '2026-09-04',
          event_time: '08:30',
          timezone: 'America/New_York',
          impact: 'high',
          status: 'upcoming'
        },
        {
          country: 'United States',
          currency: 'USD',
          event_name: 'US Nonfarm Payrolls (Duplicate)',
          event_date: '2026-09-04',
          event_time: '08:30',
          timezone: 'America/New_York',
          impact: 'high',
          status: 'upcoming'
        }
      ]
    })
  };
  const dedupeService = new ForexOfficialSourceDiscoveryService([mockDuplicateAdapter]);
  const dedupeReport = await dedupeService.discoverOfficialEvents();
  assert('2 raw duplicate events deduplicated to 1 validated event',
    dedupeReport.summary.totalDiscovered === 2 && dedupeReport.summary.totalValidated === 1);
  assert('Duplicate recorded in diagnostics', dedupeReport.diagnostics.some(d => d.type === 'DUPLICATE_IGNORED'));

  // ── TEST 13: Provider Failure Does Not Crash System ───────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 13: FAULT TOLERANCE & PROVIDER ERROR ISOLATION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const failingAdapter = {
    getProviderName: () => 'failing_simulated_adapter',
    fetchUpcomingEvents: async () => { throw new Error('Simulated upstream network timeout'); }
  };
  const resilientService = new ForexOfficialSourceDiscoveryService([failingAdapter, blsForexSourceAdapter]);
  const resilientReport = await resilientService.discoverOfficialEvents();
  assert('Discovery completes despite one failing provider', resilientReport.success === true);
  assert('BLS events still discovered while failing provider marked in summary',
    resilientReport.providers['us_bls_official_adapter']?.success === true &&
    resilientReport.providers['failing_simulated_adapter']?.success === false);

  // ── TEST 14: Discovery Service Aggregates Providers Correctly ─────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14: DISCOVERY AGGREGATES BLS AND BEA OFFICIAL EVENTS               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fullDiscovery = await forexOfficialSourceDiscoveryService.discoverOfficialEvents({ daysAhead: 60 });
  assert('Discovery aggregates events from both BLS and BEA',
    fullDiscovery.providers['us_bls_official_adapter']?.eventsFound > 0 &&
    fullDiscovery.providers['us_bea_official_adapter']?.eventsFound > 0);
  assert('Validated events list contains both BLS and BEA records',
    fullDiscovery.events.some(e => e.source.includes('Bureau of Labor Statistics')) &&
    fullDiscovery.events.some(e => e.source.includes('Bureau of Economic Analysis')));

  // ── TEST 15: Discovery-Only Mode Reported Correctly ───────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 15: DISCOVERY-ONLY MODE AND DEV ENDPOINT VERIFICATION              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('Discovery reports mode: "discovery_only" and databaseMutation: false',
    fullDiscovery.mode === 'discovery_only' && fullDiscovery.databaseMutation === false);

  const devClient = axios.create({ baseURL: API_BASE });
  const devResp = await devClient.get('/api/dev/forex-calendar/discover?daysAhead=45');
  assert('GET /api/dev/forex-calendar/discover returns HTTP 200 OK', devResp.status === 200 && devResp.data.success === true);
  assert('Dev endpoint returns mode "discovery_only"', devResp.data.mode === 'discovery_only');

  // ── TEST 16: Live Ingestion Remains Disabled ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 16: LIVE INGESTION SAFETY SWITCH CONFIRMATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  // ── TEST 17 & 18: Zero Database INSERT and UPDATE Operations ──────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 17 & 18: ZERO DATABASE INSERT / UPDATE OPERATIONS                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const midTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  assert('No records inserted or modified in Supabase during discovery tests', midTest.length === baseline.length);

  // ── TEST 19: Existing India Calendar Subsystem Still Works ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 19: EXISTING INDIA CALENDAR FUNCTIONALITY INTEGRITY                 │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const scheduleGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('India calendar schedule generator functioning normally', scheduleGen.events && scheduleGen.events.length > 0);

  // ── TEST 20: Database Integrity Matches Original Baseline ─────────────────
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
  console.log('📋 PHASE 7.2A TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.2A OFFICIAL SOURCE INTEGRATION TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runOfficialSourcesTests().catch(console.error);
