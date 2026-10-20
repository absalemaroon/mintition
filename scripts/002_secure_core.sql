-- =============================================================================
-- Mintition: secure core (run once in the Supabase SQL editor, safe to re-run)
--
-- What this does
--   1. One user per Supabase project, enforced inside the database.
--   2. Locks every table so the public anon key can read or write NOTHING.
--      (The old "Allow all operations on wallet_batches" policy let anyone holding
--      the anon key read private keys. It is dropped here.)
--   3. Encrypted wallet vault, transaction history, mint jobs and their queue.
--   4. Settings (project name, logo), IP allowlist, audit log, branding bucket.
--
-- Everything sensitive is encrypted by the app BEFORE it reaches the database
-- (columns ending in _enc). The key lives only in your server environment.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Single-user rule
-- -----------------------------------------------------------------------------
create table if not exists public.app_owner (
  singleton  boolean primary key default true check (singleton),
  user_id    uuid not null,
  created_at timestamptz not null default now()
);

-- Existing project: adopt the earliest existing user as the owner.
insert into public.app_owner (user_id)
select id from auth.users order by created_at asc limit 1
on conflict do nothing;

create or replace function public.enforce_single_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Serialise concurrent sign-ups so two can never slip through together.
  perform pg_advisory_xact_lock(727274);
  if exists (select 1 from auth.users) then
    raise exception 'Mintition is single-user: an account already exists on this Supabase project.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.register_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.app_owner (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create or replace function public.release_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from public.app_owner where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists enforce_single_user on auth.users;
create trigger enforce_single_user
  before insert on auth.users
  for each row execute function public.enforce_single_user();

drop trigger if exists register_owner on auth.users;
create trigger register_owner
  after insert on auth.users
  for each row execute function public.register_owner();

drop trigger if exists release_owner on auth.users;
create trigger release_owner
  after delete on auth.users
  for each row execute function public.release_owner();

-- -----------------------------------------------------------------------------
-- 2. Shared helper
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Settings, IP allowlist, audit log
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  singleton    boolean primary key default true check (singleton),
  project_name text not null default 'Mintition' check (char_length(project_name) between 1 and 40),
  logo_path    text,
  logo_version bigint not null default 0,
  updated_at   timestamptz not null default now()
);
insert into public.app_settings (singleton) values (true) on conflict do nothing;
drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

create table if not exists public.allowed_ips (
  id         uuid primary key default gen_random_uuid(),
  cidr       text not null unique check (char_length(cidr) <= 64),
  label      text not null default '' check (char_length(label) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  event      text not null,
  ip         text,
  detail_enc text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- -----------------------------------------------------------------------------
-- 4. Wallet vault
-- -----------------------------------------------------------------------------
-- wallet_batches already exists from scripts/create_wallet_batches.sql.
create table if not exists public.wallet_batches (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text default '',
  wallet_count integer not null default 0,
  wallet_data  jsonb not null default '[]'::jsonb,
  total_mints  integer default 0,
  total_funded text default '0',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.wallet_batches alter column wallet_data set default '[]'::jsonb;
alter table public.wallet_batches alter column wallet_count set default 0;
-- Encrypted name + description. The plain `name` column is only a placeholder now.
alter table public.wallet_batches add column if not exists meta_enc text;

create table if not exists public.wallets (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid references public.wallet_batches (id) on delete restrict,
  address_enc     text not null,
  address_hash    text not null unique,      -- HMAC blind index, for de-duplication
  pk_enc          text not null,             -- AES-256-GCM encrypted private key
  key_version     smallint not null default 1,
  funding_status  text not null default 'not_funded'
                    check (funding_status in ('not_funded', 'funding', 'funded', 'funding_failed')),
  status          text not null default 'idle'
                    check (status in ('idle', 'scheduled', 'minting', 'minted', 'failed')),
  mints_completed integer not null default 0,
  meta_enc        text,                      -- encrypted {balance, ...}
  created_at      timestamptz not null default now()
);
create index if not exists wallets_batch_idx on public.wallets (batch_id);

-- -----------------------------------------------------------------------------
-- 5. Mint jobs (run by the server worker, not by the browser)
-- -----------------------------------------------------------------------------
create table if not exists public.mint_jobs (
  id               uuid primary key default gen_random_uuid(),
  name_enc         text not null,
  chain_id         integer not null,
  contract_enc     text not null,
  batch_id         uuid references public.wallet_batches (id) on delete restrict,
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'running', 'completed', 'cancelled', 'failed')),
  run_at           timestamptz not null default now(),
  concurrency      integer not null default 10 check (concurrency between 1 and 50),
  mints_per_wallet integer not null default 1 check (mints_per_wallet between 1 and 20),
  total_items      integer not null default 0,
  success_items    integer not null default 0,
  failed_items     integer not null default 0,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  updated_at       timestamptz not null default now()
);
create index if not exists mint_jobs_due_idx on public.mint_jobs (status, run_at);
drop trigger if exists mint_jobs_touch on public.mint_jobs;
create trigger mint_jobs_touch before update on public.mint_jobs
  for each row execute function public.touch_updated_at();

create table if not exists public.mint_job_items (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.mint_jobs (id) on delete cascade,
  wallet_id       uuid not null references public.wallets (id) on delete restrict,
  seq             integer not null default 1,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'sent', 'success', 'failed', 'cancelled')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  nonce           bigint,                    -- fixed on first attempt: a retry can never double-mint
  tx_enc          text,                      -- encrypted transaction hash
  sent_at         timestamptz,
  error_enc       text,
  updated_at      timestamptz not null default now(),
  unique (job_id, wallet_id, seq)
);
create index if not exists mint_job_items_queue_idx on public.mint_job_items (job_id, status, next_attempt_at);
create index if not exists mint_job_items_sent_idx on public.mint_job_items (status) where status = 'sent';
drop trigger if exists mint_job_items_touch on public.mint_job_items;
create trigger mint_job_items_touch before update on public.mint_job_items
  for each row execute function public.touch_updated_at();

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid unique references public.mint_job_items (id) on delete cascade,
  job_id      uuid references public.mint_jobs (id) on delete cascade,
  wallet_id   uuid references public.wallets (id) on delete restrict,
  chain_id    integer not null,
  status      text not null check (status in ('pending', 'success', 'failed')),
  payload_enc text not null,                 -- encrypted {hash, wallet, contract, tokenId, error, ...}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists transactions_created_idx on public.transactions (created_at desc);
drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Queue functions (called only by the server with the service role key)
-- -----------------------------------------------------------------------------
create or replace function public.claim_due_jobs(p_limit int default 5)
returns setof public.mint_jobs
language sql
security definer
set search_path = public
as $$
  update public.mint_jobs j
     set status = 'running',
         started_at = coalesce(j.started_at, now())
   where j.id in (
     select id from public.mint_jobs
      where status = 'scheduled' and run_at <= now()
      order by run_at
      limit p_limit
      for update skip locked
   )
  returning j.*;
$$;

-- Hands out at most one item per wallet at a time (a wallet's nonces must stay in order),
-- and never hands the same item to two workers.
create or replace function public.claim_mint_items(p_job_id uuid, p_limit int, p_lock_seconds int default 120)
returns setof public.mint_job_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select distinct on (i.wallet_id) i.id
      from public.mint_job_items i
     where i.job_id = p_job_id
       and i.status = 'pending'
       and i.next_attempt_at <= now()
       and exists (select 1 from public.mint_jobs j where j.id = i.job_id and j.status = 'running')
       and not exists (
         select 1 from public.mint_job_items x
          where x.wallet_id = i.wallet_id   -- across ALL jobs: one live transaction per wallet at a time
            and x.status in ('processing', 'sent')
       )
     order by i.wallet_id, i.seq
     limit greatest(p_limit, 1)
  ), locked as (
    select i.id
      from public.mint_job_items i
      join candidates c on c.id = i.id
       for update of i skip locked
  )
  update public.mint_job_items u
     set status = 'processing',
         attempts = u.attempts + 1,
         locked_until = now() + make_interval(secs => p_lock_seconds)
    from locked l
   where u.id = l.id
  returning u.*;
end;
$$;

-- Recounts a job and closes it when nothing is left to do. Returns the job status.
create or replace function public.finalize_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.mint_jobs j
     set success_items = s.ok,
         failed_items  = s.bad,
         status = case when s.open_items = 0 and j.status = 'running' then 'completed' else j.status end,
         finished_at = case when s.open_items = 0 and j.status = 'running' then now() else j.finished_at end
    from (
      select count(*) filter (where status = 'success') as ok,
             count(*) filter (where status = 'failed') as bad,
             count(*) filter (where status in ('pending', 'processing', 'sent')) as open_items
        from public.mint_job_items
       where job_id = p_job_id
    ) s
   where j.id = p_job_id
  returning j.status into v_status;
  return v_status;
end;
$$;

create or replace function public.increment_wallet_mints(p_wallet_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.wallets
     set mints_completed = mints_completed + 1, status = 'minted'
   where id = p_wallet_id;
$$;

-- Self-audit used by the Security panel in Settings.
create or replace function public.security_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  cron_ok boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''mintition-worker'')' into cron_ok;
  end if;

  r := jsonb_build_object(
    'single_user_trigger', exists (
      select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'auth' and c.relname = 'users'
         and t.tgname = 'enforce_single_user' and not t.tgisinternal),
    'owner_exists', exists (select 1 from public.app_owner),
    'user_count', (select count(*) from auth.users),
    'rls_on_all_tables', (
      select coalesce(bool_and(c.relrowsecurity), false) from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relname in ('wallets', 'wallet_batches', 'transactions', 'mint_jobs', 'mint_job_items',
                           'allowed_ips', 'app_settings', 'app_owner', 'audit_log')),
    'anon_blocked', not (
      has_table_privilege('anon', 'public.wallets', 'select')
      or has_table_privilege('anon', 'public.wallet_batches', 'select')
      or has_table_privilege('anon', 'public.transactions', 'select')),
    'worker_scheduled', cron_ok,
    'legacy_plaintext_batches', (
      select count(*) from public.wallet_batches
       where jsonb_typeof(wallet_data) = 'array' and jsonb_array_length(wallet_data) > 0)
  );
  return r;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Lock everything down
-- -----------------------------------------------------------------------------
drop policy if exists "Allow all operations on wallet_batches" on public.wallet_batches;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_owner', 'app_settings', 'allowed_ips', 'audit_log', 'wallet_batches',
    'wallets', 'transactions', 'mint_jobs', 'mint_job_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on function
  public.claim_due_jobs(int),
  public.claim_mint_items(uuid, int, int),
  public.finalize_job(uuid),
  public.increment_wallet_mints(uuid),
  public.security_status()
from public, anon, authenticated;

grant execute on function
  public.claim_due_jobs(int),
  public.claim_mint_items(uuid, int, int),
  public.finalize_job(uuid),
  public.increment_wallet_mints(uuid),
  public.security_status()
to service_role;

-- -----------------------------------------------------------------------------
-- 8. Private storage bucket for the project logo (no public access)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
