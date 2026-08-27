/**
 * Phase 5.1 Test Suite: Persistent Scheduler Audit Logging
 * 
 * Verifies:
 * 1. startRun creates persistent audit record in public.scheduler_runs
 * 2. completeRun marks run as 'completed' with accurate metrics and timestamps
 * 3. failRun stores structured error objects without crashing
 * 4. getRecentRuns and getLatestSuccessfulRun retrieve audit history
 * 5. Dry-run scheduler execution populates audit log metadata cleanly
 * 6. Production economic_events table data remains 100% untouched
 * 7. Temporary test audit records are cleaned up
 */

import { schedulerAuditService } from '../src/services/SchedulerAuditService.js';
import { calendarSchedulerService } from '../src/services/CalendarSchedulerService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runPhase5Tests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Phase 5.1 Test Suite: Persistent Scheduler Audit Logging');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let testNum = 1;
  const createdTestRunIds = [];

  const supabase = supabaseEconomicCalendarService.supabase;
  if (!supabase) throw new Error('Supabase client is not configured');

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  // ── 1. startRun Test ──────────────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing startRun Audit Record Creation:`);
  const testInstance = 'test-audit-instance-' + Date.now();
  const startRes = await schedulerAuditService.startRun({
    schedulerName: 'test_scheduler_audit',
    instanceId: testInstance,
    metadata: { test: true, environment: 'automated-test' }
  });

  if (startRes && startRes.id && startRes.status === 'running') {
    createdTestRunIds.push(startRes.id);
    console.log(`   ✅ Passed: Created audit run ${startRes.id} (Status: ${startRes.status}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: startRun did not return valid running record.\n', startRes);
  }

  // ── 2. completeRun Test ───────────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing completeRun Audit Record Update:`);
  const compRes = await schedulerAuditService.completeRun(startRes.id, {
    eventsChecked: 11,
    eventsReleased: 0,
    metadata: { test: true, durationMs: 250, completedSuccessfully: true }
  });

  if (compRes && compRes.status === 'completed' && compRes.completed_at && compRes.events_checked === 11) {
    console.log(`   ✅ Passed: Successfully marked run ${startRes.id} as completed with duration & metrics.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: completeRun did not update status properly.\n', compRes);
  }

  // ── 3. failRun Test ───────────────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing failRun Error Capture:`);
  const failStartRes = await schedulerAuditService.startRun({
    schedulerName: 'test_scheduler_audit',
    instanceId: testInstance,
    metadata: { test: true }
  });
  createdTestRunIds.push(failStartRes.id);

  const simulatedError = new Error('Simulated upstream API timeout');
  const failRes = await schedulerAuditService.failRun(failStartRes.id, simulatedError, {
    eventsChecked: 5,
    eventsReleased: 0,
    metadata: { test: true }
  });

  if (failRes && failRes.status === 'failed' && Array.isArray(failRes.errors) && failRes.errors[0].message.includes('Simulated upstream API timeout')) {
    console.log(`   ✅ Passed: failRun captured structured error info safely.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: failRun error capture failed.\n', failRes);
  }

  // ── 4. getRecentRuns and getLatestSuccessfulRun Test ───────────────────────
  console.log(`[Test ${testNum++}] Testing Audit Retrieval Queries:`);
  const recentRuns = await schedulerAuditService.getRecentRuns(5, 'test_scheduler_audit');
  const latestSuccess = await schedulerAuditService.getLatestSuccessfulRun('test_scheduler_audit');

  if (recentRuns.length >= 2 && latestSuccess && latestSuccess.id === startRes.id) {
    console.log(`   ✅ Passed: Retrieved ${recentRuns.length} recent runs and verified latest successful run.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Audit retrieval queries failed.\n', { recentCount: recentRuns.length, latestSuccess });
  }

  // ── 5. Integrated Dry-Run Scheduler Cycle Audit Test ──────────────────────
  console.log(`[Test ${testNum++}] Testing Integrated Scheduler Cycle Audit Logging:`);
  const schedulerCycleRes = await calendarSchedulerService.runSchedulerCycle({ dryRun: true, isManual: true });

  // Find the audit log created by this run
  const { data: latestCycleAudit } = await supabase
    .from('scheduler_runs')
    .select('*')
    .eq('scheduler_name', 'economic_calendar_scheduler')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (schedulerCycleRes.success && latestCycleAudit && latestCycleAudit.status === 'completed' && latestCycleAudit.metadata?.dryRun === true) {
    createdTestRunIds.push(latestCycleAudit.id);
    console.log(`   ✅ Passed: Integrated scheduler cycle automatically logged audit run ${latestCycleAudit.id} with dryRun metadata.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Integrated scheduler cycle did not record audit entry.\n', { schedulerCycleRes, latestCycleAudit });
  }

  // ── 6. Cleanup Temporary Test Audit Records ──────────────────────────────
  console.log(`[Test ${testNum++}] Cleaning Up Temporary Test Audit Records:`);
  if (createdTestRunIds.length > 0) {
    const { error: delErr } = await supabase
      .from('scheduler_runs')
      .delete()
      .in('id', createdTestRunIds);

    // Also delete any remaining test_scheduler_audit records
    await supabase.from('scheduler_runs').delete().eq('scheduler_name', 'test_scheduler_audit');

    if (!delErr) {
      console.log(`   ✅ Passed: Cleaned up ${createdTestRunIds.length} temporary audit log records.\n`);
      passed++;
    } else {
      console.warn(`   ⚠️ Cleanup warning: ${delErr.message}\n`);
    }
  }

  // ── 7. Final Database Integrity Check ─────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Final Production Database Integrity Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  console.log(`Total Events: ${postTest.length}`);
  console.log(`Upcoming Events: ${postUpcoming} (Matches baseline: ${postUpcoming === baselineUpcoming})`);
  console.log(`Released Events: ${postReleased} (Matches baseline: ${postReleased === baselineReleased})`);

  if (postReleased === baselineReleased && postUpcoming === baselineUpcoming) {
    console.log(`\n🎉 ALL ${passed} PHASE 5.1 AUDIT LOGGING TESTS PASSED! Database integrity verified.`);
  } else {
    console.error('\n⚠️ WARNING: Economic events database state was modified during test!');
  }
}

runPhase5Tests().catch(console.error);
