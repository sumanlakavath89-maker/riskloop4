-- ============================================================
-- RISKLOOP SUPPORT TICKETS SCHEMA (SUPABASE POSTGRESQL)
-- Production migration for Support Requests & Real-Time Messages
-- ============================================================

-- 1. SUPPORT TICKETS TABLE
create table if not exists public.support_tickets (
  id uuid default uuid_generate_v4() primary key,
  ticket_number text unique not null, -- e.g. TICK-84920
  user_id uuid references public.profiles(id) on delete cascade not null,
  user_email text not null,
  user_name text,
  subject text not null,
  category text not null, -- 'Account', 'Billing', 'Broker Connection', 'Calculator', 'Journal', 'Portfolio', 'Technical Issue', 'Other'
  priority text default 'Medium' not null, -- 'Low', 'Medium', 'High', 'Urgent'
  status text default 'Open' not null, -- 'Open', 'In Progress', 'Waiting for User', 'Resolved', 'Closed'
  assigned_agent text default 'RiskLoop Support Team',
  description text not null,
  attachment_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.support_tickets enable row level security;

-- Strict User Access Policies
create policy if not exists "Users can view their own tickets"
  on public.support_tickets for select
  using (auth.uid() = user_id);

create policy if not exists "Users can create tickets"
  on public.support_tickets for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update their own tickets"
  on public.support_tickets for update
  using (auth.uid() = user_id);

-- 2. TICKET MESSAGES / CONVERSATIONS TABLE
create table if not exists public.ticket_messages (
  id uuid default uuid_generate_v4() primary key,
  ticket_id uuid references public.support_tickets(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_type text default 'user' not null, -- 'user', 'agent', 'system'
  sender_name text not null,
  message text not null,
  attachment_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.ticket_messages enable row level security;

-- Message Access Policies (User can read/write messages for tickets they own)
create policy if not exists "Users can view messages for their tickets"
  on public.ticket_messages for select
  using (
    exists (
      select 1 from public.support_tickets
      where public.support_tickets.id = ticket_messages.ticket_id
      and public.support_tickets.user_id = auth.uid()
    )
  );

create policy if not exists "Users can post messages to their tickets"
  on public.ticket_messages for insert
  with check (
    exists (
      select 1 from public.support_tickets
      where public.support_tickets.id = ticket_messages.ticket_id
      and public.support_tickets.user_id = auth.uid()
    )
  );
