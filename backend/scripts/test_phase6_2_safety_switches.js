/**
 * Phase 6.2 Step 1 Test Suite: Production Safety Switches
 * 
 * Verifies:
 * Test A: LIVE_INGESTION_ENABLED=false -> valid release discovered but public.economic_events is NOT mutated.
 *         Returns status: 'dry_run_only', reason: 'LIVE_INGESTION_DISABLED'.
 * Test B: LIVE_INGESTION_ENABLED=true -> live ingestion path is permitted in a safe rollback mode.
 * Test C: Full regression suite passes without modifying economic_events.
 */

import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runSafetySwitchTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 1: PRODUCTION SAFETY SWITCHES VALIDATION');
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

  // ── TEST A: LIVE_INGESTION_ENABLED=false ──────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST A: LIVE INGESTION DISABLED (ECONOMIC_CALENDAR_LIVE_INGESTION=false)│');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');

  const cpiEvent = baseline.find(e => e.event_name.includes('CPI')) || { event_date: '2026-09-14' };

  const simulatedCpiRelease = {
    eventName: 'CPI Inflation',
    actual: '3.65',
    previous: '3.54',
    unit: '%',
    sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=999999',
    source: 'Ministry of Statistics and Programme Implementation (MoSPI)',
    releaseDate: cpiEvent.event_date
  };

  const blockedResult = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    simulatedCpiRelease,
    {
      overrideLiveIngestion: false,
      allowFutureRelease: true,
      dryRun: false,
      rollback: false
    }
  );

  assert('Safety switch intercepted live database mutation',
    blockedResult.status === 'dry_run_only' && blockedResult.reason === 'LIVE_INGESTION_DISABLED');

  assert('Simulation payload returned without database write',
    blockedResult.simulatedRecord && blockedResult.simulatedRecord.actual === '3.65');

  // Verify database record in Supabase remains 'upcoming'
  const afterBlocked = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const afterBlockedReleased = afterBlocked.filter(e => e.status === 'released').length;
  assert('Database table has 0 released events after intercepted attempt', afterBlockedReleased === 0);

  // ── TEST B: LIVE_INGESTION_ENABLED=true (Controlled Rollback) ────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST B: LIVE INGESTION ENABLED (Controlled Rollback Test)               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');

  const allowedResult = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    simulatedCpiRelease,
    {
      overrideLiveIngestion: true,
      allowFutureRelease: true,
      dryRun: false,
      rollback: true // Immediately roll back for safety
    }
  );

  assert('Live ingestion path allowed when flag is enabled',
    allowedResult.matched === true && allowedResult.updatedRecord?.status === 'released');

  // Verify rollback restored status to upcoming
  const afterRollback = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const afterRollbackReleased = afterRollback.filter(e => e.status === 'released').length;
  assert('Database restored to upcoming state via rollback (0 released)', afterRollbackReleased === 0);

  // ── TEST C: Production Database Zero-Mutation Verification ────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST C: PRODUCTION DATABASE ZERO-MUTATION VERIFICATION                  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');

  const finalCheck = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const finalUpcoming = finalCheck.filter(e => e.status === 'upcoming').length;
  const finalReleased = finalCheck.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', finalCheck.length === baseline.length, `(${finalCheck.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', finalUpcoming === baselineUpcoming, `(${finalUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', finalReleased === baselineReleased, `(${finalReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 SAFETY SWITCH TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);

  if (passed === total) {
    console.log('\n🎉 ALL SAFETY SWITCH TESTS PASSED (100%). SAFEGUARDS VERIFIED.\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runSafetySwitchTests().catch(console.error);
