-- ============================================================
-- RISKLOOP LEADERBOARD SYSTEM (SUPABASE POSTGRESQL)
-- Production-ready schema for Trader Performance Leaderboards,
-- Multi-factor RiskLoop Scoring, Privacy Controls, and Verified Badges
-- ============================================================

-- 1. EXTEND OR CREATE LEADERBOARD PROFILES SETTINGS
create table if not exists public.leaderboard_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  display_name text,
  privacy_mode text default 'public' check (privacy_mode in ('public', 'anonymous', 'private')),
  is_verified boolean default false,
  verified_broker text,
  country_code text default 'IN',
  bio text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.leaderboard_profiles enable row level security;

-- RLS: Public and Anonymous profiles are visible to all authenticated users, Private profiles only to owner
create policy "Leaderboard profiles viewable by status"
  on public.leaderboard_profiles for select
  using (
    privacy_mode in ('public', 'anonymous')
    or (auth.uid() = user_id)
  );

create policy "Users can update their own leaderboard profile"
  on public.leaderboard_profiles for all
  using (auth.uid() = user_id);

-- 2. LEADERBOARD STATS TABLE (Aggregated performance records by period)
create table if not exists public.leaderboard_stats (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  period text check (period in ('today', 'week', 'month', 'all_time')) not null,
  
  -- Core performance metrics
  return_pct numeric default 0 not null,
  win_rate numeric default 0 not null,         -- e.g. 64.5 (%)
  profit_factor numeric default 0 not null,    -- e.g. 2.15
  avg_r numeric default 0 not null,            -- e.g. 1.85 (Reward:Risk ratio)
  max_drawdown numeric default 0 not null,     -- e.g. 3.2 (%)
  trades_count integer default 0 not null,
  
  -- Consistency & Discipline
  risk_consistency_score numeric default 85 not null, -- 0-100 score
  discipline_score numeric default 90 not null,       -- 0-100 score
  
  -- Verification breakdown
  verified_trades_count integer default 0 not null,
  unverified_trades_count integer default 0 not null,
  is_broker_verified boolean default false not null,
  
  -- RiskLoop Composite Score (0 - 100)
  riskloop_score numeric default 50 not null,
  
  -- Ranking movement
  current_rank integer,
  previous_rank integer,
  rank_movement integer default 0, -- positive = climbed, negative = dropped
  
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, period)
);

alter table public.leaderboard_stats enable row level security;

create policy "Leaderboard stats viewable for eligible profiles"
  on public.leaderboard_stats for select
  using (
    exists (
      select 1 from public.leaderboard_profiles lp
      where lp.user_id = public.leaderboard_stats.user_id
      and (lp.privacy_mode in ('public', 'anonymous') or lp.user_id = auth.uid())
    )
  );

create policy "Users can update their own leaderboard stats"
  on public.leaderboard_stats for all
  using (auth.uid() = user_id);

-- 3. MODULAR RISKLOOP SCORE CALCULATION FUNCTION
-- Formula: Multi-factor weighted score balancing returns with risk control
-- Score = ReturnComponent (25%) + ProfitFactorComponent (20%) + WinRateComponent (15%) + AvgRComponent (15%) + Discipline (15%) + Consistency (10%) - DrawdownPenalty
create or replace function public.calculate_riskloop_score(
  p_return_pct numeric,
  p_profit_factor numeric,
  p_win_rate numeric,
  p_avg_r numeric,
  p_max_drawdown numeric,
  p_discipline numeric,
  p_risk_consistency numeric
) returns numeric as $$
declare
  v_score numeric := 50.0;
  v_return_score numeric := 0;
  v_pf_score numeric := 0;
  v_wr_score numeric := 0;
  v_avgr_score numeric := 0;
  v_dd_penalty numeric := 0;
