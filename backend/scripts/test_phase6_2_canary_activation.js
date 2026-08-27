/**
 * Phase 6.2 Step 5 Test Suite: Canary Activation Workflow
 * 
 * Verifies:
 * TEST 1: Unsupported indicator cannot be prepared.
 * TEST 2: Supported CPI indicator prepares successfully.
 * TEST 3: Validation fails when emergency rollback is active.
 * TEST 4: Validation fails when live ingestion master switch is disabled.
 * TEST 5: Validation fails when CPI is not in configured canary whitelist.
 * TEST 6: Activation succeeds only when all required conditions are satisfied.
 * TEST 7: Runtime canary activation does not permanently modify .env.
 * TEST 8: Inactive runtime canary blocks database mutation.
 * TEST 9: Active runtime canary allows only approved indicator (rollback mode).
 * TEST 10: Other indicators remain blocked.
 * TEST 11: Deactivation immediately blocks further database writes.
 * TEST 12: Emergency rollback overrides active canary activation.
 * TEST 13: Admin APIs return correct activation status.
 * TEST 14: Production database integrity verification (0 mutations).
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { economicCalendarCanaryActivationService } from '../src/services/EconomicCalendarCanaryActivationService.js';
import { economicCalendarRolloutGuardService } from '../src/services/EconomicCalendarRolloutGuardService.js';
import { officialReleaseIngestionService } from '../src/services/OfficialReleaseIngestionService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');

const API_BASE = 'http://localhost:3000';

async function runCanaryActivationTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 6.2 STEP 5: CANARY ACTIVATION WORKFLOW VALIDATION');
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

  // Initial resets
  economicCalendarRolloutGuardService.resetEmergencyRollback();
  economicCalendarCanaryActivationService.reset();

  const envInitialContent = fs.readFileSync(ENV_PATH, 'utf8');

  // ── TEST 1: Unsupported Indicator Cannot Be Prepared ──────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: UNSUPPORTED INDICATOR CANNOT BE PREPARED                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const prepBad = economicCalendarCanaryActivationService.prepareCanaryActivation('Fake Indicator XYZ');
  assert('Unsupported indicator fails preparation', prepBad.success === false && prepBad.error === 'UNSUPPORTED_INDICATOR');

  // ── TEST 2: Supported CPI Indicator Prepares Successfully ─────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2: SUPPORTED CPI INDICATOR PREPARES SUCCESSFULLY                   │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const prepGood = economicCalendarCanaryActivationService.prepareCanaryActivation('CPI Inflation');
  assert('CPI Inflation prepares successfully with requirements checklist',
    prepGood.success === true && prepGood.indicator === 'CPI Inflation' && prepGood.preActivationRequirements.length > 0);

  // ── TEST 3: Validation Fails When Emergency Rollback Is Active ────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 3: VALIDATION FAILS WHEN EMERGENCY ROLLBACK IS ACTIVE              │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  economicCalendarRolloutGuardService.triggerEmergencyRollback('Test block');
  const valRollback = await economicCalendarCanaryActivationService.validateCanaryActivation('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'CPI Inflation'
  });
  assert('Emergency rollback blocks canary validation',
    valRollback.ready === false && valRollback.failures.some(f => f.id === 'emergency_rollback'));
  economicCalendarRolloutGuardService.resetEmergencyRollback();

  // ── TEST 4: Validation Fails When Master Switch Is Disabled ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 4: VALIDATION FAILS WHEN LIVE INGESTION MASTER SWITCH IS DISABLED  │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const valMaster = await economicCalendarCanaryActivationService.validateCanaryActivation('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: false,
    overrideCanaryList: 'CPI Inflation'
  });
  assert('Disabled master switch blocks canary validation',
    valMaster.ready === false && valMaster.failures.some(f => f.id === 'live_ingestion_flag'));

  // ── TEST 5: Validation Fails When CPI Not In Canary Whitelist ─────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: VALIDATION FAILS WHEN CPI NOT IN CONFIGURED CANARY WHITELIST     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const valWhitelist = await economicCalendarCanaryActivationService.validateCanaryActivation('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'IIP, WPI Inflation' // CPI omitted
  });
  assert('Omission from canary whitelist blocks validation',
    valWhitelist.ready === false && valWhitelist.failures.some(f => f.id === 'canary_whitelist'));

  // ── TEST 6: Activation Succeeds Only When All Conditions Are Satisfied ────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: ACTIVATION SUCCEEDS WHEN ALL CONDITIONS ARE SATISFIED           │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const actRes = await economicCalendarCanaryActivationService.activateCanary('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'CPI Inflation',
    user: 'lead-sre@riskloop.io'
  });
  assert('Runtime canary activated with status active: true',
    actRes.success === true && actRes.activation?.active === true && actRes.activation?.indicator === 'CPI Inflation');

  // ── TEST 7: Runtime Activation Does Not Permanently Modify .env ───────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: RUNTIME ACTIVATION DOES NOT MODIFY .env FILE                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const envAfterContent = fs.readFileSync(ENV_PATH, 'utf8');
  assert('.env file byte content remains 100% identical and unmutated', envInitialContent === envAfterContent);

  // ── TEST 8: Inactive Runtime Canary Blocks Database Mutation ──────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: INACTIVE RUNTIME CANARY BLOCKS DATABASE MUTATION                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  economicCalendarCanaryActivationService.deactivateCanary('Test inactive check');

  const blockedInactive = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=501',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation',
      enforceRuntimeCanary: true,
      overrideRuntimeCanaryActive: false,
      allowFutureRelease: true
    }
  );
  assert('Inactive runtime canary blocks mutation',
    blockedInactive.status === 'canary_blocked' && blockedInactive.reason === 'RUNTIME_CANARY_NOT_ACTIVATED');

  // ── TEST 9: Active Runtime Canary Allows Approved Indicator (Rollback) ────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: ACTIVE RUNTIME CANARY ALLOWS APPROVED INDICATOR (ROLLBACK MODE) │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  await economicCalendarCanaryActivationService.activateCanary('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'CPI Inflation',
    user: 'lead-sre@riskloop.io'
  });

  const allowedCpi = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=502',
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
  assert('CPI allowed through full priority hierarchy with rollback mode',
    allowedCpi.matched === true && allowedCpi.updatedRecord?.status === 'released');

  // ── TEST 10: Other Indicators Remain Blocked ──────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: OTHER INDICATORS REMAIN BLOCKED                                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const blockedIip = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'IIP',
      actual: '4.2',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=503',
      source: 'MoSPI',
      releaseDate: iipEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation', // Only CPI in whitelist
      allowFutureRelease: true
    }
  );
  assert('Non-approved IIP indicator blocked',
    blockedIip.status === 'canary_blocked');

  // ── TEST 11: Deactivation Immediately Blocks Further Database Writes ──────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 11: DEACTIVATION IMMEDIATELY BLOCKS FURTHER DATABASE WRITES        │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const deactRes = economicCalendarCanaryActivationService.deactivateCanary('Test deactivation');
  assert('Deactivation returns CANARY_DEACTIVATED status',
    deactRes.success === true && deactRes.status === 'CANARY_DEACTIVATED');

  const blockedAfterDeact = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=504',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation',
      enforceRuntimeCanary: true,
      allowFutureRelease: true
    }
  );
  assert('Database write blocked immediately following deactivation',
    blockedAfterDeact.status === 'canary_blocked');

  // ── TEST 12: Emergency Rollback Overrides Active Canary Activation ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 12: EMERGENCY ROLLBACK OVERRIDES ACTIVE CANARY ACTIVATION          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  await economicCalendarCanaryActivationService.activateCanary('CPI Inflation', {
    overrideHealth: { status: 'healthy' },
    overrideDbStatus: 'healthy',
    overrideLiveIngestion: true,
    overrideCanaryList: 'CPI Inflation'
  });
  economicCalendarRolloutGuardService.triggerEmergencyRollback('Emergency priority test');

  const blockedByEmergency = await officialReleaseIngestionService.matchAndUpdateSupabaseEvent(
    {
      eventName: 'CPI Inflation',
      actual: '3.65',
      unit: '%',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=505',
      source: 'MoSPI',
      releaseDate: cpiEvent.event_date
    },
    {
      overrideLiveIngestion: true,
      overrideCanaryIndicators: 'CPI Inflation',
      allowFutureRelease: true
    }
  );
  assert('Emergency rollback takes Priority 1 precedence over active canary',
    blockedByEmergency.status === 'blocked' && blockedByEmergency.reason === 'EMERGENCY_ROLLBACK_ACTIVE');

  economicCalendarRolloutGuardService.resetEmergencyRollback();
  economicCalendarCanaryActivationService.reset();

  // ── TEST 13: Admin APIs Return Correct Activation Status ──────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 13: ADMIN APIS RETURN CORRECT ACTIVATION STATUS                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const adminClient = axios.create({
    baseURL: `${API_BASE}/api/admin/economic-calendar`,
    headers: { 'x-user-role': 'admin' }
  });

  const apiPrep = await adminClient.get('/canary/prepare?indicator=CPI%20Inflation');
  assert('GET /canary/prepare returns HTTP 200 OK', apiPrep.status === 200 && apiPrep.data.success === true);

  const apiValidate = await adminClient.get('/canary/validate?indicator=CPI%20Inflation');
  assert('GET /canary/validate returns HTTP 200 OK', apiValidate.status === 200);

  const apiStatus = await adminClient.get('/canary/status');
  assert('GET /canary/status returns HTTP 200 OK', apiStatus.status === 200 && apiStatus.data.active === false);

  const apiDeact = await adminClient.post('/canary/deactivate', { reason: 'API test cleanup' });
  assert('POST /canary/deactivate returns HTTP 200 OK', apiDeact.status === 200 && apiDeact.data.success === true);

  // ── TEST 14: Production Database Integrity & Zero Mutations ───────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 14: PRODUCTION DATABASE INTEGRITY & ZERO-MUTATION VERIFICATION     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('Total events count unchanged', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming events count unchanged', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released events count unchanged (0 synthetic actuals)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 CANARY ACTIVATION WORKFLOW TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`ECONOMIC_CALENDAR_SCHEDULER_ENABLED=${process.env.ECONOMIC_CALENDAR_SCHEDULER_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED=${process.env.ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED || 'false'}`);
  console.log(`ECONOMIC_CALENDAR_CANARY_INDICATORS="${process.env.ECONOMIC_CALENDAR_CANARY_INDICATORS || ''}"`);

  if (passed === total) {
    console.log('\n🎉 ALL CANARY ACTIVATION WORKFLOW TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runCanaryActivationTests().catch(console.error);
