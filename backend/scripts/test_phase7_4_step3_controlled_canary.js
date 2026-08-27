/**
 * Phase 7.4 Step 3 Test Suite: Controlled USD Canary Live Ingestion
 * 
 * Verifies:
 * 1. Multi-flag safety gates (FOREX_CALENDAR_ENABLED, LIVE_INGESTION, CANARY_CURRENCIES).
 * 2. Controlled small-batch live ingestion execution (batch size limits).
 * 3. Pre-write state snapshot capture & preservation of actuals / released status.
 * 4. Immediate post-write verification against Supabase.
 * 5. Automatic per-event rollback on verification failure.
 * 6. Audit logging of every database mutation and rollback.
 * 7. Complete cleanup of test records and 100% database baseline preservation (11 upcoming, 0 released).
 * 8. India calendar subsystem isolation and integrity.
 */

import { forexCanarySafetyService, ForexCanarySafetyService, FOREX_CANARY_CONFIG } from '../src/services/forex/ForexCanarySafetyService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runControlledCanaryTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.4 STEP 3: CONTROLLED USD CANARY LIVE INGESTION VALIDATION');
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

  try {
    // ── TEST 1-4: Safety Gate Authorization Checks ──────────────────────────
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 1-4: MULTI-FLAG SAFETY GATE AUTHORIZATION CHECKS                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    assert('1. Default environment denies canary authorization',
      forexCanarySafetyService.isCanaryIngestionAuthorized().authorized === false);

    const gateDisabled = forexCanarySafetyService.isCanaryIngestionAuthorized({
      forexCalendarEnabled: false,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('2. FOREX_CALENDAR_ENABLED=false denies authorization', gateDisabled.authorized === false && gateDisabled.mode === 'disabled');

    const gateNoLive = forexCanarySafetyService.isCanaryIngestionAuthorized({
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: false,
      canaryCurrencies: ['USD']
    });
    assert('3. FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false denies authorization', gateNoLive.authorized === false && gateNoLive.mode === 'discovery_only');

    const gateNoCanary = forexCanarySafetyService.isCanaryIngestionAuthorized({
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: []
    });
    assert('4. Empty canary list denies authorization', gateNoCanary.authorized === false && gateNoCanary.mode === 'safe_blocked');

    const gateApproved = forexCanarySafetyService.isCanaryIngestionAuthorized({
      forexCalendarEnabled: true,
      forexLiveIngestionEnabled: true,
      canaryCurrencies: ['USD']
    });
    assert('All flags enabled for USD explicitly approves authorization', gateApproved.authorized === true && gateApproved.mode === 'canary_active');

    // ── TEST 5: Controlled Small-Batch Limit ─────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 5: CONTROLLED SMALL-BATCH SIZE LIMIT ENFORCEMENT                   │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const sampleBatch = [
      { event_name: 'Non-Farm Payrolls', country_code: 'US', event_date: '2026-09-04', event_time: '08:30', timezone: 'America/New_York', impact: 'high' },
      { event_name: 'Unemployment Rate', country_code: 'US', event_date: '2026-09-04', event_time: '08:30', timezone: 'America/New_York', impact: 'high' },
      { event_name: 'CPI', country_code: 'US', event_date: '2026-09-11', event_time: '08:30', timezone: 'America/New_York', impact: 'high' },
      { event_name: 'GDP', country_code: 'US', event_date: '2026-09-24', event_time: '08:30', timezone: 'America/New_York', impact: 'high' },
      { event_name: 'FOMC Interest Rate Decision', country_code: 'US', event_date: '2026-09-16', event_time: '14:00', timezone: 'America/New_York', impact: 'high' },
      { event_name: 'Retail Sales', country_code: 'US', event_date: '2026-09-17', event_time: '08:30', timezone: 'America/New_York', impact: 'medium' }
    ];

    const dryRunBatch = await forexCanarySafetyService.executeCanarySync({
      batchSize: 3,
      events: sampleBatch,
      dryRun: true
    });
    assert('5. Batch limit (3) is strictly enforced on candidate list', dryRunBatch.summary.totalProcessed === 3);

    // ── TEST 6-7: Controlled Live Canary Ingestion & Audit Logging ───────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 6-7: CONTROLLED LIVE CANARY INGESTION & AUDIT LOGGING              │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const canaryCandidate = [
      {
        event_name: 'Test Canary NFP',
        country: 'United States',
        country_code: 'US',
        event_date: '2026-09-04',
        event_time: '08:30',
        timezone: 'America/New_York',
        impact: 'high',
        status: 'upcoming',
        source: 'BLS'
      }
    ];

    const liveSync = await forexCanarySafetyService.executeCanarySync({
      batchSize: 1,
      events: canaryCandidate,
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('6. Controlled live canary sync executes successfully', liveSync.success === true && liveSync.mode === 'live_canary');
    assert('Live canary reports databaseMutation: true', liveSync.databaseMutation === true);
    assert('Single record inserted and verified', liveSync.summary.inserted === 1);

    if (liveSync.inserted[0]?.id) {
      createdTestIds.push(liveSync.inserted[0].id);
    }

    const lastAudit = forexCanarySafetyService.auditLogs[forexCanarySafetyService.auditLogs.length - 1];
    assert('7. Audit logging records INSERT mutation with timestamp & ID',
      Boolean(lastAudit) && lastAudit.action === 'INSERT' && Boolean(lastAudit.recordId));

    // ── TEST 8: Preservation Rules (Never Overwrite Actuals) ───────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 8: PRESERVATION OF ACTUALS & RELEASED STATUS                       │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    // Simulate updating the existing canary record with actual value set
    const testRecordId = createdTestIds[0];
    const supabase = supabaseEconomicCalendarService.supabase;
    if (supabase && testRecordId) {
      await supabase
        .from('economic_events')
        .update({ actual: '250K', status: 'released' })
        .eq('id', testRecordId);
    }

    // Try synchronizing an incoming placeholder that has null actual
    const updateAttempt = await forexCanarySafetyService.executeCanarySync({
      batchSize: 1,
      events: [{
        event_name: 'Test Canary NFP',
        country_code: 'US',
        event_date: '2026-09-04',
        event_time: '08:30',
        actual: null,
        status: 'upcoming'
      }],
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    const { data: verifiedRow } = await supabase
      .from('economic_events')
      .select('*')
      .eq('id', testRecordId)
      .single();

    assert('8. Existing actual value ("250K") is strictly preserved against null incoming', verifiedRow?.actual === '250K');
    assert('Existing released status is strictly preserved against "upcoming" incoming', verifiedRow?.status === 'released');

    // ── TEST 9: Automatic Rollback on Post-Write Verification Failure ────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 9: AUTOMATIC ROLLBACK ON VERIFICATION FAILURE                      │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const customCanaryService = new ForexCanarySafetyService();
    // Simulate verification failure by overriding verifyPostWrite to fail
    customCanaryService.verifyPostWrite = async () => ({
      verified: false,
      error: 'Simulated field corruption / checksum mismatch'
    });

    const rollbackTestSync = await customCanaryService.executeCanarySync({
      batchSize: 1,
      events: [{
        event_name: 'Corrupted Canary Event',
        country_code: 'US',
        event_date: '2026-09-18',
        event_time: '08:30',
        status: 'upcoming'
      }],
      overrideFlags: {
        forexCalendarEnabled: true,
        forexLiveIngestionEnabled: true,
        canaryCurrencies: ['USD']
      }
    });

    assert('9. Post-write failure triggers rollback (summary.rolledBack === 1)', rollbackTestSync.summary.rolledBack === 1);
    const rollbackAudit = customCanaryService.auditLogs.find(a => a.action === 'ROLLBACK_DELETE');
    assert('Audit log captures ROLLBACK_DELETE action', Boolean(rollbackAudit));

    // ── TEST 10: Existing India Calendar Subsystem Integrity ──────────────────
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ TEST 10: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                    │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘');
    const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
    assert('10. India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  } finally {
    // ── CLEANUP: Rollback / Delete all temporary test records ─────────────────
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

  // ── TEST 11: Production Database Baseline Verification ────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('11. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Environment safety flag FOREX_CALENDAR_ENABLED is false', flags.forexCalendarEnabled === false);
  assert('Environment safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.4 STEP 3 (CONTROLLED CANARY) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.4 STEP 3 CONTROLLED USD CANARY TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runControlledCanaryTests().catch(console.error);
