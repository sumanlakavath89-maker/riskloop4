# RiskLoop Economic Calendar: Master Production Deployment Runbook & Checklist

## 1. Executive Summary
This document provides the definitive operational runbook, configuration matrix, security audit, and deployment procedures for the dual-stream **RiskLoop Macroeconomic Calendar Engine** (Indian Economic Calendar & Forex USD Macro Calendar).

```
                                  RISKLOOP MACROECONOMIC ENGINE
                                ┌─────────────────────────────┐
                                │   Admin Operations & UI     │
                                └──────────────┬──────────────┘
                                               │
                        ┌──────────────────────┴──────────────────────┐
                        ▼                                             ▼
          🇮🇳 India Macro Subsystem                       🇺🇸 US Forex Macro Subsystem
        ┌───────────────────────────────┐              ┌───────────────────────────────┐
        │ • MoSPI (CPI, IIP, GDP)       │              │ • BLS (NFP, Unemp, CPI, PPI)  │
        │ • Office of EA (WPI)          │              │ • BEA (GDP, PCE, Core PCE)    │
        │ • RBI (Repo Rate Decisions)   │              │ • Federal Reserve (FOMC Rate) │
        │ • 5 Canonical Indicators      │              │ • 9 Canonical USD Events      │
        │ • Distributed Lock (RPC)      │              │ • Concurrency Control         │
        │ • Incident Management Service │              │ • Rollout Stage Controller    │
        │ • Baseline: 11 active events  │              │ • Automated Circuit Breaker   │
        └───────────────────────────────┘              └───────────────────────────────┘
```

---

## 2. Master Environment Configuration & Safety Matrix

All production switches **MUST** default to `false` / empty in environment files (`.env` / production env variables) until intentional administrative activation:

| Subsystem | Variable Name | Default Value | Purpose / Safe Behavior |
| :--- | :--- | :--- | :--- |
| **India Calendar** | `ECONOMIC_CALENDAR_SCHEDULER_ENABLED` | `false` | Disables background cron polling |
| **India Calendar** | `ECONOMIC_CALENDAR_LIVE_INGESTION_ENABLED` | `false` | Disables automated Supabase mutations |
| **India Calendar** | `ECONOMIC_CALENDAR_CANARY_INDICATORS` | `""` | Restricts automated writes to specific indicators |
| **India Calendar** | `ECONOMIC_CALENDAR_HEALTH_MAX_AGE_HOURS` | `30` | SLA freshness threshold before alerting |
| **India Calendar** | `ECONOMIC_CALENDAR_ALERT_COOLDOWN_MINUTES` | `60` | Cooldown period between repeated incident alerts |
| **Forex Calendar** | `FOREX_CALENDAR_ENABLED` | `false` | Master feature flag for Forex Calendar |
| **Forex Calendar** | `FOREX_CALENDAR_SCHEDULER_ENABLED` | `false` | Disables background Forex scheduler |
| **Forex Calendar** | `FOREX_CALENDAR_LIVE_INGESTION_ENABLED` | `false` | Disables automated Forex database writes |
| **Forex Calendar** | `FOREX_CALENDAR_CANARY_CURRENCIES` | `""` | Restricts live canary writes (e.g. `USD`) |
| **Infrastructure** | `SUPABASE_URL` | Configured HTTPS | Supabase project API endpoint |
| **Infrastructure** | `SUPABASE_SERVICE_ROLE_KEY` / `ANON_KEY` | Configured Key | Authenticates database transactions & RPCs |

---

## 3. Official Source Whitelist & Zero-AI/Scraper Guarantee

| Subsystem | Provider | Whitelisted Domains | Key Macro Indicators | Announcement Time |
| :--- | :--- | :--- | :--- | :--- |
| **India** | MoSPI / NSO | `mospi.gov.in` | CPI Inflation, IIP, India GDP | 17:30 IST (`Asia/Kolkata`) |
| **India** | Office of Economic Adviser | `eaindustry.nic.in` | WPI Inflation | 12:00 IST (`Asia/Kolkata`) |
| **India** | Reserve Bank of India | `rbi.org.in` | RBI Monetary Policy / Repo Rate | 10:00 IST (`Asia/Kolkata`) |
| **Forex** | Bureau of Labor Statistics | `bls.gov` | Non-Farm Payrolls, Unemployment Rate, CPI, PPI | 08:30 ET (`America/New_York`) |
| **Forex** | Bureau of Economic Analysis | `bea.gov` | GDP (Advance/Prelim/Final), PCE, Core PCE | 08:30 ET (`America/New_York`) |
| **Forex** | Federal Reserve System | `federalreserve.gov` | FOMC Interest Rate Decision | 14:00 ET (`America/New_York`) |

*Zero Third-Party Scraper Policy*: Scrapers like `forexfactory.com`, `investing.com`, and `tradingeconomics.com` are strictly disallowed. All parsing is deterministic and rule-based without AI APIs.

---

## 4. API Surface & Security Architecture

