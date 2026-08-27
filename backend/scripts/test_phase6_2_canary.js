/**
 * Phase 6.2 Step 2 Test Suite: Canary Indicator Control
 * 
 * Verifies:
 * Test 1: LIVE_INGESTION_ENABLED=false + CPI in canary -> database mutation blocked (LIVE_INGESTION_DISABLED)
 * Test 2: LIVE_INGESTION_ENABLED=true + empty canary -> database mutation blocked (canary_blocked)
 * Test 3: LIVE_INGESTION_ENABLED=true + CPI only -> CPI allowed (rollback), IIP blocked
 * Test 4: LIVE_INGESTION_ENABLED=true + multiple indicators -> only configured allowed
 * Test 5: LIVE_INGESTION_ENABLED=true + CANARY_INDICATORS=all -> all 5 supported indicators allowed
 * Test 6: Whitespace normalization: "  CPI Inflation ,  IIP  " -> allows both
 * Test 7: Unknown indicator -> always blocked even if in canary string
 * Test 8: Production database integrity preserved with 0 mutations
 */

import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runCanaryControlTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 2: CANARY INDICATOR CONTROL VALIDATION');
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

  const cpiEvent = baseline.find(e => e.event_name.includes('CPI')) || { event_date: '2026-09-14' };
  const iipEvent = baseline.find(e => e.event_name.includes('IIP')) || { event_date: '2026-09-28' };
  const wpiEvent = baseline.find(e => e.event_name.includes('WPI')) || { event_date: '2026-09-14' };
  const gdpEvent = baseline.find(e => e.event_name.includes('GDP')) || { event_date: '2026-08-31' };
  const rbiEvent = baseline.find(e => e.event_name.includes('RBI') || e.event_name.includes('Repo Rate')) || { event_date: '2026-10-09' };

  // ── TEST 1: Live Ingestion Disabled + CPI in Canary ───────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: LIVE INGESTION DISABLED + CPI IN CANARY                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t1Res = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=101',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: false,
      overrideCanaryIndicators: 'CPI Inflation',
      allowFutureRelease: true
    }
  );
  assert('Blocked by live ingestion master switch',
    t1Res.status === 'dry_run_only' && t1Res.reason === 'LIVE_INGESTION_DISABLED');

  // ── TEST 2: Live Ingestion Enabled + Empty Canary ─────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: LIVE INGESTION ENABLED + EMPTY CANARY                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t2Res = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=102',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: '',
      allowFutureRelease: true
    }
  );
  assert('Blocked by empty canary list',
    t2Res.status === 'canary_blocked' && t2Res.reason === 'INDICATOR_NOT_ALLOWED_FOR_LIVE_INGESTION');

  // ── TEST 3: Live Ingestion Enabled + CPI Only ─────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: LIVE INGESTION ENABLED + CPI ONLY (CPI Allowed, IIP Blocked)    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const t3Cpi = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=103',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation',
      allowFutureRelease: true,
      rollback: true // Safely rollback after verification
    }
  );
  assert('CPI Inflation allowed when in canary list', t3Cpi.matched === true && t3Cpi.updatedRecord?.status === 'released');

  const t3Iip = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'IIP',
      actual: '4.2',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=104',
      source: 'MoSPI',
      releaseDate: iipEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation', // IIP not in list
      allowFutureRelease: true
    }
  );
  assert('IIP blocked when not in canary list',
    t3Iip.status === 'canary_blocked' && t3Iip.reason === 'INDICATOR_NOT_ALLOWED_FOR_LIVE_INGESTION');

  // ── TEST 4: Live Ingestion Enabled + Multiple Indicators ──────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: MULTIPLE CONFIGURED CANARY INDICATORS                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const multiCanary = 'CPI Inflation, WPI Inflation, RBI Repo Rate';

  assert('CPI allowed in multi-canary', officialReleaseIngestionService.isIndicatorCanaryAllowed('CPI Inflation', multiCanary));
  assert('WPI allowed in multi-canary', officialReleaseIngestionService.isIndicatorCanaryAllowed('WPI Inflation', multiCanary));
  assert('RBI Repo Rate allowed in multi-canary', officialReleaseIngestionService.isIndicatorCanaryAllowed('RBI Repo Rate', multiCanary));
  assert('IIP blocked (not in multi-canary)', !officialReleaseIngestionService.isIndicatorCanaryAllowed('IIP', multiCanary));
  assert('GDP blocked (not in multi-canary)', !officialReleaseIngestionService.isIndicatorCanaryAllowed('GDP', multiCanary));

  // ── TEST 5: Live Ingestion Enabled + CANARY_INDICATORS=all ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: CANARY_INDICATORS="all" (All 5 Supported Indicators)            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const allCanary = 'all';
  assert('CPI allowed under "all"', officialReleaseIngestionService.isIndicatorCanaryAllowed('CPI Inflation', allCanary));
  assert('IIP allowed under "all"', officialReleaseIngestionService.isIndicatorCanaryAllowed('IIP', allCanary));
  assert('WPI allowed under "all"', officialReleaseIngestionService.isIndicatorCanaryAllowed('WPI Inflation', allCanary));
  assert('GDP allowed under "all"', officialReleaseIngestionService.isIndicatorCanaryAllowed('GDP', allCanary));
  assert('RBI Repo Rate allowed under "all"', officialReleaseIngestionService.isIndicatorCanaryAllowed('RBI Monetary Policy / Repo Rate', allCanary));

  // ── TEST 6: Whitespace Normalization ──────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: WHITESPACE NORMALIZATION                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const paddedCanary = '  CPI Inflation  ,   IIP   ';
  assert('CPI allowed with leading/trailing spaces in list', officialReleaseIngestionService.isIndicatorCanaryAllowed('CPI Inflation', paddedCanary));
  assert('IIP allowed with leading/trailing spaces in list', officialReleaseIngestionService.isIndicatorCanaryAllowed('IIP', paddedCanary));
  assert('WPI blocked with padded canary', !officialReleaseIngestionService.isIndicatorCanaryAllowed('WPI Inflation', paddedCanary));

  // ── TEST 7: Unknown / Unsupported Indicator ───────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: UNKNOWN / UNSUPPORTED INDICATOR PROTECTION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const unknownCanary = 'Unknown Macro Indicator, CPI Inflation';
  assert('Unknown indicator is rejected even if in canary string',
    !officialReleaseIngestionService.isIndicatorCanaryAllowed('Unknown Macro Indicator', unknownCanary));

  // ── TEST 8: Production Database Integrity & Baseline Check ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PRODUCTION DATABASE INTEGRITY & ZERO-MUTATION VERIFICATION      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 CANARY CONTROL TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}"`);

  if (passed === total) {
    console.log('\n🎉 ALL CANARY CONTROL TESTS PASSED (100%). SAFEGUARDS VERIFIED.\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runCanaryControlTests().catch(console.error);
