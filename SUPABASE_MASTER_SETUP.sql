-- =============================================================================
-- RISKLOOP MASTER SUPABASE PRODUCTION SCHEMA & MIGRATION SCRIPT
-- =============================================================================
-- Safe, Idempotent, and Non-Destructive:
-- - Uses CREATE TABLE IF NOT EXISTS for all new tables
-- - Uses ALTER TABLE ADD COLUMN IF NOT EXISTS to safely adapt existing tables
-- - Preserves all existing tables, rows, and user configurations
-- - Fixes the notification column name to 'is_read'
-- - Configures Row Level Security (RLS) policies safely with exception handlers
-- - Enforces strict user isolation (auth.uid() = user_id)
-- - Configures non-destructive User Creation Trigger on auth.users
-- - ZERO DROP TABLE, TRUNCATE, or destructive ALTER operations
-- =============================================================================

-- Enable standard UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. PROFILES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'India',
  pin_code TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add any missing profile columns if table was created in an earlier migration
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on profiles" ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. USER SETTINGS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  theme TEXT DEFAULT 'dark',
  default_market TEXT DEFAULT 'indian',
  default_capital NUMERIC DEFAULT 100000,
  default_risk_pct NUMERIC DEFAULT 1.0,
  default_broker TEXT DEFAULT 'angelone',
  daily_max_loss NUMERIC DEFAULT 5000,
  max_daily_loss_pct NUMERIC DEFAULT 3.0,
  daily_max_trades INTEGER DEFAULT 5,
  daily_profit_lock NUMERIC DEFAULT 10000,
  max_leverage NUMERIC DEFAULT 5,
  max_correlated_positions INTEGER DEFAULT 2,
  email_notifications BOOLEAN DEFAULT true,
  risk_alerts BOOLEAN DEFAULT true,
  auto_sync BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure unique index on user_id for fast lookup and relational integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Safely add any missing settings columns to existing table
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
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on user_settings" ON public.user_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 3. USER LOGIN HISTORY & SECURITY ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_login_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  login_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  device_browser TEXT NOT NULL,
  approx_location TEXT DEFAULT 'Location unavailable',
  auth_method TEXT DEFAULT 'Email Login' NOT NULL,
  status TEXT DEFAULT 'Successful' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_login_history_user ON public.user_login_history(user_id, login_at DESC);

ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own login history" ON public.user_login_history FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own login history" ON public.user_login_history FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on user_login_history" ON public.user_login_history FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 4. SUPPORT TICKETS & REAL-TIME MESSAGES ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_email TEXT,
  email TEXT,
  user_name TEXT,
  subject TEXT,
  category TEXT NOT NULL,
  priority TEXT DEFAULT 'Medium' NOT NULL,
  status TEXT DEFAULT 'Open' NOT NULL,
  assigned_agent TEXT DEFAULT 'RiskLoop Support Team',
  description TEXT NOT NULL,
  attachment_url TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add any missing support ticket columns
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_agent TEXT DEFAULT 'RiskLoop Support Team';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own tickets" ON public.support_tickets FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on support_tickets" ON public.support_tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_type TEXT DEFAULT 'user' NOT NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id, created_at ASC);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view messages for their tickets" ON public.ticket_messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE public.support_tickets.id = ticket_messages.ticket_id
      AND public.support_tickets.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can post messages to their tickets" ON public.ticket_messages FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE public.support_tickets.id = ticket_messages.ticket_id
      AND public.support_tickets.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on ticket_messages" ON public.ticket_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 5. NOTIFICATIONS SYSTEM ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT DEFAULT 'system' NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  data JSONB DEFAULT '{}'::jsonb,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add columns if table was created with an alternate schema
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE CASCADE;

