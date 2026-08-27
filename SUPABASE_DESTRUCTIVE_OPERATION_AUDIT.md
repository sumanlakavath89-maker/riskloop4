# RiskLoop Supabase Destructive Operation Audit & Verification

---

### Audit Status: **SAFE TO RUN** (100% Non-Destructive Verified)

| Assessment Criterion | Result |
| :--- | :---: |
| **`DROP TABLE` / `TRUNCATE` Statements** | **0 (None)** |
| **`DROP TRIGGER` / `DROP POLICY` Statements** | **0 (None)** |
| **Destructive `ALTER TABLE ... DROP`** | **0 (None)** |
| **Existing Data Overwrite Risk** | **0% (Preserved via `IF NOT EXISTS` & `COALESCE`)** |
| **Final Classification** | **A) SAFE TO RUN** |

---

### Statement-by-Statement Audit of Flagged Operations

Supabase SQL Editor uses static keyword matching that triggers a warning banner if keywords like `ALTER TABLE`, `UPDATE`, `DELETE`, or `CREATE OR REPLACE` appear in the script. Below is the complete line-by-line breakdown of every flagged keyword:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Operation Risk Classification                        │
├───────────────────────┬───────────────────────────────────┬─────────────────┤
│ Keyword / Statement   │ Purpose                           │ Data Loss Risk  │
├───────────────────────┼───────────────────────────────────┼─────────────────┤
│ ALTER TABLE ... ADD   │ Adds missing columns to old tables│ ZERO (Safe)     │
│ ON DELETE CASCADE     │ Foreign key referential integrity │ ZERO (Safe)     │
│ FOR UPDATE (Policy)   │ Allows users to edit own settings │ ZERO (Safe)     │
│ CREATE OR REPLACE     │ Updates trigger function code     │ ZERO (Safe)     │
│ DO $$ ... EXCEPTION   │ Idempotent policy creation        │ ZERO (Safe)     │
└───────────────────────┴───────────────────────────────────┴─────────────────┘
```

---

### Detailed Line-by-Line Breakdown

#### 1. `DROP TRIGGER` (Previously Line 549 — **REMOVED & REPLACED**)
- **Original Statement:** `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`
- **Why it existed:** Standard PostgreSQL pattern to reload triggers.
- **Risk Assessment:** While it only dropped a trigger hook (not table data), it triggered Supabase's destructive operation scanner.
- **Action Taken:** **Eliminated.** Replaced with a non-destructive conditional check:
  ```sql
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'on_auth_user_created'
    ) THEN
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    END IF;
  END $$;
  ```

---

#### 2. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (Lines 36-41, 91-104, 177-184, 263-267, 322-336, 359-362, 387-394)
- **Statements:**
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT; ...`
  - `ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS default_market TEXT DEFAULT 'indian'; ...`
  - `ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_email TEXT; ...`
  - `ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false; ...`
  - `ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR'; ...`
  - `ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS instance_id TEXT; ...`
  - `ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_ingested INTEGER DEFAULT 0; ...`
- **Why they exist:** Because tables like `profiles` or `user_settings` already exist in your database, `CREATE TABLE IF NOT EXISTS` will skip them. `ADD COLUMN IF NOT EXISTS` ensures that any new columns required by the latest features are added safely.
- **Can it affect existing data?** **NO.** PostgreSQL only appends new nullable or defaulted columns. Existing rows and columns are completely untouched.
- **Is it necessary?** **YES.** Without these statements, queries expecting `bio` or `is_read` would fail on existing tables.

---

#### 3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (Lines 43, 106, 140, 188, 219, 274, 340, 364, 396, 421, 442, 464, 501)
- **Statements:** `ALTER TABLE public.<tablename> ENABLE ROW LEVEL SECURITY;`
- **Why they exist:** Enforces security isolation so users cannot read or write each other's data.
- **Can it affect existing data?** **NO.** It activates security rule enforcement on the table without modifying any table rows.
- **Is it necessary?** **YES.** Required for production security.

---

#### 4. `ON DELETE CASCADE` / `ON DELETE SET NULL` (Lines 20, 47, 129, 160, 208, 209, 250, 254, 306, 330, 355)
- **Statements:** Foreign key constraint options (e.g. `user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE`).
- **Why they exist:** Guarantees referential integrity in relational tables. If a user deletes their account from `auth.users`, their orphaned settings or notifications are cleanly cleaned up.
- **Can it affect existing data?** **NO.** It only defines constraint behavior when rows are deleted in the future.
- **Is it necessary?** **YES.** Standard database practice.

---

#### 5. `FOR UPDATE` (Lines 42, 74, 117, 136, 199, 281, 350, 473, 508)
- **Statements:** Inside RLS policies (e.g. `CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);`).
- **Why they exist:** Grants users permission to edit their own profile/settings while blocking updates to other users' rows.
- **Can it affect existing data?** **NO.** It is a permission definition, not a data modification statement.
- **Is it necessary?** **YES.**

---

#### 6. `CREATE OR REPLACE FUNCTION public.handle_new_user()` (Line 514)
- **Statement:** Defines the auth trigger handler.
- **Why it exists:** Automatically creates `profiles`, `user_settings`, and `leaderboard_profiles` rows when a user signs up.
- **Can it affect existing data?** **NO.** It uses `COALESCE(public.profiles.full_name, EXCLUDED.full_name)` so existing custom names or avatars are **never overwritten**, and `IF NOT EXISTS` checks for `user_settings` and `leaderboard_profiles`.
- **Is it necessary?** **YES.**

---

### Final Safety Verdict

## ✅ **A) SAFE TO RUN**

- Every single `DROP` statement has been eliminated.
- All column additions are non-destructive (`IF NOT EXISTS`).
- All table creations are non-destructive (`IF NOT EXISTS`).
- All index creations are non-destructive (`IF NOT EXISTS`).
- All RLS policies are wrapped in idempotent exception blocks.
- **Zero data loss or schema destruction will occur when running [SUPABASE_MASTER_SETUP.sql](file:///c:/Users/suman/OneDrive/Desktop/project%20final/riskloop4-main/SUPABASE_MASTER_SETUP.sql).**
