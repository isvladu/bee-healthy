-- Bee Healthy — self-managed auth (Workstream 2).
--
-- Moves identity and credentials out of Supabase Auth (`auth.users`) and into
-- our own tables. Supabase Postgres stays the database; our Vercel functions
-- become the ONLY thing that talks to it, using the service-role key.
--
-- Because the service role bypasses RLS, RLS is no longer what protects a row.
-- The real guard is backend query scoping (`api/_lib/data.ts`, which pins every
-- statement to the session user). RLS stays enabled on every table below with
-- NO policies, so any non-service-role path (the anon key, a leaked client
-- token) can read exactly nothing. That is the point: these tables hold
-- password hashes and session tokens, and no browser should ever reach them.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- `email citext` gives us case-insensitive uniqueness in the database itself,
-- so "A@b.com" and "a@b.com" can't become two accounts even if a caller skips
-- the server-side normalization.
create table if not exists public.app_users (
  id              uuid        primary key default gen_random_uuid(),
  email           citext      not null unique,
  password_hash   text        not null,
  email_verified  boolean     not null default false,
  -- Per-account lockout counters, maintained by api/auth/login.ts.
  failed_attempts integer     not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

-- We store only a SHA-256 hash of the session token, never the token itself —
-- a dump of this table cannot be replayed as a login. Revocation is a row
-- update (`revoked_at`) or a delete, which is why we chose opaque tokens over
-- stateless JWTs: logout is instant and total.
create table if not exists public.app_sessions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users (id) on delete cascade,
  token_hash text        not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);

create index if not exists app_sessions_user_idx
  on public.app_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

-- One row per failed/throttled attempt. `key` is a scope string built by the
-- server ('ip:1.2.3.4', 'email:a@b.com', 'reset:a@b.com') so a single table
-- serves per-IP and per-account limits without a Redis dependency (§5.7).
-- Rows are pruned opportunistically by the limiter.
create table if not exists public.app_login_attempts (
  id         bigint      generated always as identity primary key,
  key        text        not null,
  created_at timestamptz not null default now()
);

create index if not exists app_login_attempts_key_time_idx
  on public.app_login_attempts (key, created_at desc);

-- ---------------------------------------------------------------------------
-- Email verification + password reset tokens
-- ---------------------------------------------------------------------------

-- Same rule as sessions: only the hash is stored, so a leak of this table can't
-- be turned into an account takeover. Tokens are single-use (`used_at`) and
-- short-lived; issuing a new token of a type invalidates the prior unused ones.
create table if not exists public.app_email_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users (id) on delete cascade,
  type       text        not null check (type in ('verify', 'reset')),
  token_hash text        not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists app_email_tokens_user_type_idx
  on public.app_email_tokens (user_id, type);

-- ---------------------------------------------------------------------------
-- Re-key `records` from auth.users to app_users
-- ---------------------------------------------------------------------------

-- Clean cutover (§5.8): GoTrue password hashes can't be exported, so existing
-- users must re-register regardless. The old RLS policies are dropped because
-- `auth.uid()` is meaningless now — nothing but the service role touches this
-- table, and RLS stays on with no policies to keep it that way.
drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

alter table public.records
  drop constraint if exists records_user_id_fkey;

-- The FK below will FAIL if `records` still holds rows keyed to old auth.users
-- ids. That failure is the intended safety net, not a bug — it means data is
-- about to be orphaned. Resolve it first, then re-run this migration:
--
--   -- (a) re-key an existing account's data to its new app_users row:
--   update public.records set user_id = '<new-app_users-id>'
--    where user_id = '<old-auth-users-id>';
--
--   -- (b) or start fresh:
--   delete from public.records;
alter table public.records
  add constraint records_user_id_fkey
  foreign key (user_id) references public.app_users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Lock everything down
-- ---------------------------------------------------------------------------

-- RLS enabled + zero policies = only the service-role key (which bypasses RLS)
-- can read or write. Defense in depth behind the backend's own scoping.
alter table public.app_users          enable row level security;
alter table public.app_sessions       enable row level security;
alter table public.app_login_attempts enable row level security;
alter table public.app_email_tokens   enable row level security;
alter table public.records            enable row level security;
