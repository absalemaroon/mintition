# Trading and transfers

Pages: **Trade** (buy, sell, transfer) and **Settings > Network check**.
Run `scripts/004_trading.sql` in the Supabase SQL editor once (after 002), then redeploy.

## How it works
1. Pick a network at the top, open Trade, paste a token address, press **Look up**. You get price, 24h change,
   liquidity, 24h volume, market cap, FDV, buys/sells, pool age, decimals, supply and warnings.
2. Choose Buy, Sell or Transfer. Every wallet in the active batch (Batches page) takes part.
3. Press **Preview a quote** first. It asks for a route and shows what the trade would do. It sends nothing.
4. **Review**, then **Confirm and start**. Choose "Now" or a time. Jobs run on the server, in parallel, even if the app is closed.

| Action | What happens |
| --- | --- |
| Buy | Each wallet swaps a fixed amount of the network's native coin for the token. |
| Sell | Each wallet sells a % of its token balance for the native coin. Approvals are for the exact amount only. |
| Transfer | Native coin or the token: everything or a set amount, to one address, or to the wallets of another batch (in order or shuffled). Inside the same batch each wallet sends to the next one, never to itself. |

## Safety built in
* Every transaction is simulated first. If it would fail, nothing is sent and no gas is spent.
* Slippage limit (default 3%) and a "stop if price impact is above" limit (default 10%).
* A quote that asks for more than the amount you chose is refused.
* The worker confirms the RPC reports the right chain id before it does anything.
* A retry can never repeat a transaction (fixed nonce, hash saved on send).

## Limits (read these)
* Swaps go through the OpenOcean aggregator (free, no key). It covers many but not all networks. Where it has no route you
  see "No swap route found". Transfers work on every enabled network.
* Buy spends the native coin, sell returns native coin. Other quote currencies (USDC and so on) are not supported yet.
* Solana is not supported yet (different wallet type). EVM networks only.
* Token data comes from DexScreener. A chain whose slug is wrong or missing shows less or no market data.
* Coordinated trading from many wallets that creates false volume or moves a price is market manipulation and is illegal
  in many places. Use this on tokens and strategies where you are comfortable with that.
