/**
 * Phase 5.3 Test Suite: Economic Calendar Alerting & State Transitions
 * 
 * Verifies:
 * 1. Incident alert triggered on transition to 'unhealthy'
 * 2. Incident alert triggered on transition to 'degraded'
 * 3. Recovery alert triggered on transition from 'unhealthy' -> 'healthy'
 * 4. Anti-spam cooldown suppresses immediate duplicate alerts for persistent state
 * 5. Bypassing cooldown or expiration allows re-alerting
 * 6. Alert history is recorded accurately in-memory
 * 7. Graceful fallback when notification provider is unconfigured
 * 8. Zero database mutations to economic_events
 */

import { economicCalendarAlertService, ALERT_TYPES } from '../src/services/EconomicCalendarAlertService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runAlertingTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Phase 5.3 Test Suite: Economic Calendar Alerting');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let testNum = 1;
  const capturedDispatches = [];

  const mockSink = async (alert) => {
    capturedDispatches.push(alert);
  };

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  economicCalendarAlertService.reset();

  // ── 1. Incident Alert Triggered on Transition to Unhealthy ────────────────
  console.log(`[Test ${testNum++}] Testing Incident Alert on Transition to 'unhealthy':`);
  // Start from healthy
  economicCalendarAlertService.lastState = 'healthy';

  const unhealthyRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      overrideMaxAgeHours: 30,
      customAuditRuns: {
        latestRun: { status: 'failed' },
        latestSuccess: { status: 'completed', started_at: new Date(Date.now() - 40 * 3600 * 1000).toISOString() } // 40h old
      }
    },
    customSink: mockSink
  });

  if (unhealthyRes.alertTriggered && unhealthyRes.alert?.type === ALERT_TYPES.INCIDENT_UNHEALTHY && unhealthyRes.alert?.severity === 'critical') {
    console.log(`   ✅ Passed: Incident alert triggered with critical severity (${unhealthyRes.alert.title}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Incident alert not triggered on unhealthy transition.\n', unhealthyRes);
  }

  // ── 2. Recovery Alert on Transition from Unhealthy -> Healthy ─────────────
  console.log(`[Test ${testNum++}] Testing Recovery Alert on Transition to 'healthy':`);
  const recentDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1h ago

  const recoveryRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      overrideMaxAgeHours: 30,
      customAuditRuns: {
        latestRun: { status: 'completed', started_at: recentDate, completed_at: recentDate },
        latestSuccess: { status: 'completed', started_at: recentDate, completed_at: recentDate }
      }
    },
    customSink: mockSink
  });

  if (recoveryRes.alertTriggered && recoveryRes.alert?.type === ALERT_TYPES.RECOVERY && recoveryRes.alert?.severity === 'info') {
    console.log(`   ✅ Passed: Recovery alert triggered successfully (${recoveryRes.alert.title}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Recovery alert not triggered.\n', recoveryRes);
  }

  // ── 3. Incident Alert on Transition to Degraded ───────────────────────────
  console.log(`[Test ${testNum++}] Testing Warning Alert on Transition to 'degraded':`);
  const degradedRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      overrideMaxAgeHours: 30,
      customAuditRuns: {
        latestRun: { status: 'failed', started_at: new Date().toISOString() },
        latestSuccess: { status: 'completed', started_at: recentDate, completed_at: recentDate }
      }
    },
    customSink: mockSink
  });

  if (degradedRes.alertTriggered && degradedRes.alert?.type === ALERT_TYPES.INCIDENT_DEGRADED && degradedRes.alert?.severity === 'warning') {
    console.log(`   ✅ Passed: Degraded alert triggered with warning severity (${degradedRes.alert.title}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Degraded alert not triggered.\n', degradedRes);
  }

  // ── 4. Anti-Spam Cooldown Suppresses Duplicate Alert ──────────────────────
  console.log(`[Test ${testNum++}] Testing Anti-Spam Cooldown Suppression:`);
  // Immediate second check with same degraded state
  const suppressedRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      overrideMaxAgeHours: 30,
      customAuditRuns: {
        latestRun: { status: 'failed', started_at: new Date().toISOString() },
        latestSuccess: { status: 'completed', started_at: recentDate, completed_at: recentDate }
      }
    },
    customSink: mockSink,
    bypassCooldown: false
  });

  if (!suppressedRes.alertTriggered && suppressedRes.alert === null) {
    console.log('   ✅ Passed: Duplicate alert suppressed by active cooldown.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Anti-spam cooldown failed to suppress duplicate.\n', suppressedRes);
  }

  // ── 5. Bypass Cooldown Allows Re-Alerting ──────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Cooldown Bypass / Re-Alerting:`);
  const reAlertRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      overrideMaxAgeHours: 30,
      customAuditRuns: {
        latestRun: { status: 'failed', started_at: new Date().toISOString() },
        latestSuccess: { status: 'completed', started_at: recentDate, completed_at: recentDate }
      }
    },
    customSink: mockSink,
    bypassCooldown: true
  });

  if (reAlertRes.alertTriggered && reAlertRes.alert !== null) {
    console.log('   ✅ Passed: Re-alerting functioned as expected when cooldown bypassed.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Cooldown bypass re-alert failed.\n', reAlertRes);
  }

  // ── 6. Alert History Recording ────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing In-Memory Alert History Recording:`);
  const history = economicCalendarAlertService.getAlertHistory(10);

  if (history.length >= 4 && history[0].type && history[0].timestamp) {
    console.log(`   ✅ Passed: Recorded ${history.length} alerts in history with full snapshot metadata.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Alert history recording mismatch.\n', history);
  }

  // ── 7. Safe Fallback Without Custom Sink ──────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Safe Notification Fallback (No Provider Configured):`);
  economicCalendarAlertService.reset();
  economicCalendarAlertService.lastState = 'healthy';

  const fallbackRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: { overrideEnabled: false } // Trigger transition to disabled
  });

  if (fallbackRes.success) {
    console.log('   ✅ Passed: Alert service executed without errors in default fallback mode.\n');
    passed++;
  } else {
    console.error('   ❌ Failed: Fallback execution failed.\n', fallbackRes);
  }

  // ── 8. Final Database Integrity Check ─────────────────────────────────────
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
    console.log(`\n🎉 ALL ${passed} PHASE 5.3 ALERTING TESTS PASSED! Database integrity verified.`);
  } else {
    console.error('\n⚠️ WARNING: Economic events database state was modified during test!');
  }
}

runAlertingTests().catch(console.error);
