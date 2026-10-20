# Making Mintition multi-chain

The new UI is chain-aware. All it knows about a network lives in `lib/chains.ts`
(name, native token symbol, explorer URL, status). The selector in the top bar,
balances, funding summary, transaction links and labels all read from it.

Only Celo is "live" because the logic layer is still Celo-only. Other chains are
listed as "Soon" and cannot be selected yet.

## To add a chain (e.g. Base)
1. `lib/chains.ts`: set the entry's `status` to `"live"`.
2. Move the RPC URL and contract address into a per-chain config and read them by
   chain id. Right now they are hardcoded in these places:

| File | What is Celo-specific |
| --- | --- |
| `lib/contract-config.ts` | `CELO_RPC_URL`, `CONTRACT_CONFIG.chainId` / address |
| `lib/auto-funding.ts` | uses `CELO_RPC_URL` for the funding provider |
| `lib/use-web3-contract.ts` | uses `CELO_RPC_URL` for the minting provider |
| `lib/batch-funding.ts`, `app/api/batch-fund/route.ts` | `forno.celo.org`, "CELO" in messages |
| `lib/nft-utils.ts` | "Minted on Celo" / `Chain: Celo` metadata |
| `components/dashboard.tsx` (inside `handleMint`) | "Celo Credential #n" token metadata |
| `lib/storage.ts` | localStorage keys `celo_wallets_v2`, `celo_transactions` (keep wallets per chain) |

3. In `components/dashboard.tsx` the selected chain is the existing `networkId`
   state (`activeChain = getChain(networkId)`). Pass `activeChain` to whatever
   builds the provider so funding and minting follow the selector.
4. For MetaMask, call `wallet_switchEthereumChain` with `activeChain.chainId`
   when the selection changes.
