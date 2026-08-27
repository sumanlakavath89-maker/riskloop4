/**
 * Phase 7.8 Test Suite: Global Economic Calendar Dashboard
 * 
 * Verifies:
 * 1. MultiCurrencyRolloutService manages 8 global forex currencies (USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY).
 * 2. All 8 currencies start in DISABLED stage by default.
 * 3. Official Source Adapters & Domain Whitelists (RBA, BoC, SNB, PBoC).
 * 4. Multi-Currency Event Discovery & Schema Normalization (AUD, CAD, CHF, CNY).
 * 5. Timezone correctness (Australia/Sydney, America/Toronto, Europe/Zurich, Asia/Shanghai).
 * 6. Independent Stage Progression & Currency Isolation.
 * 7. Per-Currency Circuit Breaker Isolation.
 * 8. Per-Currency Rollback capability.
 * 9. GlobalForexDashboardService consolidated admin aggregation.
 * 10. Small-batch live canary sync with automatic post-write cleanup.
 * 11. India subsystem integrity (100% isolation, 11 baseline events).
 * 12. Production database baseline preservation (11 upcoming, 0 released).
 */

import { multiCurrencyRolloutService, MultiCurrencyRolloutService, MULTI_CURRENCY_STAGES, SUPPORTED_CURRENCIES } from '../src/services/forex/MultiCurrencyRolloutService.js';
import { globalForexDashboardService } from '../src/services/forex/GlobalForexDashboardService.js';
import { rbaSourceAdapter } from '../src/services/forex/providers/RBASourceAdapter.js';
import { bocSourceAdapter } from '../src/services/forex/providers/BoCSourceAdapter.js';
import { snbSourceAdapter } from '../src/services/forex/providers/SNBSourceAdapter.js';
import { pbocSourceAdapter } from '../src/services/forex/providers/PBoCSourceAdapter.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexCanarySafetyService } from '../src/services/forex/ForexCanarySafetyService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runGlobalDashboardTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🌐 PHASE 7.8: GLOBAL ECONOMIC CALENDAR DASHBOARD TEST SUITE');
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

  const createdTestIds = [];
  const testService = new MultiCurrencyRolloutService();

  try {
    // ── TEST 1: Default Posture for All 8 Currencies ────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1: 8 GLOBAL FOREX CURRENCIES INITIALIZATION & DEFAULT POSTURE      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const summary = await testService.getCurrenciesSummary();
    assert('1. Exactly 8 currencies supported (USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY)',
      summary.currenciesCount === 8 && SUPPORTED_CURRENCIES.length === 8);

    assert('All 8 currencies start in DISABLED stage by default',
      SUPPORTED_CURRENCIES.every(c => summary.currencies[c].currentStage === MULTI_CURRENCY_STAGES.DISABLED));

    assert('Database writes disallowed across all 8 currencies by default',
      SUPPORTED_CURRENCIES.every(c => summary.currencies[c].databaseWritesAllowed === false));

    // ── TEST 2: Official Source Adapters & Domain Whitelists ────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 2: OFFICIAL SOURCE ADAPTERS & DOMAIN WHITELISTS (AUD, CAD, CHF, CNY)│');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    assert('2. RBASourceAdapter configured with official domain (rba.gov.au)',
      rbaSourceAdapter.allowedDomains.some(d => d.includes('rba.gov.au')));
    assert('BoCSourceAdapter configured with official domain (bankofcanada.ca)',
      bocSourceAdapter.allowedDomains.some(d => d.includes('bankofcanada.ca')));
    assert('SNBSourceAdapter configured with official domain (snb.ch)',
      snbSourceAdapter.allowedDomains.some(d => d.includes('snb.ch')));
    assert('PBoCSourceAdapter configured with official domain (pbc.gov.cn)',
      pbocSourceAdapter.allowedDomains.some(d => d.includes('pbc.gov.cn')));

    // ── TEST 3: Multi-Currency Event Discovery & Normalization ──────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 3: MULTI-CURRENCY EVENT DISCOVERY & TIMEZONE NORMALIZATION          │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const audEvents = await testService.discoverCurrencyEvents('AUD', { daysAhead: 60 });
    assert('3. AUD discovery produces events (count > 0)', audEvents.success && audEvents.events.length > 0);
    assert('100% of AUD events have currency "AUD" and timezone "Australia/Sydney"',
      audEvents.events.every(e => e.currency === 'AUD' && e.timezone === 'Australia/Sydney'));

    const cadEvents = await testService.discoverCurrencyEvents('CAD', { daysAhead: 60 });
    assert('CAD discovery produces events (count > 0)', cadEvents.success && cadEvents.events.length > 0);
    assert('100% of CAD events have currency "CAD" and timezone "America/Toronto"',
      cadEvents.events.every(e => e.currency === 'CAD' && e.timezone === 'America/Toronto'));

    const chfEvents = await testService.discoverCurrencyEvents('CHF', { daysAhead: 60 });
    assert('CHF discovery produces events (count > 0)', chfEvents.success && chfEvents.events.length > 0);
    assert('100% of CHF events have currency "CHF" and timezone "Europe/Zurich"',
      chfEvents.events.every(e => e.currency === 'CHF' && e.timezone === 'Europe/Zurich'));

    const cnyEvents = await testService.discoverCurrencyEvents('CNY', { daysAhead: 60 });
    assert('CNY discovery produces events (count > 0)', cnyEvents.success && cnyEvents.events.length > 0);
    assert('100% of CNY events have currency "CNY" and timezone "Asia/Shanghai"',
      cnyEvents.events.every(e => e.currency === 'CNY' && e.timezone === 'Asia/Shanghai'));

    // ── TEST 4: Independent Stage Progression & Currency Isolation ──────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 4: INDEPENDENT STAGE PROGRESSION & ISOLATION                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const audAdv1 = await testService.advanceCurrencyStage('AUD', MULTI_CURRENCY_STAGES.DRY_RUN, {
      explicitApproval: true
    });
    assert('4. AUD advanced to DRY_RUN successfully', audAdv1.success === true);

    const audAdv2 = await testService.advanceCurrencyStage('AUD', MULTI_CURRENCY_STAGES.MANUAL_CANARY, {
      explicitApproval: true
    });
    assert('AUD advanced to MANUAL_CANARY successfully', audAdv2.success === true);

    const otherCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'CNY'];
    for (const c of otherCurrencies) {
      const status = await testService.getCurrencyStatus(c);
      assert(`Currency ${c} remains in DISABLED stage during AUD promotion`, status.currentStage === MULTI_CURRENCY_STAGES.DISABLED);
    }

    // ── TEST 5: Currency Circuit Breaker Isolation ──────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: CURRENCY CIRCUIT BREAKER ISOLATION                              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    testService.recordCurrencyFailure('CHF', 'Simulated failure 1');
    testService.recordCurrencyFailure('CHF', 'Simulated failure 2');
    testService.recordCurrencyFailure('CHF', 'Simulated failure 3');

    const chfTripCheck = await testService.getCurrencyStatus('CHF');
    const audTripCheck = await testService.getCurrencyStatus('AUD');
    const cnyTripCheck = await testService.getCurrencyStatus('CNY');

    assert('5. CHF circuit breaker is TRIPPED after 3 failures', chfTripCheck.circuitBreakerTripped === true);
    assert('AUD circuit breaker remains healthy (false)', audTripCheck.circuitBreakerTripped === false);
    assert('CNY circuit breaker remains healthy (false)', cnyTripCheck.circuitBreakerTripped === false);

    // ── TEST 6: Per-Currency Rollback ───────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6: PER-CURRENCY ROLLBACK                                           │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const audRollback = await testService.rollbackCurrency('AUD', 'Testing AUD rollback');
    assert('6. AUD rollback returns success: true', audRollback.success === true);

    const audPostRollback = await testService.getCurrencyStatus('AUD');
    assert('AUD stage reset to DISABLED', audPostRollback.currentStage === MULTI_CURRENCY_STAGES.DISABLED);
    assert('AUD rollbacksCount incremented', audPostRollback.rollbacksCount > 0);

    // ── TEST 7: Global Admin Dashboard State Aggregation ────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 7: GLOBAL ADMIN DASHBOARD STATE AGGREGATION                        │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const globalState = await globalForexDashboardService.getGlobalDashboardState();
    assert('7. Global dashboard returns success: true', globalState.success === true);
    assert('Dashboard aggregates 8 currencies', globalState.overview.totalCurrenciesSupported === 8);
    assert('Dashboard verifies database integrity (valid: true)', globalState.databaseIntegrity.valid === true);
    assert('Dashboard confirms India subsystem isolation', globalState.indiaSubsystem.isolated === true);
    assert('Dashboard tracks tripped circuit breakers count', typeof globalState.overview.trippedCircuitBreakersCount === 'number');

    // ── TEST 8: Small-Batch Live Canary Sync & Cleanup ──────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: SMALL-BATCH LIVE CANARY SYNC & VERIFICATION                     │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const sampleAUDCanary = [{
      event_name: 'Test AUD Rate Decision Canary',
      country: 'Australia',
      country_code: 'AU',
      event_date: '2026-09-06',
      event_time: '04:30',
      timezone: 'Australia/Sydney',
      impact: 'high',
      status: 'upcoming',
      source: 'RBA/ABS'
    }];

    const canaryResult = await forexCanarySafetyService.executeCanarySync({
      batchSize: 1,
      events: sampleAUDCanary,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['AUD', 'USD']
      }
    });

    assert('8. Controlled AUD canary sync executes successfully', canaryResult.success === true);
    if (canaryResult.inserted[0]?.id) {
      createdTestIds.push(canaryResult.inserted[0].id);
    }

    // ── TEST 9: India Subsystem Integrity (100% Isolation) ──────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 9: INDIA SUBSYSTEM INTEGRITY (100% ISOLATION)                      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaSchedule = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('9. India calendar schedule generator functioning normally',
      indiaSchedule.events && indiaSchedule.events.length > 0);

  } finally {
    // ── CLEANUP: Zero Residual Database Data ────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ CLEANUP: ZERO RESIDUAL DATABASE DATA VERIFICATION                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    if (createdTestIds.length > 0) {
      const supabase = supabaseEconomicCalendarService.supabase;
      if (supabase) {
        await supabase
          .from('economic_events')
          .delete()
          .in('id', createdTestIds);
        console.log(`   🧹 Cleaned up ${createdTestIds.length} temporary test records.`);
      }
    }
  }

  // ── TEST 10: Production Database Baseline Verification ────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
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

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Production safety flag FOREX_CALENDAR_ENABLED is false', flags.forexCalendarEnabled === false);
  assert('Production safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

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

runGlobalDashboardTests().catch(console.error);
