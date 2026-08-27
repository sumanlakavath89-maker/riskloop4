-- =============================================================================
-- RISKLOOP ECONOMIC CALENDAR INCIDENT MANAGEMENT & NOTIFICATION DELIVERY SCHEMA
-- =============================================================================

-- 1. Incidents Table
CREATE TABLE IF NOT EXISTS public.economic_calendar_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_key TEXT NOT NULL, -- e.g. 'STALE_SCHEDULER_RUN', 'DATABASE_CONNECTION_ERROR'
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    title TEXT NOT NULL,
    description TEXT,
    reasons JSONB DEFAULT '[]'::jsonb,
    health_snapshot JSONB DEFAULT '{}'::jsonb,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying active incidents quickly
CREATE INDEX IF NOT EXISTS idx_ec_incidents_status ON public.economic_calendar_incidents(status);
CREATE INDEX IF NOT EXISTS idx_ec_incidents_key_status ON public.economic_calendar_incidents(incident_key, status);
CREATE INDEX IF NOT EXISTS idx_ec_incidents_opened_at ON public.economic_calendar_incidents(opened_at DESC);

-- 2. Notifications Table
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ec_notifications_incident ON public.economic_calendar_notifications(incident_id);
CREATE INDEX IF NOT EXISTS idx_ec_notifications_status ON public.economic_calendar_notifications(status);

-- Enable RLS
ALTER TABLE public.economic_calendar_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economic_calendar_notifications ENABLE ROW LEVEL SECURITY;

-- Service Role Policies (Full read/write for backend server)
CREATE POLICY "Service role full access on economic_calendar_incidents"
    ON public.economic_calendar_incidents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on economic_calendar_notifications"
    ON public.economic_calendar_notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
