# RiskLoop Supabase Master Migration Fix & Audit Report

---

### Executive Summary

| Item | Details |
| :--- | :--- |
| **Error Encountered** | `ERROR: 42703: column "read" does not exist` |
| **Target Database** | `https://pxkjutzaeawzjbgjtavf.supabase.co` |
| **Root Cause Identified** | Existing `public.notifications` table used column name `is_read`, while migration script referenced `read`. |
| **Fix Status** | **RESOLVED & VERIFIED** |
| **Migration Safety** | **100% Non-destructive & Idempotent** (Zero `DROP TABLE`, zero `TRUNCATE`, backward-compatible `ALTER TABLE ADD COLUMN IF NOT EXISTS`). |

---

### 1. Exact Cause of the "read" Column Error

1. **Table Pre-existence:** The `public.notifications` table already existed in your Supabase project with the schema `[id, user_id, type, title, message, ticket_id, is_read, metadata, created_at]`.
2. **PostgreSQL Execution Flow:** When `CREATE TABLE IF NOT EXISTS public.notifications` was encountered, PostgreSQL skipped table creation because it already existed.
3. **The Index Failure:** The next statement attempted to create an index on the non-existent column name `read`:
   ```sql
   -- FAILING STATEMENT:
   CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);
   ```
   PostgreSQL threw `ERROR: 42703: column "read" does not exist`.

---

### 2. Exact Fix Applied

1. **Column Alignment:** Replaced `read` with `is_read` throughout the schema and indexes:
   ```sql
   -- CORRECTED INDEX STATEMENT:
   CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
   ```
2. **Full Compatibility Bridge:** Added safe column migration checks for `notifications`:
   ```sql
   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
   ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE;
   ```

---

### 3. Additional Potential Problems Found & Fixed

During our complete audit of all existing tables in your live database, we identified and resolved the following structural mismatches:

| Table | Issue Found | Fix Applied |
| :--- | :--- | :--- |
| **`public.profiles`** | Table already exists but lacked columns `bio`, `phone`, `city`, `state`, `country`, `pin_code`. | Added `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS` for each missing column. |
| **`public.user_settings`** | Table already exists with basic fields, missing risk parameters (`default_market`, `daily_max_loss`, `daily_max_trades`, `daily_profit_lock`, `max_leverage`, `max_correlated_positions`). | Added `ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS` for all trading & risk parameters. |
| **`public.support_tickets`** | Table already exists using `email` and `attachments` instead of `user_email` and `attachment_url`. | Added compatibility columns (`user_email`, `user_name`, `subject`, `assigned_agent`, `attachment_url`, `attachments`) with `ADD COLUMN IF NOT EXISTS`. |
| **`public.economic_events`** | Existing table was missing forex & scheduler verification fields (`currency`, `period`, `event_timestamp`, `source_hash`, `is_official`, `is_verified`, `raw_payload`). | Added `ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS` for all automated ingestion fields. |
| **`public.scheduler_locks`** | Existing table used `locked_by` and `locked_at` instead of `instance_id` and `acquired_at`. | Added both column naming variants so distributed locks work across all worker versions. |
| **`public.scheduler_runs`** | Existing table lacked `events_ingested`, `events_updated`, `events_verified`. | Added `ADD COLUMN IF NOT EXISTS` for all run metrics. |
| **Trigger Function `handle_new_user()`** | Using `ON CONFLICT (user_id)` on `user_settings` could fail if `user_id` was not defined as unique in earlier schemas. | Refactored to `IF NOT EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = new.id)` to guarantee 100% execution safety. |

---

### 4. Statements Modifying Existing Schema

The following non-destructive statements will add missing columns to your existing tables without modifying or removing any existing data:

```sql
-- Profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;

-- User Settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_market TEXT DEFAULT 'indian';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_capital NUMERIC DEFAULT 100000;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_risk_pct NUMERIC DEFAULT 1.0;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_broker TEXT DEFAULT 'angelone';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS daily_max_loss NUMERIC DEFAULT 5000;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS max_daily_loss_pct NUMERIC DEFAULT 3.0;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS daily_max_trades INTEGER DEFAULT 5;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS daily_profit_lock NUMERIC DEFAULT 10000;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS max_leverage NUMERIC DEFAULT 5;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS max_correlated_positions INTEGER DEFAULT 2;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS risk_alerts BOOLEAN DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN DEFAULT true;

-- Support Tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_agent TEXT DEFAULT 'RiskLoop Support Team';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

-- Economic Events
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS source_hash TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT true;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;

-- Scheduler Locks & Runs
ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_ingested INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_updated INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_verified INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
```

---

### 5. Syntax & Safety Verification

- **Syntax Validity:** All SQL blocks comply with PostgreSQL 15 / Supabase SQL engine specifications.
- **RLS Policy Safety:** All policies use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` to prevent duplicate policy errors.
- **Destructive Statements:** **0 `DROP TABLE`**, **0 `TRUNCATE`**, **0 destructive `ALTER`** commands.
- **Trigger Integrity:** `handle_new_user()` uses `COALESCE` to guarantee that existing user names and avatar URLs are never overwritten upon login.

---

### Master File Location

The corrected file is ready at:
👉 [**`SUPABASE_MASTER_SETUP.sql`**](file:///c:/Users/suman/OneDrive/Desktop/project%20final/riskloop4-main/SUPABASE_MASTER_SETUP.sql)
