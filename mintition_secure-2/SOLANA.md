# Solana

Pick **Solana** in the network picker. Everything below then uses Solana wallets.

* **Wallets:** Generate creates Solana wallets (ed25519). They are stored encrypted like EVM ones. Keys export in the
  base58 format Phantom and Solflare import. A batch is either all Solana or all EVM: when you switch network, the
  matching batch is selected automatically. Import an existing wallet from Wallets > Import.
* **Trade:** token lookup (price, volume, market cap, pools) for any mint; buy with SOL, sell back to SOL (Jupiter);
  transfer SOL or any SPL token (the destination's token account is created if missing, costing about 0.002 SOL).
* **Scheduling and background running** work exactly as on EVM chains.
* **Not available:** NFT minting (it uses an EVM contract) and browser Auto-Funding. Fund Solana wallets with
  Trade > Transfer > Distribute from an imported funded wallet.

## How a Solana action is kept safe
1. The swap or transfer is built, then **signed only if the wallet is the fee payer and the only signer**.
2. It is **simulated**. If the simulation fails, or would take more SOL out of the wallet than the amount you chose plus
   a 0.01 SOL allowance for fees and rent, nothing is sent ("Safety stop").
3. The signature is saved **before** sending. If anything fails afterwards, the same signed transaction can only land once.
   A new attempt is made only after its blockhash has expired, so a retry cannot double up.

## Set up
* Run `scripts/005_solana.sql`.
* The free public Solana RPC rate limits quickly: set `RPC_URL_101` to a private RPC for batches of more than a few wallets.
* Swaps use Jupiter's free lite endpoint by default. If Quote preview fails, set `JUPITER_API_URL` and `JUPITER_API_KEY`
  (portal.jup.ag).

## Untested
The code was checked against simulated RPC and Jupiter responses (signing against the RFC 8032 test vector), but never
against live Solana. Start with 1 or 2 wallets and tiny amounts. Press Preview a quote first.
