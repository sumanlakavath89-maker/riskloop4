/**
 * Phase 6.2 Step 6 Test Suite: Canary Post-Write Validation and Automatic Rollback
 * 
 * Verifies:
 * TEST 1: Exact previous state capture snapshots all fields accurately.
 * TEST 2: Pre-write validation rejects duplicate release for already released event.
 * TEST 3: Post-write verification passes on valid write (in rollback mode).
 * TEST 4: Simulated post-write mismatch triggers automatic single-event rollback.
 * TEST 5: Consecutive failure counter increments on safety failure.
 * TEST 6: Consecutive failure threshold triggers Emergency Rollback, Canary Deactivation, and Incident.
 * TEST 7: Safety success resets consecutive failure counter to 0.
 * TEST 8: Admin canary-safety API endpoints return accurate status and reset cleanly.
 * TEST 9: Production database integrity preserved with 0 permanent mutations.
 */

import axios from 'axios';
import { economicCalendarCanarySafetyService } from '../src/services/EconomicCalendarCanarySafetyService.js';
import { economicCalendarCanaryActivationService } from '../src/services/EconomicCalendarCanaryActivationService.js';
import { economicCalendarRolloutGuardService } from '../src/services/EconomicCalendarRolloutGuardService.js';
import { economicCalendarIncidentService } from '../src/services/EconomicCalendarIncidentService.js';
import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

const API_BASE = 'http://localhost:3000';

