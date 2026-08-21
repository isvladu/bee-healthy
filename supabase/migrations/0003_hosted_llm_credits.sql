-- Bee Healthy — hosted LLM + credit ledger (Workstream 3, §6.1).
--
-- Free users without their own Anthropic key call the model through our
-- backend on the OWNER's key. That key never leaves the server, and the only
-- thing standing between a signed-in user and the owner's bill is this ledger.
--
-- Unit: one credit = one US cent of Anthropic *list-price* cost, rounded up,
-- minimum one per request. Denominating in money rather than requests means a
-- 60k-token diet plan and a one-line ping cost what they actually cost, and the
-- per-user cap and the owner's monthly spend ceiling are expressed in the same
-- currency.
--
-- Same rules as every other table here: RLS enabled with NO policies, so only
-- the service role (which bypasses it) can read or write, and the real guard is
-- `creditScope(userId)` in api/_lib/credits.ts.

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------

-- One row per user. `granted_period` is the 'YYYY-MM' of the last free monthly
-- grant, so the top-up is idempotent without a scheduled job: the first request
-- of a new month notices the stale period and tops the balance up.
create table if not exists public.app_credits (
  user_id        uuid        primary key references public.app_users (id) on delete cascade,
  balance        integer     not null default 0 check (balance >= 0),
  granted_period text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------

-- Append-only history behind the balance. `delta` is positive for a grant and
-- negative for spend; `balance_after` lets a mismatch between the two be spotted
-- without replaying the whole table.
--
-- NOTE: no prompt text, no completion text — only counts. This table must stay
-- as boring as the telemetry payloads (see CLAUDE.md), because it is the one
-- place a user's AI activity is recorded server-side.
create table if not exists public.app_credit_events (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null references public.app_users (id) on delete cascade,
  delta         integer     not null,
  reason        text        not null check (reason in ('monthly_grant', 'ai_usage', 'adjustment')),
  balance_after integer     not null,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists app_credit_events_user_time_idx
  on public.app_credit_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The owner's spend ceiling
-- ---------------------------------------------------------------------------

-- Per-user credits bound one user; this bounds *everyone*. One row per calendar
-- month holding list-price cost in micro-dollars (integer, so no float drift).
-- When the month's total passes AI_MONTHLY_BUDGET_USD the proxy stops answering
-- for hosted users — bring-your-own-key users are unaffected, since they are
-- spending their own money.
create table if not exists public.app_ai_spend (
  period     text        primary key,
  micros     bigint      not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Atomic ledger operations
-- ---------------------------------------------------------------------------

-- The cost of a call is only known *after* it completes, but the check has to
-- happen before. So every request reserves its worst case (max_tokens priced at
-- the model's output rate), then settles: the difference is refunded once the
-- real usage is in. A user can therefore never overdraw, and two concurrent
-- requests cannot both spend the same last credit — the `balance >= p_amount`
-- predicate lives inside the UPDATE, so the row lock decides the race.

create or replace function public.ai_ensure_monthly_grant(
  p_user   uuid,
  p_period text,
  p_grant  integer
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_period text;
  v_after  integer;
begin
  -- Start every account at zero with no period, so the top-up below is the one
  -- place a grant is ever applied (and the one place an event is written).
  insert into public.app_credits (user_id, balance, granted_period)
  values (p_user, 0, '')
  on conflict (user_id) do nothing;

  -- The lock is what stops two concurrent first-requests of the month from both
  -- deciding they owe a grant and writing two events for it.
  select balance, granted_period into v_before, v_period
    from public.app_credits
   where user_id = p_user
     for update;

  if v_period = p_period then
    return v_before;
  end if;

  -- `greatest` rather than `+`: the free tier is a floor, not an allowance that
  -- accrues forever for an inactive account. Purchased credits (a later phase)
  -- sit above the floor and are never reduced by a top-up.
  update public.app_credits
     set balance        = greatest(balance, p_grant),
         granted_period = p_period,
         updated_at     = now()
   where user_id = p_user
  returning balance into v_after;

  if v_after > v_before then
    insert into public.app_credit_events (user_id, delta, reason, balance_after)
    values (p_user, v_after - v_before, 'monthly_grant', v_after);
  end if;

  return v_after;
end;
$$;

-- Returns the balance after the hold, or NULL when the user cannot afford it.
create or replace function public.ai_reserve_credits(
  p_user   uuid,
  p_amount integer
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  update public.app_credits
     set balance    = balance - p_amount,
         updated_at = now()
   where user_id = p_user
     and balance >= p_amount
  returning balance into v_balance;

  return v_balance; -- NULL when the predicate failed: insufficient credits
end;
$$;

-- Refund the unused part of a hold and record what was actually spent.
-- `p_actual` is clamped to the hold so a pricing bug can never turn a settle
-- into a second, larger charge.
create or replace function public.ai_settle_credits(
  p_user          uuid,
  p_hold          integer,
  p_actual        integer,
  p_model         text,
  p_input_tokens  integer,
  p_output_tokens integer
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actual  integer := least(greatest(p_actual, 0), p_hold);
  v_balance integer;
begin
  update public.app_credits
     set balance    = balance + (p_hold - v_actual),
         updated_at = now()
   where user_id = p_user
  returning balance into v_balance;

  if v_actual > 0 then
    insert into public.app_credit_events (
      user_id, delta, reason, balance_after, model, input_tokens, output_tokens
    ) values (
      p_user, -v_actual, 'ai_usage', v_balance, p_model, p_input_tokens, p_output_tokens
    );
  end if;

  return v_balance;
end;
$$;

-- Add to this month's list-price spend and hand back the running total, so the
-- caller can trip the ceiling without a second round trip.
create or replace function public.ai_record_spend(
  p_period text,
  p_micros bigint
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
begin
  insert into public.app_ai_spend (period, micros)
  values (p_period, p_micros)
  on conflict (period) do update
     set micros     = public.app_ai_spend.micros + excluded.micros,
         updated_at = now()
  returning micros into v_total;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock everything down
-- ---------------------------------------------------------------------------

alter table public.app_credits       enable row level security;
alter table public.app_credit_events enable row level security;
alter table public.app_ai_spend      enable row level security;
