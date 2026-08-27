# RiskLoop Economic Calendar Production Deployment Checklist & Runbook

## 1. Overview
This runbook provides the verification, operational safeguards, and step-by-step rollout procedures for the RiskLoop Economic Calendar subsystem across all phases (Phase 1 through Phase 6.1).

---

## 2. Pre-Deployment Configuration Audit

| Configuration / Variable | Expected Production Value | Purpose / Notes | Verified |
| :--- | :--- | :--- | :---: |
| `ECONOMIC_CALENDAR_SCHEDULER_ENABLED` | `false` (Default) | Keep disabled initially; enables background timers | ✅ |
| `ECONOMIC_CALENDAR_HEALTH_MAX_AGE_HOURS` | `30` | SLA freshness stale threshold (hours) | ✅ |
| `ECONOMIC_CALENDAR_ALERT_COOLDOWN_MINUTES` | `60` | Anti-spam alert reminder cooldown (minutes) | ✅ |
| `SUPABASE_URL` | Valid HTTPS URL | Connects to production Supabase project | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` / `ANON_KEY` | Valid Service Role / Anon Key | Authenticates backend queries and RPC locks | ✅ |

---

## 3. Database Subsystems & Tables

1. **`public.economic_events`**:
   - Master Indian and Global macroeconomic release events table.
   - Initialized with **11 confirmed upcoming events** (CPI, IIP, WPI, GDP, RBI Repo Rate).
   - Zero synthetic actuals inserted.

2. **`public.scheduler_locks` & RPC `acquire_scheduler_lock`**:
   - Multi-instance distributed locking preventing concurrent scheduler execution across clustered Node.js instances.
   - 300s TTL with automatic crash recovery.

3. **`public.scheduler_runs`**:
   - Persistent audit logging tracking start time, end time, duration, events checked, and error structures.

4. **`public.economic_calendar_incidents` & `public.economic_calendar_notifications`**:
   - Persistent incident management (`open` $\rightarrow$ `acknowledged` $\rightarrow$ `resolved`) with bounded exponential backoff delivery.

---

## 4. Key Endpoints Reference

### Public / Client Endpoints:
- `GET /api/economic-calendar` - Standard Economic Calendar events query.
- `GET /api/health/economic-calendar` - Subsystem health and freshness status.

### Protected Admin Operations Endpoints (`/api/admin/economic-calendar`):
- `GET /dashboard` - Aggregated operations dashboard state (health, scheduler, incidents, poller, lock).
- `POST /incidents/:id/acknowledge` - Protected incident acknowledgment.
- `POST /incidents/:id/resolve` - Protected incident resolution.
- `POST /scheduler/trigger` - Protected manual sync & catch-up trigger (supports `{ dryRun: true }`).

---

## 5. Verification & Test Suite Execution

Run all test suites before production promotion:

```bash
# 1. Deployment Preparation & Environment Smoke Test (23/23 Passing)
node scripts/test_phase6_1_deployment_readiness.js

# 2. End-to-End Production Safety Validation (31/31 Passing)
node scripts/test_phase5_6_production_readiness.js

# 3. Operations Dashboard & Admin APIs (5/5 Passing)
node scripts/test_phase5_5_dashboard.js

# 4. Persistent Incident Management & Delivery (8/8 Passing)
node scripts/test_phase5_4_incidents.js

# 5. Alerting & State Transition Cooldown (7/7 Passing)
node scripts/test_phase5_alerting.js

# 6. Health & SLA Freshness Rules (10/10 Passing)
node scripts/test_phase5_health.js

# 7. Persistent Scheduler Audit Logging (6/6 Passing)
node scripts/test_phase5_monitoring.js

# 8. Automated Scheduler & Distributed Lock Tests (11/11 Passing)
node scripts/test_phase4_scheduler.js

# 9. Real Official Source Discovery (9/9 Passing)
node scripts/test_phase4_1_discovery.js
```

---

## 6. Post-Deployment Verification
1. Inspect `GET /api/health/economic-calendar` $\rightarrow$ confirm HTTP 200 and `"status": "disabled"`.
2. Access the Admin Operations Dashboard $\rightarrow$ confirm healthy database connectivity and zero active unacknowledged incidents.
3. Keep `ECONOMIC_CALENDAR_SCHEDULER_ENABLED=false` until final business sign-off for autonomous polling.
