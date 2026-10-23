-- Mintition: Solana wallets (run once, after 002 and 004; safe to re-run)
alter table public.wallet_batches add column if not exists family text not null default 'evm';
alter table public.wallets        add column if not exists family text not null default 'evm';
alter table public.wallet_batches drop constraint if exists wallet_batches_family_check;
alter table public.wallet_batches add constraint wallet_batches_family_check check (family in ('evm', 'solana'));
alter table public.wallets drop constraint if exists wallets_family_check;
alter table public.wallets add constraint wallets_family_check check (family in ('evm', 'solana'));
