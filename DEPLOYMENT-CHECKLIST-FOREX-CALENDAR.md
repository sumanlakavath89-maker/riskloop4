# RiskLoop Forex Economic Calendar Production Deployment Checklist & Runbook

## 1. Overview
This runbook provides the verification, operational safeguards, and step-by-step rollout procedures for the RiskLoop Forex (USD Macroeconomic) Economic Calendar subsystem across Phase 7.1 through Phase 7.5.

---

## 2. Pre-Deployment Configuration Audit

| Configuration / Variable | Expected Default Value | Purpose / Notes | Verified |
| :--- | :--- | :--- | :---: |
| `FOREX_CALENDAR_ENABLED` | `false` (Default) | Master feature flag for Forex Economic Calendar | ✅ |
| `FOREX_CALENDAR_SCHEDULER_ENABLED` | `false` (Default) | Background recurring scheduler switch | ✅ |
| `FOREX_CALENDAR_LIVE_INGESTION_ENABLED` | `false` (Default) | Authorization switch for Supabase live mutations | ✅ |
| `FOREX_CALENDAR_CANARY_CURRENCIES` | `""` (Empty / Default) | Comma-separated allowed canary currencies (e.g. `USD`) | ✅ |
| `SUPABASE_URL` | Valid HTTPS URL | Connects to production Supabase project | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` / `ANON_KEY` | Valid Service Role / Anon Key | Authenticates backend queries and transactions | ✅ |

---

## 3. Official Source Providers & Whitelist

| Provider | Official Domain Whitelist | Indicators Supported | Announcement Time |
| :--- | :--- | :--- | :--- |
| **BLS** (U.S. Bureau of Labor Statistics) | `https://www.bls.gov` | Non-Farm Payrolls, Unemployment Rate, CPI, Core CPI, PPI | 08:30 America/New_York |
| **BEA** (U.S. Bureau of Economic Analysis) | `https://www.bea.gov` | GDP (Advance, Preliminary, Final), PCE Price Index, Core PCE | 08:30 America/New_York |
| **Federal Reserve** (Board of Governors) | `https://www.federalreserve.gov` | FOMC Interest Rate Decision, FOMC Economic Projections | 14:00 America/New_York |

*Note: Strict zero-AI, zero-paid API, and zero-third-party-scraper policy enforced. Only official .gov domains parsed.*

---

## 4. Operational Endpoints Reference

### Public / Client Endpoints:
- `GET /api/market/economic-calendar?country=US` - Query USD macroeconomic events.
- `GET /api/market/economic-calendar?country=IN` - Query Indian macroeconomic events.
- `GET /api/economic-calendar?currency=USD` - Standard Forex calendar events query.

### Protected Admin Operations Endpoints (`/api/admin/forex-calendar`):
- `GET /rollout-status` - Real-time rollout mode, currency permissions, and provider health diagnostics.
- `GET /readiness` - Production readiness checklist, database integrity verification, and rollout verdict.
- `GET /audit-history` - Persistent FIFO audit trail of all canary mutations, verification checks, and rollbacks.

---

## 5. Phased Production Rollout Sequence

### Step 1: Discovery & Dry-Run Verification (Default Mode)
- Flags: `FOREX_CALENDAR_ENABLED=false`, `FOREX_CALENDAR_LIVE_INGESTION_ENABLED=false`
- Action: Validate upstream fetching from BLS, BEA, and Federal Reserve in dry-run mode.
- Verification: Inspect `GET /api/admin/forex-calendar/rollout-status` $\rightarrow$ mode reports `disabled`, `databaseWritesAllowed: false`.

### Step 2: Controlled USD Canary Live Ingestion (Manual Batch)
- Flags: `FOREX_CALENDAR_ENABLED=true`, `FOREX_CALENDAR_LIVE_INGESTION_ENABLED=true`, `FOREX_CALENDAR_CANARY_CURRENCIES=USD`, `FOREX_CALENDAR_SCHEDULER_ENABLED=false`
- Action: Execute single controlled batch of max 5 events via `ForexCanarySafetyService`.
- Safeguard: Immediate post-write checksum verification with automatic per-record rollback on failure.

### Step 3: Scheduled USD Canary Ingestion (Automated Low-Frequency)
- Flags: `FOREX_CALENDAR_ENABLED=true`, `FOREX_CALENDAR_SCHEDULER_ENABLED=true`, `FOREX_CALENDAR_LIVE_INGESTION_ENABLED=true`, `FOREX_CALENDAR_CANARY_CURRENCIES=USD`
- Action: Automated hourly cycle protected by pre-cycle database integrity gate and concurrency locks.
- Circuit Breaker: Automatically trips and halts scheduling if 3 consecutive errors occur.

### Step 4: Full Multi-Currency Promotion
- Flags: `FOREX_CALENDAR_CANARY_CURRENCIES=ALL`
- Action: Full production ingestion active across all supported currency streams.

---

## 6. Emergency Kill Switch & Rollback Procedures

1. **Immediate Emergency Stop**:
   Set `FOREX_CALENDAR_ENABLED=false` in environment or backend `.env`. This instantly terminates all discovery, scheduling, and write operations.
2. **Circuit Breaker Trip**:
   If an unexpected schema or network error occurs, the circuit breaker automatically halts scheduled writes. Admin can inspect audit logs via `GET /api/admin/forex-calendar/audit-history`.
3. **Database Rollback Protection**:
   `ForexCanarySafetyService` takes an immutable pre-write state snapshot and restores previous values if post-write verification fails.

---

## 7. Full Test Suite Execution

Run the complete regression suite before any production rollout:

```bash
# Phase 7.5 Step 3: End-to-End System Audit (30/30 Passing)
node scripts/test_phase7_5_step3_e2e_verification.js

# Phase 7.5 Step 2: Frontend Multi-Currency Integration (19/19 Passing)
node scripts/test_phase7_5_step2_frontend_integration.js

# Phase 7.5 Step 1: Controlled Scheduler Canary (19/19 Passing)
node scripts/test_phase7_5_step1_scheduler_canary.js

# Phase 7.4 Step 4: Canary Monitoring & Readiness (23/23 Passing)
node scripts/test_phase7_4_step4_canary_monitoring.js

# Phase 7.4 Step 3: Controlled Canary Safety (20/20 Passing)
node scripts/test_phase7_4_step3_controlled_canary.js

# Phase 7.4 Step 2: Production Dry-Run Validation (27/27 Passing)
node scripts/test_phase7_4_step2_production_dryrun.js

# Phase 7.4 Step 1: Forex Calendar Scheduler (21/21 Passing)
node scripts/test_phase7_4_step1_forex_scheduler.js

# Phase 6.1: India Calendar Production Readiness (23/23 Passing)
node scripts/test_phase6_1_deployment_readiness.js
```
