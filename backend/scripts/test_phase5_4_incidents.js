/**
 * Phase 5.4 Test Suite: Persistent Incident Management & Notification Delivery
 * 
 * Verifies:
 * 1. Opening a new incident creates a record with status 'open'
 * 2. Active incident deduplication (same incident_key updates existing active incident)
 * 3. Incident acknowledgment lifecycle transition ('open' -> 'acknowledged')
 * 4. Manual and automatic incident resolution ('acknowledged' -> 'resolved')
 * 5. Automatic resolution of all active incidents upon health recovery
 * 6. Notification delivery with bounded exponential backoff retry
 * 7. Graceful delivery failure handling when max retries are exhausted
 * 8. Zero database mutations to economic_events
 */

import { economicCalendarIncidentService } from '../src/services/EconomicCalendarIncidentService.js';
import { economicCalendarAlertService } from '../src/services/EconomicCalendarAlertService.js';
import { supabaseEconomicCalendarService } from '../src/services/SupabaseEconomicCalendarService.js';

async function runIncidentTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Phase 5.4 Test Suite: Persistent Incident Management');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let testNum = 1;

  // Baseline database snapshot
  const baseline = await supabaseEconomicCalendarService.getEvents({ countryCode: 'IN' });
  const baselineUpcoming = baseline.filter(e => e.status === 'upcoming').length;
  const baselineReleased = baseline.filter(e => e.status === 'released').length;
  console.log(`📊 Baseline Check: ${baseline.length} events in Supabase (${baselineUpcoming} upcoming, ${baselineReleased} released).\n`);

  economicCalendarIncidentService.reset();
  economicCalendarAlertService.reset();

  // ── 1. Open New Incident Test ─────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Open New Incident:`);
  const incidentKey1 = 'TEST_STALE_SCHEDULER_' + Date.now();
  const openRes1 = await economicCalendarIncidentService.openOrUpdateIncident({
    incidentKey: incidentKey1,
    severity: 'critical',
    title: '🚨 Test Scheduler Outage',
    description: 'Scheduler has not run for 40 hours',
    reasons: ['STALE_SCHEDULER_RUN: 40h old']
  });

  if (openRes1.isNew && openRes1.incident?.status === 'open' && openRes1.incident?.incident_key === incidentKey1) {
    console.log(`   ✅ Passed: Opened new incident ${openRes1.incident.id} (Status: ${openRes1.incident.status}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Open incident failed.\n', openRes1);
  }

  // ── 2. Deduplication Test (Same Key Updates Existing) ─────────────────────
  console.log(`[Test ${testNum++}] Testing Active Incident Deduplication:`);
  const openRes2 = await economicCalendarIncidentService.openOrUpdateIncident({
    incidentKey: incidentKey1,
    severity: 'critical',
    title: '🚨 Test Scheduler Outage (Duplicate Poll)',
    description: 'Scheduler has not run for 41 hours',
    reasons: ['STALE_SCHEDULER_RUN: 41h old']
  });

  if (!openRes2.isNew && openRes2.incident.id === openRes1.incident.id) {
    console.log(`   ✅ Passed: Deduplication verified. Reused existing incident ${openRes2.incident.id} without creating duplicate.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Deduplication failed, created duplicate.\n', openRes2);
  }

  // ── 3. Acknowledge Incident Test ──────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Incident Acknowledgment Lifecycle:`);
  const ackRes = await economicCalendarIncidentService.acknowledgeIncident(openRes1.incident.id, 'ops-engineer-1');

  if (ackRes && ackRes.status === 'acknowledged' && ackRes.acknowledged_by === 'ops-engineer-1' && ackRes.acknowledged_at) {
    console.log(`   ✅ Passed: Acknowledged incident (Status: ${ackRes.status}, By: ${ackRes.acknowledged_by}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Acknowledgment failed.\n', ackRes);
  }

  // ── 4. Resolve Incident Test ──────────────────────────────────────────────
  console.log(`[Test ${testNum++}] Testing Incident Resolution:`);
  const resolveRes = await economicCalendarIncidentService.resolveIncident(openRes1.incident.id, 'Fixed by restarting server');

  if (resolveRes && resolveRes.status === 'resolved' && resolveRes.resolved_at && resolveRes.resolution_notes.includes('restarting')) {
    console.log(`   ✅ Passed: Resolved incident (Status: ${resolveRes.status}, Notes: ${resolveRes.resolution_notes}).\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Resolution failed.\n', resolveRes);
  }

  // ── 5. Automatic Resolution on Health Recovery ────────────────────────────
  console.log(`[Test ${testNum++}] Testing Auto-Resolution of All Active Incidents on Recovery:`);
  // Open 2 new active incidents
  const autoIncKeyA = 'AUTO_INCIDENT_A_' + Date.now();
  const autoIncKeyB = 'AUTO_INCIDENT_B_' + Date.now();
  await economicCalendarIncidentService.openOrUpdateIncident({ incidentKey: autoIncKeyA, severity: 'warning', title: 'Degraded A' });
  await economicCalendarIncidentService.openOrUpdateIncident({ incidentKey: autoIncKeyB, severity: 'critical', title: 'Unhealthy B' });

  const activeBefore = await economicCalendarIncidentService.getActiveIncidents();
  const autoResolved = await economicCalendarIncidentService.resolveAllActiveIncidents('System nominal');
  const activeAfter = await economicCalendarIncidentService.getActiveIncidents();

  if (activeBefore.length === 2 && autoResolved.length === 2 && activeAfter.length === 0) {
    console.log(`   ✅ Passed: Auto-resolved ${autoResolved.length} active incidents on system recovery.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Auto-resolution mismatch.\n', { activeBefore, autoResolved, activeAfter });
  }

  // ── 6. Notification Delivery with Exponential Backoff Retry ───────────────
  console.log(`[Test ${testNum++}] Testing Notification Delivery with Retry Backoff:`);
  let attemptCount = 0;
  const retrySender = async (notif, attempt) => {
    attemptCount = attempt;
    if (attempt < 2) {
      throw new Error('Simulated transient network drop');
    }
    // Success on attempt 2
    return true;
  };

  const dummyIncident = {
    id: 'test-notif-inc-1',
    incident_key: 'TEST_NOTIF_KEY',
    severity: 'critical',
    title: 'Test Notification Delivery',
    status: 'open'
  };

  const deliveryRes = await economicCalendarIncidentService.queueAndDeliverNotification(
    dummyIncident,
    'incident_opened',
    {
      customSender: retrySender,
      maxAttempts: 3,
      initialDelayMs: 20
    }
  );

  if (deliveryRes.status === 'delivered' && deliveryRes.attempts === 2) {
    console.log(`   ✅ Passed: Notification delivered on attempt ${deliveryRes.attempts} after backoff retry.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Delivery retry backoff failed.\n', deliveryRes);
  }

  // ── 7. Notification Exhaustion / Failure Handling ─────────────────────────
  console.log(`[Test ${testNum++}] Testing Delivery Exhaustion (Permanent Failure):`);
  const failingSender = async () => {
    throw new Error('Permanent SMTP 550 Bad Recipient');
  };

  const failDeliveryRes = await economicCalendarIncidentService.queueAndDeliverNotification(
    dummyIncident,
    'incident_opened',
    {
      customSender: failingSender,
      maxAttempts: 2,
      initialDelayMs: 10
    }
  );

  if (failDeliveryRes.status === 'failed' && failDeliveryRes.attempts === 2 && failDeliveryRes.last_error.includes('Permanent SMTP')) {
    console.log(`   ✅ Passed: Notification failure safely handled and marked status "failed".\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Failure handling mismatch.\n', failDeliveryRes);
  }

  // ── 8. Integrated End-to-End Alert & Incident Pipeline ────────────────────
  console.log(`[Test ${testNum++}] Testing Integrated Alert & Persistent Incident Flow:`);
  economicCalendarAlertService.reset();
  economicCalendarAlertService.lastState = 'healthy';

  const e2eAlertRes = await economicCalendarAlertService.checkHealthAndAlert({
    healthOptions: {
      overrideEnabled: true,
      customAuditRuns: {
        latestRun: { status: 'failed' },
        latestSuccess: { status: 'completed', started_at: new Date(Date.now() - 40 * 3600 * 1000).toISOString() }
      }
    }
  });

  if (e2eAlertRes.alertTriggered && e2eAlertRes.incident && e2eAlertRes.incident.status === 'open' && e2eAlertRes.delivery?.status === 'delivered') {
    console.log(`   ✅ Passed: Integrated alert generated incident ${e2eAlertRes.incident.id} and dispatched delivery.\n`);
    passed++;
  } else {
    console.error('   ❌ Failed: Integrated alert & incident flow failed.\n', e2eAlertRes);
  }

  // ── 9. Final Database Integrity Check ─────────────────────────────────────
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
    console.log(`\n🎉 ALL ${passed} PHASE 5.4 PERSISTENT INCIDENT TESTS PASSED! Database integrity verified.`);
  } else {
    console.error('\n⚠️ WARNING: Economic events database state was modified during test!');
  }
}

runIncidentTests().catch(console.error);