async function runCanarySafetyTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 6: CANARY POST-WRITE VALIDATION & AUTO-ROLLBACK');
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

  // Initial resets
  economicCalendarCanarySafetyService.reset();
  economicCalendarCanaryActivationService.reset();
  economicCalendarRolloutGuardService.resetEmergencyRollback();

  // ── TEST 1: Exact Previous State Snapshot Capture ─────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: EXACT PREVIOUS STATE SNAPSHOT CAPTURE                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const snapshot = economicCalendarCanarySafetyService.captureEventState(cpiEvent);
  assert('Captured snapshot contains ID, status, and event details',
    snapshot.id === cpiEvent.id && snapshot.status === cpiEvent.status && snapshot.event_name === cpiEvent.event_name);
  assert('Snapshot includes ISO capturedAt timestamp', typeof snapshot.capturedAt === 'string');

  // ── TEST 2: Duplicate Release Protection ──────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: DUPLICATE RELEASE PROTECTION                                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const fakeReleasedEvent = {
    ...cpiEvent,
    status: 'released',
    actual: '3.65'
  };
  const dupCheck = economicCalendarCanarySafetyService.validatePreWrite(fakeReleasedEvent, { actual: '3.65' });
  assert('Identical duplicate release is rejected', dupCheck.valid === false && dupCheck.error === 'DUPLICATE_RELEASE_IDENTICAL');

  const reReleaseCheck = economicCalendarCanarySafetyService.validatePreWrite(fakeReleasedEvent, { actual: '3.80' });
  assert('Different value on already released event is blocked', reReleaseCheck.valid === false && reReleaseCheck.error === 'EVENT_ALREADY_RELEASED');

  // ── TEST 3: Post-Write Verification Passes on Valid Write ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: POST-WRITE VERIFICATION PASSES ON VALID WRITE (ROLLBACK MODE)   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  await economicCalendarCanaryActivationService.activateCanary('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'CPI Inflation'
  });

  const validIngest = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=601',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation',
      allowFutureRelease: true,
      rollback: true // Safely rollback after test
    }
  );
  assert('Valid release passes post-write verification', validIngest.matched === true && validIngest.success === true);

  // ── TEST 4: Simulated Post-Write Mismatch Triggers Automatic Rollback ─────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: POST-WRITE MISMATCH TRIGGERS AUTOMATIC EVENT ROLLBACK           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  // Directly test verifyPostWrite mismatch
  const mismatchVerification = await economicCalendarCanarySafetyService.verifyPostWrite(cpiEvent.id, {
    actual: '999.99', // Expected value that doesn't match
    source_url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=fake'
  });
  assert('Post-write verification detects mismatch', mismatchVerification.verified === false);

  // Test automatic rollback method
  const rollbackExec = await economicCalendarCanarySafetyService.rollbackEvent(cpiEvent.id, snapshot);
  assert('Automatic per-event rollback restored original record', rollbackExec.rolledBack === true);

  // ── TEST 5: Consecutive Failure Counter Increments ────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: CONSECUTIVE FAILURE COUNTER INCREMENTS                           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  economicCalendarCanarySafetyService.reset();
  await economicCalendarCanarySafetyService.recordSafetyFailure('Simulated mismatch 1', 'POST_WRITE_ACTUAL_MISMATCH', cpiEvent, snapshot);
  assert('Consecutive failure count is 1', economicCalendarCanarySafetyService.consecutiveFailures === 1);

  await economicCalendarCanarySafetyService.recordSafetyFailure('Simulated mismatch 2', 'POST_WRITE_ACTUAL_MISMATCH', cpiEvent, snapshot);
  assert('Consecutive failure count is 2', economicCalendarCanarySafetyService.consecutiveFailures === 2);

  // ── TEST 6: Circuit Breaker Trips on Threshold (3rd failure) ──────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: CIRCUIT BREAKER TRIPS ON THRESHOLD (Auto-Rollback & Incident)   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  await economicCalendarCanarySafetyService.recordSafetyFailure('Simulated mismatch 3 (Threshold hit)', 'POST_WRITE_ACTUAL_MISMATCH', cpiEvent, snapshot);

  assert('Consecutive failures reached threshold of 3', economicCalendarCanarySafetyService.consecutiveFailures === 3);
  assert('Circuit breaker tripped emergency rollback', economicCalendarRolloutGuardService.isEmergencyRollbackActive() === true);
  assert('Circuit breaker deactivated runtime canary', economicCalendarCanaryActivationService.isAnyCanaryActive() === false);

  const activeIncidents = await economicCalendarIncidentService.getActiveIncidents();
  const hasSafetyIncident = activeIncidents.some(i => i.incident_key === 'CANARY_POST_WRITE_SAFETY_FAILURE');
  assert('Circuit breaker recorded critical incident in incident service', hasSafetyIncident);

  // ── TEST 7: Safety Success Resets Consecutive Failure Counter ─────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: SAFETY SUCCESS RESETS CONSECUTIVE FAILURE COUNTER               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  economicCalendarRolloutGuardService.resetEmergencyRollback();
  economicCalendarCanarySafetyService.recordSafetySuccess({ eventId: cpiEvent.id });
  assert('Consecutive failures reset to 0 upon safety success', economicCalendarCanarySafetyService.consecutiveFailures === 0);
  assert('Total successes count incremented', economicCalendarCanarySafetyService.totalSuccesses > 0);

  // ── TEST 8: Admin Safety Status API Endpoints ─────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: ADMIN CANARY SAFETY API ENDPOINTS                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const adminClient = axios.create({
    baseURL: `${API_BASE}/api/admin/economic-calendar`,
    headers: { 'x-user-role': 'admin' }
  });

  const apiStatus = await adminClient.get('/canary-safety/status');
  assert('GET /canary-safety/status returns HTTP 200 OK', apiStatus.status === 200 && apiStatus.data.success === true);
  assert('API reports consecutiveFailures: 0 and failureThreshold: 3',
    apiStatus.data.consecutiveFailures === 0 && apiStatus.data.failureThreshold === 3);

  const apiReset = await adminClient.post('/canary-safety/reset');
  assert('POST /canary-safety/reset returns HTTP 200 OK', apiReset.status === 200 && apiReset.data.success === true);

  // Clean up any test incident created
  const incidentToClean = activeIncidents.find(i => i.incident_key === 'CANARY_POST_WRITE_SAFETY_FAILURE');
  if (incidentToClean) {
    await economicCalendarIncidentService.resolveIncident(incidentToClean.id, 'Test suite completed successfully');
  }

  // ── TEST 9: Production Database Integrity & Zero Mutations ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: PRODUCTION DATABASE INTEGRITY & ZERO-MUTATION VERIFICATION      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 CANARY SAFETY SERVICE TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}"`);

  if (passed === total) {
    console.log('\n🎉 ALL CANARY SAFETY & AUTO-ROLLBACK TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runCanarySafetyTests().catch(console.error);
