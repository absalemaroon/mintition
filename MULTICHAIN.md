# Networks

109 of 115 networks are enabled ("live"). Each has a public RPC endpoint in `lib/chains.ts` (PUBLIC_RPC). Six have none yet
and stay "soon": Evmos, Zircuit, Katana, KardiaChain, Velas, Shiden.

* The RPC list was written from each network's public documentation, not tested from here. Use **Settings > Network check**
  after deploying. The worker also asks every node for its chain id and refuses a mismatch.
* To override or add an RPC without editing code: set `RPC_URL_<chainId>` in your environment variables and redeploy.
  To make a "soon" chain live, add its entry to PUBLIC_RPC in `lib/chains.ts`.
* Add the RPC host to `CSP_EXTRA_CONNECT` only if the browser must call it. Server-side minting, trading and transfers do not need it.
  (Browser-side auto-funding in `lib/auto-funding.ts` still uses the Celo RPC: see "Not done yet".)
* Logos: `node scripts/fetch-chain-logos.mjs`.

## Not done yet
* Solana and other non-EVM chains.
* Auto-funding (browser) on chains other than Celo.
