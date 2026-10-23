import { ethers } from "ethers"

/**
 * Swap routing through the OpenOcean aggregator API (free, no API key, one endpoint for many chains).
 * It finds the best route across the DEXes on a chain and returns ready-to-sign calldata. Nothing here
 * holds keys: the worker signs and sends the returned transaction itself.
 *
 * All provider-specific details live in this one file. If the API changes, this is the only file to touch.
 */

export class TradeError extends Error {
  name = "TradeError"
  constructor(
    public kind: "permanent" | "transient",
    message: string,
  ) {
    super(message)
  }
}

export interface SwapQuote {
  /** Router to send the transaction to (also the spender for token approvals). */
  to: string
  data: string
  value: bigint
  outAmount: bigint
  minOut: bigint
  /** Positive number, percent. Null if the provider did not report it. */
  priceImpactPct: number | null
}

export interface QuoteParams {
  chainId: number
  inToken: string
  outToken: string
  amountIn: bigint
  slippagePct: number
  account: string
  gasPriceWei?: bigint
}

const BASE = "https://open-api.openocean.finance/v4"

// The free tier is rate limited, so requests from this process are spaced out.
let chain: Promise<void> = Promise.resolve()
function throttle(): Promise<void> {
  const turn = chain.then(() => new Promise<void>((r) => setTimeout(r, 350)))
  chain = turn
  return turn
}

const big = (v: unknown, what: string): bigint => {
  try {
    if (v === undefined || v === null || v === "") throw new Error("empty")
    return BigInt(String(v))
  } catch {
    throw new TradeError("permanent", `The swap service returned an unexpected ${what}`)
  }
}

export function parsePriceImpact(v: unknown): number | null {
  if (v === undefined || v === null) return null
  const n = Math.abs(parseFloat(String(v).replace("%", "")))
  return Number.isFinite(n) ? n : null
}

/** Turns the provider JSON into a checked quote. Exported so it can be unit tested. */
export function parseQuote(json: any, p: QuoteParams, nativeIn: boolean): SwapQuote {
  if (!json || (json.code !== undefined && Number(json.code) !== 200)) {
    const msg = String(json?.message || json?.error || "no route")
    if (Number(json?.code) === 429) throw new TradeError("transient", "The swap service is busy, retrying")
    throw new TradeError("permanent", `No swap route found: ${msg}`.slice(0, 200))
  }
  const d = json.data
  if (!d || typeof d.data !== "string" || !ethers.isHexString(d.data) || !ethers.isAddress(d.to)) {
    throw new TradeError("permanent", "No swap route found for this token on this network")
  }
  const value = d.value === undefined || d.value === "" ? 0n : big(d.value, "value")
  // Safety: the quote must not ask for more than we meant to spend.
  if (nativeIn && value > p.amountIn) throw new TradeError("permanent", "The swap service asked for more than the amount you chose. Aborted.")
  if (!nativeIn && value !== 0n) throw new TradeError("permanent", "The swap service asked for an unexpected payment. Aborted.")

  const outAmount = big(d.outAmount, "output amount")
  const minOut = d.minOutAmount !== undefined && d.minOutAmount !== "" ? big(d.minOutAmount, "minimum output") : (outAmount * BigInt(Math.round((100 - p.slippagePct) * 100))) / 10000n
  if (outAmount <= 0n || minOut <= 0n) throw new TradeError("permanent", "The route returns nothing. Not tradable right now.")
  return { to: ethers.getAddress(d.to), data: d.data, value, outAmount, minOut, priceImpactPct: parsePriceImpact(d.price_impact ?? d.priceImpact) }
}

export async function getSwapQuote(p: QuoteParams, nativeAddress: string): Promise<SwapQuote> {
  if (p.slippagePct < 0.1 || p.slippagePct > 30) throw new TradeError("permanent", "Slippage must be between 0.1% and 30%")
  const nativeIn = p.inToken.toLowerCase() === nativeAddress.toLowerCase()
  const url = new URL(`${BASE}/${p.chainId}/swap`)
  url.searchParams.set("inTokenAddress", p.inToken)
  url.searchParams.set("outTokenAddress", p.outToken)
  url.searchParams.set("amountDecimals", p.amountIn.toString())
  url.searchParams.set("slippage", String(p.slippagePct))
  url.searchParams.set("account", p.account)
  if (p.gasPriceWei) url.searchParams.set("gasPriceDecimals", p.gasPriceWei.toString())

  await throttle()
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store" })
  } catch {
    throw new TradeError("transient", "The swap service did not answer in time")
  }
  if (res.status === 429 || res.status >= 500) throw new TradeError("transient", `The swap service is busy (${res.status})`)
  const json = await res.json().catch(() => null)
  if (!res.ok && !json) throw new TradeError("permanent", `The swap service refused the request (${res.status})`)
  return parseQuote(json, p, nativeIn)
}
