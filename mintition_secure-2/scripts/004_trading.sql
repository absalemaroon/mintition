-- =============================================================================
-- Mintition: trading + transfers (run once, after 002_secure_core.sql; safe to re-run)
--
-- Buy, sell and transfer jobs reuse the same queue as minting, so they get the same
-- parallelism, scheduling, retries and "keeps running when the app is closed".
-- =============================================================================

alter table public.mint_jobs
  add column if not exists kind text not null default 'mint',
  add column if not exists params_enc text;   -- encrypted settings (token, amounts, slippage, destination...)

alter table public.mint_jobs drop constraint if exists mint_jobs_kind_check;
alter table public.mint_jobs
  add constraint mint_jobs_kind_check check (kind in ('mint', 'buy', 'sell', 'transfer'));

-- Per-item details, for example each wallet's own destination in a transfer.
alter table public.mint_job_items
  add column if not exists meta_enc text;

alter table public.transactions
  add column if not exists kind text not null default 'mint';
