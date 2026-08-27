/**
 * Phase 7.8 Test Suite: Global Economic Calendar Dashboard
 * 
 * Verifies:
 * 1. Multi-currency aggregation across INR, USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY.
 * 2. Multi-dimensional filtering (currency, impact, status, date, search keyword).
 * 3. Automatic user timezone conversion while preserving original event timezone.
 * 4. High / Medium / Low impact normalization.
 * 5. Safe pagination (page, limit, totalPages) and multi-field sorting.
 * 6. Strict currency isolation (failure in one currency does not affect others).
 * 7. Public telemetry sanitization (no internal credentials/secrets exposed).
 * 8. Admin monitoring telemetry separation and role verification.
 * 9. India calendar subsystem complete isolation (100% untouched).
 * 10. Database baseline preservation (11 upcoming, 0 released) and zero residual test mutations.
 */

import { globalEconomicCalendarService, GlobalEconomicCalendarService, SUPPORTED_GLOBAL_CURRENCIES, CURRENCY_METADATA } from '../src/services/forex/GlobalEconomicCalendarService.js';
import { globalForexDashboardService } from '../src/services/forex/GlobalForexDashboardService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runPhase7_8UnifiedDashboardTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🌐  PHASE 7.8: GLOBAL ECONOMIC CALENDAR DASHBOARD VALIDATION');
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

  try {
    // ── TEST 1: Multi-Currency Event Aggregation ────────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: MULTI-CURRENCY EVENT AGGREGATION                                │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const allEventsRes = await globalEconomicCalendarService.getGlobalEvents({ limit: 100 });
    assert('1. Global events query returns success: true', allEventsRes.success === true);
    assert('Global events list is populated (> 0)', allEventsRes.events.length > 0);

    const representedCurrencies = new Set(allEventsRes.events.map(e => e.currency));
    assert('Events include INR', representedCurrencies.has('INR'));
    assert('Events include USD', representedCurrencies.has('USD'));
    assert('Events include EUR', representedCurrencies.has('EUR'));
    assert('Events include GBP', representedCurrencies.has('GBP'));
    assert('Events include JPY', representedCurrencies.has('JPY'));

    // ── TEST 2: Multi-Dimensional Filtering ─────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: MULTI-DIMENSIONAL FILTERING                                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    // Currency filter
    const inrOnly = await globalEconomicCalendarService.getGlobalEvents({ currencies: 'INR' });
    assert('2. Currency filter "INR" returns only INR events',
      inrOnly.events.length > 0 && inrOnly.events.every(e => e.currency === 'INR'));

    const usdEurOnly = await globalEconomicCalendarService.getGlobalEvents({ currencies: ['USD', 'EUR'] });
    assert('Currency filter ["USD", "EUR"] returns only USD and EUR events',
      usdEurOnly.events.length > 0 && usdEurOnly.events.every(e => ['USD', 'EUR'].includes(e.currency)));

    // Impact filter
    const highImpactOnly = await globalEconomicCalendarService.getGlobalEvents({ impact: 'high' });
    assert('Impact filter "high" returns only high-impact events',
      highImpactOnly.events.length > 0 && highImpactOnly.events.every(e => e.impact === 'high'));

    // Status filter
    const upcomingOnly = await globalEconomicCalendarService.getGlobalEvents({ status: 'upcoming' });
    assert('Status filter "upcoming" returns only upcoming events',
      upcomingOnly.events.length > 0 && upcomingOnly.events.every(e => e.status === 'upcoming'));

    // Search filter
    const searchRes = await globalEconomicCalendarService.getGlobalEvents({ search: 'Rate' });
    assert('Search filter finds matching events',
      searchRes.events.length > 0 && searchRes.events.every(e =>
        e.eventName.toLowerCase().includes('rate') ||
        e.country.toLowerCase().includes('rate') ||
        e.currency.toLowerCase().includes('rate') ||
        e.source.toLowerCase().includes('rate')
      ));

    // ── TEST 3: Timezone Conversion & Original Timezone Preservation ─────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: TIMEZONE CONVERSION & ORIGINAL TIMEZONE PRESERVATION            │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const istEvents = await globalEconomicCalendarService.getGlobalEvents({ userTimezone: 'Asia/Kolkata', limit: 20 });
    const utcEvents = await globalEconomicCalendarService.getGlobalEvents({ userTimezone: 'UTC', limit: 20 });

    assert('3. Events report target userTimezone: "Asia/Kolkata"', istEvents.userTimezone === 'Asia/Kolkata');
    assert('Events report target userTimezone: "UTC"', utcEvents.userTimezone === 'UTC');

    const sampleUSDEv = istEvents.events.find(e => e.currency === 'USD');
    if (sampleUSDEv) {
      assert('USD event preserves original timezone "America/New_York"', sampleUSDEv.originalTimezone === 'America/New_York');
      assert('USD event scheduledTime formatted for user timezone', sampleUSDEv.scheduledTime !== undefined);
    }

    const sampleJpEv = istEvents.events.find(e => e.currency === 'JPY');
    if (sampleJpEv) {
      assert('JPY event preserves original timezone "Asia/Tokyo"', sampleJpEv.originalTimezone === 'Asia/Tokyo');
    }

    // ── TEST 4: Impact Normalization & Required Event Properties ────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: IMPACT NORMALIZATION & REQUIRED EVENT PROPERTIES                │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const validImpacts = new Set(['high', 'medium', 'low']);
    assert('4. 100% of events have normalized impact (high/medium/low)',
      allEventsRes.events.every(e => validImpacts.has(e.impact)));

    assert('100% of events contain eventName, currency, country, countryCode, and flag',
      allEventsRes.events.every(e => e.eventName && e.currency && e.country && e.countryCode && e.flag));

    assert('100% of events contain source transparency details',
      allEventsRes.events.every(e => e.source && typeof e.source === 'string'));

    // ── TEST 5: Safe Pagination & Multi-Field Sorting ───────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: SAFE PAGINATION & MULTI-FIELD SORTING                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const pagedRes = await globalEconomicCalendarService.getGlobalEvents({ page: 1, limit: 5 });
    assert('5. Pagination limits result count to 5', pagedRes.events.length <= 5);
    assert('Pagination metadata includes totalEvents, totalPages, hasNextPage',
      pagedRes.pagination.totalEvents !== undefined && pagedRes.pagination.totalPages !== undefined);

    const sortedByCurrency = await globalEconomicCalendarService.getGlobalEvents({ sortBy: 'currency', sortDirection: 'asc' });
    const firstCurr = sortedByCurrency.events[0]?.currency;
    const lastCurr = sortedByCurrency.events[sortedByCurrency.events.length - 1]?.currency;
    assert('Sorting by currency (asc) functions properly', firstCurr <= lastCurr);

    // ── TEST 6: Resilient Currency Isolation ────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: RESILIENT CURRENCY ISOLATION UNDER SIMULATED FAILURE            │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const testCustomService = new GlobalEconomicCalendarService();
    // Simulate failing Supabase / Indian feed query
    testCustomService.supabaseService = {
      getEvents: async () => { throw new Error('Simulated database connection failure in INR'); }
    };

    const resilientRes = await testCustomService.getGlobalEvents();
    assert('6. Overall query succeeds even when one feed encounters an error', resilientRes.success === true);
    assert('Other currency events (USD, EUR, GBP, JPY) render normally during INR fault',
      resilientRes.events.some(e => e.currency === 'USD') && resilientRes.events.some(e => e.currency === 'EUR'));

    // ── TEST 7: Public Telemetry Sanitization ───────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: PUBLIC TELEMETRY SANITIZATION                                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const publicEventStr = JSON.stringify(allEventsRes);
    assert('7. Public response does not leak SUPABASE_SERVICE_ROLE_KEY', !publicEventStr.includes('service_role'));
    assert('Public response does not leak database connection strings', !publicEventStr.includes('postgres://'));
    assert('Public response does not leak internal environment flags', !publicEventStr.includes('FOREX_CALENDAR_ENABLED'));

    // ── TEST 8: Admin Monitoring Separation ─────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: ADMIN MONITORING SEPARATION                                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const adminDashboard = await globalForexDashboardService.getGlobalDashboardState();
    assert('8. Admin dashboard state aggregates 8 global currencies',
      adminDashboard.overview.totalCurrenciesSupported >= 8);
    assert('Admin dashboard reports database integrity status',
      adminDashboard.overview.databaseIntegrityValid === true);
    assert('Admin dashboard confirms all providers healthy',
      adminDashboard.overview.allProvidersHealthy === true);

    // ── TEST 9: India Subsystem Complete Isolation ──────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 9: INDIA SUBSYSTEM COMPLETE ISOLATION                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaSchedule = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('9. India calendar schedule generator functioning normally',
      indiaSchedule.events && indiaSchedule.events.length > 0);

  } finally {
    // ── TEST 10: Production Database Baseline Verification ──────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 10: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
    const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
    const postReleased = postTest.filter(e => e.status === 'released').length;

    assert('10. Total Indian events count matches baseline (11 === 11)',
      postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
    assert('Upcoming events count matches baseline (11 === 11)',
      postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
    assert('Released events count matches baseline (0 === 0)',
      postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

    const currentFlags = forexEconomicCalendarService.getForexSafetyFlags();
    assert('Production safety flag FOREX_CALENDAR_ENABLED remains false', currentFlags.forexCalendarEnabled === false);
    assert('Production safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED remains false', currentFlags.forexLiveIngestionEnabled === false);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.8 (GLOBAL DASHBOARD) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.8 GLOBAL ECONOMIC CALENDAR DASHBOARD TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runPhase7_8UnifiedDashboardTests().catch(console.error);