begin
  -- 1. Return % score (0 to 25 pts, cap at 50% return for period)
  v_return_score := least(greatest(p_return_pct * 0.5, -15.0), 25.0);
  
  -- 2. Profit Factor score (0 to 20 pts, sweet spot >= 2.0)
  v_pf_score := least(greatest((p_profit_factor - 1.0) * 10.0, -10.0), 20.0);
  
  -- 3. Win Rate score (0 to 15 pts, optimal between 45% and 75%)
  if p_win_rate >= 40.0 and p_win_rate <= 75.0 then
    v_wr_score := 15.0 * (p_win_rate / 75.0);
  elsif p_win_rate > 75.0 then
    v_wr_score := 15.0 - ((p_win_rate - 75.0) * 0.2); -- slight penalty for unsustainable >85% winrates (often martingale/no SL)
  else
    v_wr_score := greatest(0.0, p_win_rate * 0.2);
  end if;
  
  -- 4. Average R score (0 to 15 pts, reward Avg R > 1.5)
  v_avgr_score := least(greatest(p_avg_r * 6.0, 0.0), 15.0);
  
  -- 5. Drawdown penalty (exponential penalty for drawdown > 5%)
  if p_max_drawdown > 15.0 then
    v_dd_penalty := (p_max_drawdown - 15.0) * 2.0 + 15.0;
  elsif p_max_drawdown > 5.0 then
    v_dd_penalty := (p_max_drawdown - 5.0) * 1.5;
  else
    v_dd_penalty := 0.0;
  end if;
  
  -- Composite calculation
  v_score := 40.0 
             + v_return_score 
             + v_pf_score 
             + v_wr_score 
             + v_avgr_score 
             + (coalesce(p_discipline, 80.0) * 0.12)
             + (coalesce(p_risk_consistency, 80.0) * 0.08)
             - v_dd_penalty;
             
  return round(least(greatest(v_score, 10.0), 99.9), 1);
end;
$$ language plpgsql immutable;

-- 4. PUBLIC LEADERBOARD QUERY RPC
-- Returns sanitized leaderboard records without revealing capital/balance
create or replace function public.get_leaderboard_rankings(
  p_period text default 'all_time',
  p_verified_only boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  rank bigint,
  user_id uuid,
  trader_name text,
  privacy_mode text,
  is_verified boolean,
  verified_broker text,
  riskloop_score numeric,
  return_pct numeric,
  win_rate numeric,
  profit_factor numeric,
  avg_r numeric,
  max_drawdown numeric,
  trades_count integer,
  rank_movement integer
) as $$
begin
  return query
  select
    row_number() over (order by ls.riskloop_score desc, ls.return_pct desc) as rank,
    ls.user_id,
    case
      when lp.privacy_mode = 'anonymous' then 'Trader #' || right(ls.user_id::text, 4)
      else coalesce(lp.display_name, p.full_name, 'Trader #' || right(ls.user_id::text, 4))
    end as trader_name,
    lp.privacy_mode,
    ls.is_broker_verified,
    lp.verified_broker,
    ls.riskloop_score,
    ls.return_pct,
    ls.win_rate,
    ls.profit_factor,
    ls.avg_r,
    ls.max_drawdown,
    ls.trades_count,
    ls.rank_movement
  from public.leaderboard_stats ls
  join public.leaderboard_profiles lp on lp.user_id = ls.user_id
  left join public.profiles p on p.id = ls.user_id
  where ls.period = p_period
    and lp.privacy_mode in ('public', 'anonymous')
    and (not p_verified_only or ls.is_broker_verified = true)
  order by ls.riskloop_score desc, ls.return_pct desc
  limit p_limit offset p_offset;
end;
$$ language plpgsql security definer;

-- 5. USER RANK & PERCENTILE RPC
create or replace function public.get_user_leaderboard_rank(
  p_user_id uuid,
  p_period text default 'all_time'
) returns json as $$
declare
  v_rank bigint;
  v_total bigint;
  v_percentile numeric;
  v_movement integer;
  v_score numeric;
begin
  select count(*) into v_total
  from public.leaderboard_stats ls
  join public.leaderboard_profiles lp on lp.user_id = ls.user_id
  where ls.period = p_period and lp.privacy_mode in ('public', 'anonymous');
  
  with ranked as (
    select
      ls.user_id,
      ls.riskloop_score,
      ls.rank_movement,
      row_number() over (order by ls.riskloop_score desc, ls.return_pct desc) as rk
    from public.leaderboard_stats ls
    join public.leaderboard_profiles lp on lp.user_id = ls.user_id
    where ls.period = p_period and lp.privacy_mode in ('public', 'anonymous')
  )
  select rk, riskloop_score, rank_movement into v_rank, v_score, v_movement
  from ranked
  where ranked.user_id = p_user_id;
  
  if v_total > 0 and v_rank is not null then
    v_percentile := round((v_rank::numeric / v_total::numeric) * 100.0, 1);
  else
    v_percentile := null;
  end if;
  
  return json_build_object(
    'rank', v_rank,
    'total_participants', coalesce(v_total, 0),
    'percentile', v_percentile,
    'rank_movement', coalesce(v_movement, 0),
    'riskloop_score', coalesce(v_score, 50.0)
  );
end;
$$ language plpgsql security definer;
