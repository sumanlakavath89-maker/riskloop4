/**
 * Phase 7.1 Test Suite: Forex Economic Calendar Architecture & USD Foundation
 * 
 * Verifies:
 * 1. Forex service initializes successfully.
 * 2. Valid USD event passes validation.
 * 3. Unsupported currency is rejected.
 * 4. Unknown event is rejected (no guessing or incorrect silent mapping).
 * 5. Non-Farm Payroll naming variations normalize correctly.
 * 6. CPI naming variations normalize correctly (distinguishing Core vs Headline).
 * 7. Missing required fields are rejected.
 * 8. Invalid dates are rejected.
 * 9. Invalid times are rejected.
 * 10. Safety flags default to false/empty.
 * 11. No database mutation occurs.
 * 12. Existing India economic calendar services still work seamlessly.
 * 13. Existing 11 production economic events remain unchanged (11 upcoming, 0 released).
 */

import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';
import { forexEventNormalizer, SUPPORTED_USD_EVENTS } from '../src/services/forex/ForexEventNormalizer.js';
import { forexEventValidator } from '../src/services/forex/ForexEventValidator.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';

async function runForexArchitectureTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🌐 PHASE 7.1: FOREX ECONOMIC CALENDAR ARCHITECTURE & USD FOUNDATION');
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

  // ── TEST 1: Forex Service Initializes Successfully ────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: FOREX SERVICE INITIALIZATION & METADATA                         │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const status = await forexEconomicCalendarService.getForexCalendarStatus();
  assert('Forex service status retrieved successfully', status.service === 'ForexEconomicCalendarService');
  assert('Supported canonical USD events include all foundational indicator types', status.supportedUsdEvents.length >= 9);
  const isHealthy = (status.provider?.health?.status === 'healthy') || (status.providers && Object.values(status.providers).some(p => p.status === 'healthy'));
  assert('Provider health check returns healthy status', isHealthy);

  // ── TEST 2: Valid USD Event Passes Validation ─────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: VALID USD EVENT PASSES VALIDATION                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const validEvent = {
    country: 'United States',
    currency: 'USD',
    event_name: 'US Nonfarm Payrolls',
    event_date: '2026-09-04',
    event_time: '08:30',
    timezone: 'America/New_York',
    previous: '73000',
    forecast: '75000',
    actual: null,
    impact: 'high',
    status: 'upcoming'
  };
  const valRes = forexEventValidator.validateForexEvent(validEvent);
  assert('Valid USD NFP event passes validation', valRes.valid === true && valRes.errors.length === 0);
  assert('Normalized canonical name is "Non-Farm Payrolls"', valRes.normalizedEvent?.canonical_event_name === 'Non-Farm Payrolls');

  // ── TEST 3: Unsupported Currency Is Rejected ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: UNSUPPORTED CURRENCY IS REJECTED (Phase 7.1 Scope: USD Only)   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const eurEvent = {
    ...validEvent,
    currency: 'EUR',
    country: 'Eurozone'
  };
  const eurVal = forexEventValidator.validateForexEvent(eurEvent);
  assert('EUR currency is rejected in Phase 7.1', eurVal.valid === false && eurVal.errors.some(e => e.includes('Currency "EUR" is not supported')));

  // ── TEST 4: Unknown Event Is Rejected ─────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: UNKNOWN EVENT IS REJECTED (Strict No-Guessing Rule)             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const unknownEvent = {
    ...validEvent,
    event_name: 'Random Unofficial Housing Metric'
  };
  const unkVal = forexEventValidator.validateForexEvent(unknownEvent);
  assert('Unknown event is cleanly rejected with error', unkVal.valid === false && unkVal.errors.length > 0);

  // ── TEST 5: Non-Farm Payroll Naming Variations Normalize Correctly ────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: NON-FARM PAYROLL NAMING VARIATIONS NORMALIZATION                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const nfpVariations = [
    'Nonfarm Payrolls',
    'US Non-Farm Payrolls',
    'Non-Farm Employment Change',
    'US Nonfarm Payrolls',
    'NFP',
    'Total Nonfarm Payroll Employment'
  ];
  const allNfpMatched = nfpVariations.every(v => forexEventNormalizer.normalizeEventName(v) === 'Non-Farm Payrolls');
  assert('All 6 Non-Farm Payroll variations resolve to "Non-Farm Payrolls"', allNfpMatched);

  // ── TEST 6: CPI Naming Variations Normalize Correctly ─────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: CPI & CORE CPI NAMING VARIATIONS NORMALIZATION                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const cpiHeadline = ['Consumer Price Index', 'US CPI', 'CPI MoM', 'CPI YoY', 'Headline CPI'];
  const allCpiMatched = cpiHeadline.every(v => forexEventNormalizer.normalizeEventName(v) === 'CPI');
  assert('Headline CPI variations resolve to "CPI"', allCpiMatched);

  const coreCpiVariations = ['Core Consumer Price Index', 'US Core CPI', 'Core CPI MoM', 'Core CPI YoY', 'CPI Ex Food & Energy'];
  const allCoreMatched = coreCpiVariations.every(v => forexEventNormalizer.normalizeEventName(v) === 'Core CPI');
  assert('Core CPI variations resolve to "Core CPI"', allCoreMatched);

  // Other USD Canonical Events Mapping
  assert('Unemployment Rate resolves accurately', forexEventNormalizer.normalizeEventName('US Unemployment Rate') === 'Unemployment Rate');
  assert('PPI resolves accurately', forexEventNormalizer.normalizeEventName('Producer Price Index MoM') === 'PPI');
  assert('GDP resolves accurately', forexEventNormalizer.normalizeEventName('Gross Domestic Product Annualized') === 'GDP');
  assert('Retail Sales resolves accurately', forexEventNormalizer.normalizeEventName('Advance Retail Sales') === 'Retail Sales');
  assert('Initial Jobless Claims resolves accurately', forexEventNormalizer.normalizeEventName('Weekly Initial Jobless Claims') === 'Initial Jobless Claims');
  assert('FOMC Rate Decision resolves accurately', forexEventNormalizer.normalizeEventName('Federal Funds Target Rate') === 'FOMC Interest Rate Decision');

  // ── TEST 7: Missing Required Fields Are Rejected ──────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: MISSING REQUIRED FIELDS ARE REJECTED                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const missingDate = { ...validEvent, event_date: null };
  const missingDateVal = forexEventValidator.validateForexEvent(missingDate);
  assert('Missing event_date is rejected', missingDateVal.valid === false && missingDateVal.errors.some(e => e.includes('date')));

  const missingTime = { ...validEvent, event_time: '' };
  const missingTimeVal = forexEventValidator.validateForexEvent(missingTime);
  assert('Missing event_time is rejected', missingTimeVal.valid === false && missingTimeVal.errors.some(e => e.includes('time')));

  // ── TEST 8: Invalid Dates Are Rejected ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: INVALID DATES ARE REJECTED                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const badDate1 = { ...validEvent, event_date: '2026-02-31' }; // Feb 31 does not exist
  const badDate1Val = forexEventValidator.validateForexEvent(badDate1);
  assert('Non-existent calendar date (Feb 31) is rejected', badDate1Val.valid === false);

  const badDate2 = { ...validEvent, event_date: '04-09-2026' }; // Wrong format
  const badDate2Val = forexEventValidator.validateForexEvent(badDate2);
  assert('Non-ISO date format (04-09-2026) is rejected', badDate2Val.valid === false);

  // ── TEST 9: Invalid Times Are Rejected ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: INVALID TIMES ARE REJECTED                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const badTime1 = { ...validEvent, event_time: '25:70' }; // Invalid hour/min
  const badTime1Val = forexEventValidator.validateForexEvent(badTime1);
  assert('Invalid time 25:70 is rejected', badTime1Val.valid === false);

  const badTime2 = { ...validEvent, event_time: '8:30 AM' }; // Not 24-hour HH:MM
  const badTime2Val = forexEventValidator.validateForexEvent(badTime2);
  assert('Non 24-hour time 8:30 AM is rejected', badTime2Val.valid === false);

  // ── TEST 10: Safety Flags Audit ──────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: FOREX SAFETY FLAGS AUDIT                                       │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('FOREX_CALENDAR_ENABLED is a valid boolean', typeof flags.forexCalendarEnabled === 'boolean');
  assert('FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false by default', flags.forexLiveIngestionEnabled === false);
  assert('FOREX_CALENDAR_CANARY_CURRENCIES is empty by default', flags.canaryCurrencies.length === 0);

  // ── TEST 11: No Database Mutation Occurs ──────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: PROCESS INCOMING FOREX EVENT SAFETY (Dry-Run Only)             │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const processRes = forexEconomicCalendarService.processIncomingForexEvent(validEvent);
  assert('Process returns dry_run_only due to disabled live ingestion',
    processRes.success === true && processRes.status === 'dry_run_only' && processRes.reason === 'FOREX_LIVE_INGESTION_DISABLED');

  // ── TEST 12: Existing India Calendar Subsystems Unaffected ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 12: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const scheduleGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('IndiaCalendarScheduleService generates schedule without issues', scheduleGen.events && scheduleGen.events.length > 0);

  const cpiNorm = officialReleaseIngestionService.getCanonicalIndicatorName('CPI Inflation');
  assert('OfficialReleaseIngestionService resolves Indian CPI Inflation', cpiNorm === 'CPI Inflation');

  // ── TEST 13: Production Database Integrity & Baseline Check ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 13: PRODUCTION DATABASE INTEGRITY VERIFICATION                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 FOREX ARCHITECTURE TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`FOREX_CALENDAR_ENABLED=${flags.forexCalendarEnabled}`);
  console.log(`FOREX_CALENDAR_LIVE_INGESTION_ENABLED=${flags.forexLiveIngestionEnabled}`);
  console.log(`FOREX_CALENDAR_CANARY_CURRENCIES="${flags.rawCanaryCurrencies}"`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.1 FOREX ARCHITECTURE TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runForexArchitectureTests().catch(console.error);
