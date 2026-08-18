-- Bee Healthy — cloud sync schema.
-- Run this in your Supabase project (SQL editor) to enable multi-device sync.
--
-- A single generic table holds every synced record as JSONB. Each row is scoped
-- to a user; Row-Level Security guarantees a user can only read/write their own
-- rows. The primary key is (user_id, id) so the shared settings id ('app') never
-- collides across users. The app never stores the LLM API key here — it is
-- stripped client-side before upload.

create table if not exists public.records (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,
  type       text        not null,
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  data       jsonb       not null default '{}'::jsonb,
  primary key (user_id, id)
);

create index if not exists records_user_updated_idx
  on public.records (user_id, updated_at);

alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);
