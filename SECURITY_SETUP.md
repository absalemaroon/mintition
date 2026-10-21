# Mintition: secure setup

Do these in order. Total time about 15 minutes.

## 1. Environment variables (Vercel > Settings > Environment Variables)
Copy `.env.example`. The important ones:

| Variable | What |
| --- | --- |
| `DATA_ENCRYPTION_KEY` | Encrypts every wallet, key and history record. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Back it up in a password manager. If it is lost, the encrypted data is unrecoverable.** |
| `CRON_SECRET` | 32+ random characters. Lets Supabase call the worker. |
| `ALLOWED_IPS` | Your IP(s) or ranges, comma separated. Always works, even if the database is unreachable. Set this BEFORE the first deploy of this version. |
| `SUPABASE_SERVICE_ROLE_KEY` | Already used by the app. Server only. |

Redeploy after changing variables.

## 2. Database
Supabase > SQL editor, run `scripts/002_secure_core.sql` (safe to re-run). It enforces the one-user rule,
locks all tables against the public anon key, and creates the wallet vault, jobs, transactions, settings,
IP allowlist and the private logo bucket.
If it complains about permission on `auth.users`, make sure the editor runs as the `postgres` role.
Then Authentication > Providers/Settings: turn **off** "Allow new users to sign up" (the database already refuses
extra users, this is a second lock).

## 2b. Trading tables
Also run `scripts/004_trading.sql` (adds buy, sell and transfer jobs). See `TRADING.md`.

## 3. Start the background worker
Enable the `pg_cron` and `pg_net` extensions (Database > Extensions), edit the two placeholders in
`scripts/003_schedule_worker.sql` (your `CRON_SECRET` and your app URL) and run it. From then on Supabase calls
`/api/cron/mint-worker` every minute, so scheduled and "mint now" jobs finish with every browser closed.

## 4. First run
* **Brand-new project:** open `/auth/setup`, create the owner account. Your IP is added to the allowlist and the
  page then disappears (404). No one else can ever be created.
* **Existing account:** just sign in. Open Settings > Security checklist and press **Encrypt old data now** to
  convert wallets that older versions stored in plain text. Open Wallets: if it offers to move wallets saved in
  this browser, accept (it erases the browser copy afterwards).

## 5. Check the networks
Settings > Network check > Check all. It tests every enabled network's RPC from your server. If one fails, set
`RPC_URL_<chainId>` (for example `RPC_URL_8453`) to a private RPC and redeploy.

## 6. Logos (optional)
See `TERMUX.md`. Cosmetic only.

## What is encrypted, and what is not
Encrypted (AES-256-GCM, key only on your server): private keys, wallet addresses, batch names, contract
addresses, job names, transaction hashes and errors, audit details. Each value is bound to its row, so copied or
tampered ciphertext is rejected.
Not encrypted, because the worker has to query it: statuses, counters, timestamps, chain ids, and the IP allowlist.
Wallet addresses are matched with a keyed hash, so duplicates are detected without storing them in the clear.

## Honest limits
* The worker must sign transactions while you are away, so the server can decrypt keys without you. Your
  protection is that the key is in your hosting environment only, never in the database. Anyone with BOTH your
  database and your Vercel environment can read the wallets. Treat your Vercel and Supabase accounts as the
  vault: use strong passwords and 2FA on both, and turn on MFA for your Supabase login.
* These wallets are for gas and minting. Do not keep large balances in them.
* IP allowlisting: mobile and home IPs change. If you lock yourself out, add the new IP from any device in the
  Supabase SQL editor: `insert into allowed_ips (cidr) values ('YOUR.IP/32');` (live within ~20 seconds), or add it
  to `ALLOWED_IPS` and redeploy.
* `x-forwarded-for` style headers are only trustworthy behind Vercel, which overwrites them. Do not move this behind
  another proxy without revisiting `lib/security/ip.ts`.
* Old data: anything stored by earlier versions was readable with the public anon key (the old policy allowed
  everyone). Assume those private keys were exposed and move any real funds to fresh wallets.

## Key rotation
Set `DATA_ENCRYPTION_KEY` to a new key with `DATA_ENCRYPTION_KEY_VERSION=2`, and keep the old one as
`DATA_ENCRYPTION_KEY_PREVIOUS` (+ `_VERSION=1`) so old rows still decrypt. A re-encryption job for old rows is not
included yet.
