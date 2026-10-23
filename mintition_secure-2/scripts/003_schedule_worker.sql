-- =============================================================================
-- Mintition: background worker schedule (run once, AFTER deploying the app)
--
-- Scheduled and "mint now" jobs are processed by /api/cron/mint-worker on your
-- server. This makes Supabase call it every minute, so minting keeps going when
-- the browser is closed.
--
-- Before running:
--   1. Set CRON_SECRET in your hosting env vars (any random string, 32+ chars).
--   2. Replace the two placeholders below.
--   3. Enable the pg_cron and pg_net extensions (Database > Extensions).
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stored in Supabase Vault, not in plain SQL.
select vault.create_secret('REPLACE_WITH_YOUR_CRON_SECRET', 'mintition_cron_secret');
select vault.create_secret('https://REPLACE-WITH-YOUR-APP-DOMAIN/api/cron/mint-worker', 'mintition_worker_url');

select cron.schedule(
  'mintition-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'mintition_worker_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mintition_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 58000
  );
  $$
);

-- To stop the worker:  select cron.unschedule('mintition-worker');
