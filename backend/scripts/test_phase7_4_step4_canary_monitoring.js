/**
 * Phase 7.4 Step 4 Test Suite: Canary Monitoring and Production Readiness
 * 
 * Verifies:
 * 1. Persistent canary audit history recording, querying, and filtering.
 * 2. Real-time success, failure, and rollback metrics tracking.
 * 3. Provider health alerts and consecutive error detection.
 * 4. Deep database integrity checks (mandatory fields, duplicate keys, timezone consistency).
 * 5. Production readiness audit report generation & verdict evaluation.
 * 6. Admin API endpoints (GET /readiness, GET /audit-history).
 * 7. India economic calendar subsystem isolation and integrity.
 * 8. Production database baseline preservation (11 upcoming, 0 released).
 */

import { forexCanaryMonitoringService, ForexCanaryMonitoringService, FOREX_READINESS_VERDICTS } from '../src/services/forex/ForexCanaryMonitoringService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';
import { indiaCalendarScheduleService } from '../src/services/IndiaCalendarScheduleService.js';
import { forexEconomicCalendarService } from '../src/services/forex/ForexEconomicCalendarService.js';

async function runCanaryMonitoringTests() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🛡️  PHASE 7.4 STEP 4: CANARY MONITORING & PRODUCTION READINESS VALIDATION');
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

  // ── TEST 1: Service Initialization ────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 1: SERVICE INITIALIZATION                                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  assert('1. ForexCanaryMonitoringService initialized', Boolean(forexCanaryMonitoringService));

  // ── TEST 2-4: Persistent Audit History ────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 2-4: PERSISTENT AUDIT LOGGING & FILTERING                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  forexCanaryMonitoringService.clearAuditHistory();

  forexCanaryMonitoringService.recordAudit({
    action: 'INSERT',
    recordId: 'rec-001',
    eventName: 'Non-Farm Payrolls',
    newState: { event_date: '2026-09-04' }
  });

  forexCanaryMonitoringService.recordAudit({
    action: 'UPDATE',
    recordId: 'rec-002',
    eventName: 'CPI',
    previousSnapshot: { status: 'upcoming' },
    newState: { status: 'released', actual: '0.2%' }
  });

  forexCanaryMonitoringService.recordAudit({
    action: 'ROLLBACK_DELETE',
    recordId: 'rec-003',
    reason: 'Verification checksum failure'
  });

  const allAudits = forexCanaryMonitoringService.getAuditHistory();
  assert('2. Persistent audit entries recorded (length === 3)', allAudits.length === 3);

  const insertAudits = forexCanaryMonitoringService.getAuditHistory({ action: 'INSERT' });
  assert('3. Audit history filters by action (action === "INSERT")', insertAudits.length === 1 && insertAudits[0].recordId === 'rec-001');

  const rollbackAudits = forexCanaryMonitoringService.getAuditHistory({ action: 'ROLLBACK_DELETE' });
  assert('4. Audit history tracks rollback events', rollbackAudits.length === 1 && rollbackAudits[0].recordId === 'rec-003');

  // ── TEST 5: Success / Failure / Rollback Metrics ──────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 5: REAL-TIME METRICS TRACKING                                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const metrics = forexCanaryMonitoringService.metrics;
  assert('5. Metrics record totalMutationsAttempted >= 2', metrics.totalMutationsAttempted >= 2);
  assert('Metrics record successfulMutations >= 2', metrics.successfulMutations >= 2);
  assert('Metrics record automaticRollbacks >= 1', metrics.automaticRollbacks >= 1);

  // ── TEST 6: Provider Health Alerts ────────────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 6: PROVIDER HEALTH ALERTS & CONSECUTIVE FAILURE DETECTION          │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const liveProviderAlerts = await forexCanaryMonitoringService.checkProviderAlerts();
  assert('6. Live official providers (BLS, BEA, FED) report healthy with 0 critical alerts',
    liveProviderAlerts.healthy === true && liveProviderAlerts.alerts.length === 0);

  // Test failure detection with simulated failing provider
  const failingProvider = {
    getProviderName: () => 'Simulated_Broken_Provider',
    getProviderHealth: async () => ({
      status: 'unhealthy',
      consecutiveErrors: 4,
      latencyMs: 150
    })
  };
  const testMonitoringWithFailure = new ForexCanaryMonitoringService(
    supabaseEconomicCalendarService,
    [failingProvider]
  );
  const failureAlerts = await testMonitoringWithFailure.checkProviderAlerts();
  assert('Unhealthy provider triggers critical alert',
    failureAlerts.healthy === false && failureAlerts.alerts.some(a => a.severity === 'critical'));

  // ── TEST 7: Database Integrity Verification ───────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 7: DEEP DATABASE INTEGRITY VERIFICATION                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const dbIntegrity = await forexCanaryMonitoringService.verifyDatabaseIntegrity();
  assert('7. Production database integrity verification passes (valid: true)', dbIntegrity.valid === true);
  assert('Integrity check scanned existing baseline records (totalEvents === 11)', dbIntegrity.totalEvents === baseline.length);
  assert('Integrity check reports 0 anomalies or violations', dbIntegrity.issuesCount === 0);

  // ── TEST 8: Production Readiness Report ───────────────────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 8: PRODUCTION READINESS AUDIT REPORT GENERATION                    │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const readinessReport = await forexCanaryMonitoringService.generateProductionReadinessReport();
  assert('8. Production readiness report generated successfully', Boolean(readinessReport));
  assert('Readiness checklist verifies safety switches', readinessReport.checklist.safetySwitchesConfigured === true);
  assert('Readiness checklist verifies database integrity pass', readinessReport.checklist.databaseIntegrityPass === true);
  assert('Readiness checklist verifies provider health', readinessReport.checklist.providersHealthy === true);
  assert('Default environment reflects BLOCKED_BY_SAFETY_FLAGS verdict',
    readinessReport.verdict === FOREX_READINESS_VERDICTS.BLOCKED_BY_SAFETY_FLAGS);

  // ── TEST 9: Existing India Calendar Subsystem Integrity ───────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 9: EXISTING INDIA CALENDAR SUBSYSTEM INTEGRITY                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const indiaGen = indiaCalendarScheduleService.generateUpcomingEvents({ daysAhead: 30 });
  assert('9. India calendar schedule generator functioning normally', indiaGen.events && indiaGen.events.length > 0);

  // ── TEST 10: Production Database Baseline Verification ────────────────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ TEST 10: PRODUCTION DATABASE BASELINE VERIFICATION                      │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  assert('10. Total Indian events count matches baseline (11 === 11)', postTest.length === baseline.length, `(${postTest.length} === ${baseline.length})`);
  assert('Upcoming event count matches baseline (11 === 11)', postUpcoming === baselineUpcoming, `(${postUpcoming} === ${baselineUpcoming})`);
  assert('Released event count matches baseline (0 === 0)', postReleased === baselineReleased, `(${postReleased} === ${baselineReleased})`);

  const flags = forexEconomicCalendarService.getForexSafetyFlags();
  assert('Environment safety flag FOREX_CALENDAR_ENABLED is false', flags.forexCalendarEnabled === false);
  assert('Environment safety flag FOREX_CALENDAR_LIVE_INGESTION_ENABLED is false', flags.forexLiveIngestionEnabled === false);

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 7.4 STEP 4 (CANARY MONITORING) TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`Total Criteria Tested: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);

  if (passed === total) {
    console.log('\n🎉 ALL PHASE 7.4 STEP 4 CANARY MONITORING TESTS PASSED (100%).\n');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED.\n');
  }
}

runCanaryMonitoringTests().catch(console.error);
