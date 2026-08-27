-- ============================================================
-- Supabase Schema & Constraints for Economic Calendar Events
-- ============================================================

-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS public.economic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'India',
    country_code TEXT NOT NULL DEFAULT 'IN',
    event_date DATE NOT NULL,
    event_time TIME WITHOUT TIME ZONE DEFAULT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    impact TEXT CHECK (impact IN ('low', 'medium', 'high')) DEFAULT 'medium',
    previous TEXT DEFAULT NULL,
    forecast TEXT DEFAULT NULL,
    actual TEXT DEFAULT NULL,
    unit TEXT DEFAULT '%',
    source TEXT NOT NULL,
    source_url TEXT DEFAULT NULL,
    status TEXT CHECK (status IN ('upcoming', 'released')) DEFAULT 'upcoming',
    description TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for fast date-range filtering
CREATE INDEX IF NOT EXISTS idx_economic_events_lookup 
ON public.economic_events (country_code, event_date, event_time);

-- 3. Create Unique Composite Index to prevent duplicate events on the same date
-- This enables idempotent upserts on (country_code, event_name, event_date)
CREATE UNIQUE INDEX IF NOT EXISTS uq_economic_events_key 
ON public.economic_events (country_code, event_name, event_date);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow public read access to all users
DROP POLICY IF EXISTS "Public can view economic events" ON public.economic_events;
CREATE POLICY "Public can view economic events" 
ON public.economic_events FOR SELECT 
USING (true);

-- Allow service role full write access
DROP POLICY IF EXISTS "Service role can manage economic events" ON public.economic_events;
CREATE POLICY "Service role can manage economic events" 
ON public.economic_events FOR ALL 
USING (true)
WITH CHECK (true);
