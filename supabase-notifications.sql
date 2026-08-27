-- ============================================================
-- RISKLOOP NOTIFICATIONS DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Run this script in your Supabase Project SQL Editor
--
-- Safely creates the public.notifications table, indexes, 
-- Row Level Security (RLS) policies, and Supabase Realtime publication.
-- Does NOT touch or modify existing profiles, auth, user_settings,
-- journal_trades, support_tickets, or support_ticket_messages tables.
-- ============================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('support_reply', 'customer_reply', 'ticket_status_change', 'ticket_resolved')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ticket_id UUID NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INDEXES FOR HIGH-PERFORMANCE NOTIFICATION QUERIES
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_ticket_id 
  ON public.notifications(ticket_id);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES FOR NOTIFICATIONS (Safe & Idempotent)
DO $$
BEGIN
  -- SELECT Policy: Authenticated users can view ONLY their own notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' 
      AND policyname = 'Users can view their own notifications'
  ) THEN
    CREATE POLICY "Users can view their own notifications"
      ON public.notifications FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- INSERT Policy: Block direct client-side creation (backend service role creates notifications)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' 
      AND policyname = 'Disallow client-side notification insert'
  ) THEN
    CREATE POLICY "Disallow client-side notification insert"
      ON public.notifications FOR INSERT
      WITH CHECK (false);
  END IF;

  -- UPDATE Policy: Authenticated users can update ONLY their own notifications (e.g. mark as read)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' 
      AND policyname = 'Users can update their own notifications'
  ) THEN
    CREATE POLICY "Users can update their own notifications"
      ON public.notifications FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- DELETE Policy: Block client-side deletion
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' 
      AND policyname = 'Disallow client-side notification delete'
  ) THEN
    CREATE POLICY "Disallow client-side notification delete"
      ON public.notifications FOR DELETE
      USING (false);
  END IF;
END $$;

-- 5. ENABLE SUPABASE REALTIME FOR NOTIFICATIONS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Graceful fallback if publication is not configured in environment
    NULL;
END $$;