-- High-performance indexes using verified 'is_read' column
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role has full access to notifications" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 6. ECONOMIC CALENDAR & AUTOMATION SUBSYSTEMS ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  country TEXT,
  country_code TEXT NOT NULL DEFAULT 'IN',
  currency TEXT NOT NULL DEFAULT 'INR',
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low', 'holiday')),
  period TEXT,
  actual TEXT,
  forecast TEXT,
  previous TEXT,
  unit TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'active',
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  event_timestamp TIMESTAMPTZ,
  source_hash TEXT,
  is_official BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Safely add missing columns to economic_events
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS source_hash TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT true;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_economic_events_lookup ON public.economic_events(country_code, event_date, impact);

ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read access on economic_events" ON public.economic_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on economic_events" ON public.economic_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.scheduler_locks (
  lock_name TEXT PRIMARY KEY,
  instance_id TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  acquired_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.scheduler_locks ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE public.scheduler_locks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on scheduler_locks" ON public.scheduler_locks FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.scheduler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduler_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at TIMESTAMPTZ,
  events_checked INTEGER DEFAULT 0,
  events_released INTEGER DEFAULT 0,
  events_ingested INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_verified INTEGER DEFAULT 0,
  error_message TEXT,
  errors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_checked INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_released INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_ingested INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_updated INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS events_verified INTEGER DEFAULT 0;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.scheduler_runs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on scheduler_runs" ON public.scheduler_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.economic_calendar_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL,
  description TEXT,
  reasons JSONB DEFAULT '[]'::jsonb,
  health_snapshot JSONB DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.economic_calendar_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on economic_calendar_incidents" ON public.economic_calendar_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.economic_calendar_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES public.economic_calendar_incidents(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('incident_opened', 'incident_reminder', 'incident_resolved')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app', 'console', 'webhook')),
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.economic_calendar_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access on economic_calendar_notifications" ON public.economic_calendar_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 7. LEADERBOARD SYSTEM ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leaderboard_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name TEXT,
  privacy_mode TEXT DEFAULT 'public' CHECK (privacy_mode IN ('public', 'anonymous', 'private')),
  is_verified BOOLEAN DEFAULT false,
  verified_broker TEXT,
  country_code TEXT DEFAULT 'IN',
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.leaderboard_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Leaderboard profiles viewable by status" ON public.leaderboard_profiles FOR SELECT USING (
    privacy_mode IN ('public', 'anonymous') OR (auth.uid() = user_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own leaderboard profile" ON public.leaderboard_profiles FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on leaderboard_profiles" ON public.leaderboard_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.leaderboard_stats (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  period TEXT CHECK (period IN ('today', 'week', 'month', 'all_time')) NOT NULL,
  return_pct NUMERIC DEFAULT 0 NOT NULL,
  win_rate NUMERIC DEFAULT 0 NOT NULL,
  profit_factor NUMERIC DEFAULT 0 NOT NULL,
  avg_r NUMERIC DEFAULT 0 NOT NULL,
  max_drawdown NUMERIC DEFAULT 0 NOT NULL,
  trades_count INTEGER DEFAULT 0 NOT NULL,
  risk_consistency_score NUMERIC DEFAULT 85 NOT NULL,
  discipline_score NUMERIC DEFAULT 90 NOT NULL,
  verified_trades_count INTEGER DEFAULT 0 NOT NULL,
  unverified_trades_count INTEGER DEFAULT 0 NOT NULL,
  is_broker_verified BOOLEAN DEFAULT false NOT NULL,
  riskloop_score NUMERIC DEFAULT 50 NOT NULL,
  rank_movement INTEGER DEFAULT 0 NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT uq_user_period UNIQUE (user_id, period)
);

ALTER TABLE public.leaderboard_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Leaderboard stats are public" ON public.leaderboard_stats FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert and update leaderboard stats" ON public.leaderboard_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 8. AUTO USER INITIALIZATION TRIGGER ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Safely Upsert Profile (preserve existing custom values)
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    updated_at = timezone('utc'::text, now());

  -- 2. Safely Initialize User Settings if not present
  IF NOT EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = new.id) THEN
    INSERT INTO public.user_settings (user_id) VALUES (new.id);
  END IF;

  -- 3. Safely Initialize Leaderboard Profile if not present
  IF NOT EXISTS (SELECT 1 FROM public.leaderboard_profiles WHERE user_id = new.id) THEN
    INSERT INTO public.leaderboard_profiles (user_id, display_name)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- =============================================================================
-- 15. JOURNAL TRADES (Execution logs, notes, psychology, and screenshots)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.journal_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  symbol TEXT NOT NULL,
  market TEXT DEFAULT 'indian',
  instrument_type TEXT DEFAULT 'EQUITY',
  side TEXT NOT NULL DEFAULT 'BUY',
  quantity NUMERIC NOT NULL DEFAULT 1,
  entry_price NUMERIC NOT NULL DEFAULT 0,
  exit_price NUMERIC,
  stop_loss NUMERIC,
  target_price NUMERIC,
  broker TEXT DEFAULT 'Manual',
  pnl NUMERIC NOT NULL DEFAULT 0,
  pnl_percentage NUMERIC DEFAULT 0,
  strategy_tag TEXT DEFAULT '',
  psychology_rating INTEGER DEFAULT 3,
  notes TEXT DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_journal_trades_user_id ON public.journal_trades (user_id);
CREATE INDEX IF NOT EXISTS idx_journal_trades_date ON public.journal_trades (user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_trades_images_gin ON public.journal_trades USING gin (images);

ALTER TABLE public.journal_trades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'journal_trades' AND policyname = 'Users can view their own journal trades'
  ) THEN
    CREATE POLICY "Users can view their own journal trades"
      ON public.journal_trades FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'journal_trades' AND policyname = 'Users can insert their own journal trades'
  ) THEN
    CREATE POLICY "Users can insert their own journal trades"
      ON public.journal_trades FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'journal_trades' AND policyname = 'Users can update their own journal trades'
  ) THEN
    CREATE POLICY "Users can update their own journal trades"
      ON public.journal_trades FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'journal_trades' AND policyname = 'Users can delete their own journal trades'
  ) THEN
    CREATE POLICY "Users can delete their own journal trades"
      ON public.journal_trades FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MASTER SETUP SCRIPT
-- =============================================================================
