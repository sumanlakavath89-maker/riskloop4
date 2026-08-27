-- ============================================================
-- RISKLOOP TRADING SETTINGS SCHEMA (SUPABASE POSTGRESQL)
-- Production migration for Risk Parameters, Execution Rules,
-- Preferred Trading Instruments & Capital Shield Guardrails
-- ============================================================

-- Ensure columns exist in user_settings
alter table if exists public.user_settings 
  add column if not exists default_risk_pct numeric default 1.0,
  add column if not exists max_daily_loss_pct numeric default 3.0,
  add column if not exists max_open_risk_pct numeric default 5.0,
  add column if not exists min_rr_ratio numeric default 2.0,
  add column if not exists max_position_size numeric default 250000,
  add column if not exists max_trades_per_day integer default 6,
  add column if not exists max_consecutive_losses integer default 3,
  add column if not exists stop_after_daily_loss boolean default true,
  add column if not exists stop_after_consecutive_losses boolean default true,
  add column if not exists allow_outside_sessions boolean default false,
  add column if not exists allow_weekend_trading boolean default false,
  add column if not exists require_stop_loss boolean default true,
  add column if not exists require_min_rr boolean default true,
  add column if not exists preferred_instruments jsonb default '["Index Options (Nifty / BankNifty)", "Equity Cash", "Forex Majors"]',
  add column if not exists preferred_sessions jsonb default '["Indian Session (NSE/BSE)", "London Forex Session"]',
  add column if not exists trading_style text default 'Momentum Day Trader',
  add column if not exists account_currency text default 'INR (₹)',
  add column if not exists capital_shield_active boolean default true,
  add column if not exists capital_shield_warning_pct numeric default 2.0,
  add column if not exists trading_lock_status text default 'unlocked';

-- RLS policies
create policy if not exists "Users can update their trading settings"
  on public.user_settings for all
  using (auth.uid() = user_id);
