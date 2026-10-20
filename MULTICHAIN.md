# Making Mintition multi-chain

All the UI knows about a network lives in `lib/chains.ts`: name, native symbol, explorer, logo,
status. The network picker, balances, funding summary, transaction links and labels read from it.

Celo is the only `live` chain. The other 114 are `soon`: shown in the picker, not selectable.
Logos: run `node scripts/fetch-chain-logos.mjs` once (needs internet). Chains without a downloaded
logo show a coloured monogram.

## Enabling a chain (for example Base)
1. Verify its chain id, native symbol and explorer on https://chainlist.org. Entries with an empty
   `explorerUrl` have not been checked yet.
2. In `lib/chains.ts` set `status: "live"` and add `rpcUrl` (or set the `RPC_URL_<chainId>` env var).
3. Add the RPC host to `CSP_EXTRA_CONNECT` (browser auto-funding talks to it directly).
4. Funding in the browser: `lib/auto-funding.ts` and `lib/contract-config.ts` still point at
   `CELO_RPC_URL`. Make them use the selected chain's RPC.
5. Minting needs no change: the worker reads the chain from each job (`mint_jobs.chain_id`) and its
   RPC from the registry or `RPC_URL_<chainId>`. Your NFT contract must exist on that chain and expose
   the same `mint(address,string)` function as the ABI in `lib/contract-config.ts`.
