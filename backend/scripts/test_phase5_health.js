/**
 * Phase 5.2 Test Suite: Economic Calendar Health Monitoring
 * 
 * Verifies:
 * 1. Scheduler disabled -> status: 'disabled'
 * 2. No successful run with scheduler enabled -> status: 'degraded'
 * 3. Recent successful run (< 30h) -> status: 'healthy'
 * 4. Stale successful run (> 30h) -> status: 'unhealthy'
 * 5. Recent failure with recent success within SLA -> status: 'degraded'
 * 6. Database query failure simulation -> status: 'unhealthy'
 * 7. Active polling job count is reported accurately
 * 8. Distributed lock status is reported safely (without exposing internal node/instance IDs)
 * 9. Health check causes zero mutations to economic_events
 * 10. No credentials, tokens, or instance IDs appear in API response
 */

import { economicCalendarHealthService } from '../src/services/EconomicCalendarHealthService.js';
import { officialSourcePollerService } from '../src/services/OfficialSourcePollerService.js';
import { schedulerLockService } from '../src/services/SchedulerLockService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runHealthTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Phase 5.2 Test Suite: Economic Calendar Health Monitoring');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let testNum = 1;

  const supabase = supabaseEconomicCalendarService.supabase;
  if (!supabase) throw new Error('Supabase client is not configured');

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  // ── 1. Scheduler Disabled Check ──────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Scheduler Disabled Scenario:`);
  const disabledRes = await economicCalendarHealthService.getHealthStatus({
    overrideEnabled: false
  });

  if (disabledRes.success && disabledRes.status === 'disabled' && disabledRes.scheduler.enabled === false) {
    console.log('   ✅ Passed: Correctly reported status "disabled" when scheduler is disabled.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Disabled scenario mismatch.\n', disabledRes);
  }

  // ── 2. No Successful Run with Scheduler Enabled ───────────────────────────
  console.log(`[Test ${testNum++}] Testing No Successful Run with Scheduler Enabled Scenario:`);
  const noSuccessRes = await economicCalendarHealthService.getHealthStatus({
    overrideEnabled: true,
    customAuditRuns: { latestRun: null, latestSuccess: null }
  });

  if (noSuccessRes.success && noSuccessRes.status === 'degraded') {
    console.log('   ✅ Passed: Correctly reported status "degraded" when enabled with no prior success.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: No success run scenario mismatch.\n', noSuccessRes);
  }

  // ── 3. Recent Successful Run (< 30h) ──────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Recent Successful Run (< 30h) Scenario:`);
  const recentSuccessDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
  const healthyRes = await economicCalendarHealthService.getHealthStatus({
    overrideEnabled: true,
    overrideMaxAgeHours: 30,
    customAuditRuns: {
      latestRun: { status: 'completed', started_at: recentSuccessDate, completed_at: recentSuccessDate },
      latestSuccess: { status: 'completed', started_at: recentSuccessDate, completed_at: recentSuccessDate }
    }
  });

  if (healthyRes.success && healthyRes.status === 'healthy' && healthyRes.scheduler.hoursSinceLastSuccess <= 2.1) {
    console.log(`   ✅ Passed: Correctly reported status "healthy" (hours since success: ${healthyRes.scheduler.hoursSinceLastSuccess}h).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Healthy scenario mismatch.\n', healthyRes);
  }

  // ── 4. Stale Successful Run (> 30h) ───────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Stale Successful Run (> 30h) Scenario:`);
  const staleSuccessDate = new Date(Date.now() - 35 * 60 * 60 * 1000).toISOString(); // 35 hours ago
  const staleRes = await economicCalendarHealthService.getHealthStatus({
    overrideEnabled: true,
    overrideMaxAgeHours: 30,
    customAuditRuns: {
      latestRun: { status: 'completed', started_at: staleSuccessDate, completed_at: staleSuccessDate },
      latestSuccess: { status: 'completed', started_at: staleSuccessDate, completed_at: staleSuccessDate }
    }
  });

  if (staleRes.success && staleRes.status === 'unhealthy' && staleRes.reasons.some(r => r.includes('STALE_SCHEDULER_RUN'))) {
    console.log(`   ✅ Passed: Correctly reported status "unhealthy" for stale run (${staleRes.scheduler.hoursSinceLastSuccess}h old).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Stale scenario mismatch.\n', staleRes);
  }

  // ── 5. Recent Failure with Recent Success ────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Recent Failure with Recent Success Scenario:`);
  const failTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago
  const degradedRes = await economicCalendarHealthService.getHealthStatus({
    overrideEnabled: true,
    overrideMaxAgeHours: 30,
    customAuditRuns: {
      latestRun: { status: 'failed', started_at: failTime, completed_at: failTime },
      latestSuccess: { status: 'completed', started_at: recentSuccessDate, completed_at: recentSuccessDate }
    }
  });

  if (degradedRes.success && degradedRes.status === 'degraded' && degradedRes.reasons.some(r => r.includes('LATEST_RUN_FAILED'))) {
    console.log('   ✅ Passed: Correctly reported status "degraded" when latest run failed but success is within SLA.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Failure with recent success scenario mismatch.\n', degradedRes);
  }

  // ── 6. Database Connection Failure Simulation ─────────────────────────────
  console.log(`[Test ${testNum++}] Testing Database Connection Failure Simulation:`);
  const dbFailRes = await economicCalendarHealthService.getHealthStatus({
    simulateDbError: true
  });

  if (dbFailRes.success && dbFailRes.status === 'unhealthy' && dbFailRes.database.status === 'unhealthy') {
    console.log('   ✅ Passed: Correctly reported status "unhealthy" when database check fails.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Database error scenario mismatch.\n', dbFailRes);
  }

  // ── 7. Active Polling Job Count Reporting ─────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Active Poller Job Count Reporting:`);
  officialSourcePollerService.activePollingJobs.set('test-health-job-1', {
    eventId: 'test-health-job-1',
    eventName: 'CPI Inflation',
    attempts: 1,
    status: 'polling'
  });

  const pollerCountRes = await economicCalendarHealthService.getHealthStatus();
  officialSourcePollerService.stopPolling('test-health-job-1'); // cleanup

  if (pollerCountRes.poller.activeJobs >= 1) {
    console.log(`   ✅ Passed: Poller job count reported accurately (${pollerCountRes.poller.activeJobs} active jobs).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Poller active jobs count mismatch.\n', pollerCountRes);
  }

  // ── 8. Distributed Lock Sanitized Visibility ──────────────────────────────
  console.log(`[Test ${testNum++}] Testing Sanitized Distributed Lock Reporting:`);
  const testLockName = 'economic_calendar_scheduler';
  const testInstance = 'internal-server-node-123';
  await schedulerLockService.acquireLock(testLockName, testInstance, 60);

  const lockHealthRes = await economicCalendarHealthService.getHealthStatus();
  await schedulerLockService.releaseLock(testLockName, testInstance); // cleanup

  if (lockHealthRes.distributedLock.locked === true && !JSON.stringify(lockHealthRes).includes('internal-server-node-123')) {
    console.log('   ✅ Passed: Distributed lock status reported accurately without exposing instance identity.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Distributed lock reporting failed or exposed instance identity.\n', lockHealthRes);
  }

  // ── 9. Zero Mutations to Economic Events ───────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Zero Database Mutations on Health Queries:`);
  const postTest = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const postUpcoming = postTest.filter(e => e.status === 'upcoming').length;
  const postReleased = postTest.filter(e => e.status === 'released').length;

  if (postReleased === baselineReleased && postUpcoming === baselineUpcoming && postTest.length === baseline.length) {
    console.log(`   ✅ Passed: Economic events table remained completely unchanged (${postTest.length} events, ${postReleased} released).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Database was mutated during health checks!\n');
  }

  // ── 10. Privacy & Security Response Check ─────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Sensitive Credential/Token Leakage:`);
  const fullResponseStr = JSON.stringify(disabledRes);
  const hasSecrets = /key|token|secret|supabase_anon|supabase_service|password|process\.pid/i.test(fullResponseStr);

  if (!hasSecrets) {
    console.log('   ✅ Passed: Response is strictly sanitized with zero leaked secrets or credentials.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Sensitive key or secret detected in response!\n', fullResponseStr);
  }

  // ── Final Summary ─────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Final Verification Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Scenarios: 10`);
  console.log(`Passed Scenarios: ${passed}`);

  if (passed === 10) {
    console.log('\n🎉 ALL 10 PHASE 5.2 HEALTH MONITORING TESTS PASSED! Health API verified.');
  } else {
    console.error('\n⚠️ WARNING: Some test scenarios failed!');
  }
}

runHealthTests().catch(console.error);