### Public & User-Facing Endpoints:
- `GET /api/economic-calendar` - Query normalized calendar events (with `?currency=`, `?countryCode=`, `?impact=`, `?from=`, `?to=`).
- `GET /api/market/economic-calendar` - Multi-currency user endpoint with Supabase-primary and FMP fallback.
- `GET /api/health/economic-calendar` - Subsystem health, freshness, and status metrics.

### Protected Administrative Endpoints (`/api/admin/*`):
- `GET /api/admin/economic-calendar/dashboard` - India Operations Dashboard state.
- `POST /api/admin/economic-calendar/incidents/:id/acknowledge` - Incident acknowledgment.
- `POST /api/admin/economic-calendar/incidents/:id/resolve` - Incident resolution.
- `POST /api/admin/economic-calendar/scheduler/trigger` - Manual catch-up run (`{ dryRun: true }`).
- `GET /api/admin/forex-calendar/rollout-status` - Real-time Forex rollout telemetry.
- `GET /api/admin/forex-calendar/readiness` - Production readiness checklist & database integrity verdict.
- `GET /api/admin/forex-calendar/audit-history` - Persistent FIFO audit history.
- `GET /api/admin/forex-calendar/stage` - Current rollout stage and progression summary.
- `POST /api/admin/forex-calendar/stage/advance` - Advance rollout stage with approval.
- `POST /api/admin/forex-calendar/stage/demote` - Safe stage step-down.
- `POST /api/admin/forex-calendar/stage/emergency-halt` - Instant emergency kill switch.

---

## 5. Phased Controlled Rollout Procedure

```
[STAGE 0: SYSTEM INITIALIZATION]
  ├── Safety Flags: All Disabled (Default)
  └── Status: Discovery Dry-Run only

[STAGE 1: DRY-RUN VALIDATION]
  ├── Command: ForexRolloutController.advanceStage('STAGE_1_DRYRUN_MONITORING', { explicitApproval: true })
  └── Verification: Verify upstream fetch from BLS, BEA, Fed without database writes

[STAGE 2: CONTROLLED SMALL CANARY BATCH]
  ├── Command: ForexRolloutController.advanceStage('STAGE_2_CANARY_SMALL_BATCH', { explicitApproval: true })
  ├── Parameters: Batch limit = 3 events
  └── Verification: Immediate post-write checksum check; auto-rollback on error

[STAGE 3: EXPANDED CANARY BATCH]
  ├── Prerequisites: >= 2 successful stable Stage 2 cycles
  ├── Command: ForexRolloutController.advanceStage('STAGE_3_CANARY_EXPANDED_BATCH', { explicitApproval: true })
  └── Parameters: Batch limit = 10 events

[STAGE 4: SCHEDULED CANARY]
  ├── Prerequisites: >= 3 successful stable canary cycles
  ├── Command: ForexRolloutController.advanceStage('STAGE_4_SCHEDULED_CANARY', { explicitApproval: true })
  └── Safeguards: Concurrency lock, pre-cycle integrity check, 3-failure circuit breaker

[STAGE 5: FULL PRODUCTION PROMOTION]
  ├── Prerequisites: Formal business sign-off
  └── Command: ForexRolloutController.advanceStage('STAGE_5_FULL_USD_PRODUCTION', { explicitApproval: true })
```

---

## 6. Emergency Kill Switch & Incident Response

1. **Immediate System Halt**:
   - Run `POST /api/admin/forex-calendar/stage/emergency-halt` or set `FOREX_CALENDAR_ENABLED=false` and `ECONOMIC_CALENDAR_SCHEDULER_ENABLED=false`.
2. **Circuit Breaker Auto-Trip**:
   - If 3 consecutive failures occur during scheduled operations, the circuit breaker automatically halts future cycles and logs incident telemetry.
3. **Database State Restoration**:
   - In the event of any data anomaly, run `node backend/scripts/restore_production_data.js` to immediately restore the 11 verified baseline Indian events.

---

## 7. Master Test & Verification Suite

Execute all verification test suites prior to production deployment:

```bash
# 1. Master Production Readiness Verification (30+ Criteria)
node scripts/test_production_master_readiness.js

# 2. Controlled USD Rollout Controller (21/21 Passing)
node scripts/test_phase7_6_usd_rollout.js

# 3. End-to-End System Verification (27/27 Passing)
node scripts/test_phase7_5_step3_e2e_verification.js

# 4. Frontend Multi-Currency Integration (19/19 Passing)
node scripts/test_phase7_5_step2_frontend_integration.js

# 5. Controlled Scheduler Canary (19/19 Passing)
node scripts/test_phase7_5_step1_scheduler_canary.js

# 6. Canary Monitoring & Production Readiness (23/23 Passing)
node scripts/test_phase7_4_step4_canary_monitoring.js

# 7. Deployment Readiness Smoke Tests (23/23 Passing)
node scripts/test_phase6_1_deployment_readiness.js
```
