-- ============================================================
-- RISKLOOP INSTITUTIONAL DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Run this script in your Supabase Project SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Linked with Supabase Auth Users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  avatar_public_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone." 
  on public.profiles for select using (true);

create policy "Users can insert their own profile." 
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile." 
  on public.profiles for update using (auth.uid() = id);

-- 2. USER SETTINGS TABLE (Risk parameters, default broker, UI preferences)
create table if not exists public.user_settings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  default_capital numeric default 500000 not null,
  default_risk_pct numeric default 1.0 not null,
  max_daily_loss_pct numeric default 3.0 not null,
  default_broker text default 'angel-one',
  theme text default 'dark',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
  on public.user_settings for select using (auth.uid() = user_id);

create policy "Users can modify their own settings"
  on public.user_settings for all using (auth.uid() = user_id);

-- 3. JOURNAL TRADES TABLE (Trade execution log & psychology notes)
create table if not exists public.journal_trades (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  trade_date date default current_date not null,
  symbol text not null,
  instrument_type text default 'EQUITY' not null, -- 'EQUITY', 'F&O', 'FOREX', 'CRYPTO'
  side text check (side in ('BUY', 'SELL')) not null,
  quantity numeric not null,
  entry_price numeric not null,
  exit_price numeric,
  stop_loss numeric,
  target_price numeric,
  broker text,
  pnl numeric default 0,
  pnl_percentage numeric default 0,
  strategy_tag text,
  psychology_rating int check (psychology_rating between 1 and 5),
  notes text,
  images jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.journal_trades enable row level security;

create policy "Users can manage their own journal trades"
  on public.journal_trades for all using (auth.uid() = user_id);

-- 4. AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP (Email & Google OAuth)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$ language plpgsql security definer;

-- Trigger definition
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
