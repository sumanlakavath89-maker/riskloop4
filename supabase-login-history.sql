-- ============================================================
-- RISKLOOP USER LOGIN HISTORY SCHEMA (SUPABASE POSTGRESQL)
-- Production migration for Secure Authentication Activity Logs
-- ============================================================

create table if not exists public.user_login_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  login_at timestamp with time zone default timezone('utc'::text, now()) not null,
  device_browser text not null,
  approx_location text default 'Location unavailable',
  auth_method text default 'Email Login' not null,
  status text default 'Successful' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.user_login_history enable row level security;

-- Strict User Access Policies
create policy if not exists "Users can view their own login history"
  on public.user_login_history for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own login history"
  on public.user_login_history for insert
  with check (auth.uid() = user_id);
