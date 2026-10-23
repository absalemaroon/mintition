import { TradeError } from "@/lib/server/swap"

/**
 * Solana swaps through Jupiter (the main Solana DEX aggregator). Two calls: a quote, then the swap transaction.
 * Configure with JUPITER_API_URL (default: the free lite endpoint) and JUPITER_API_KEY if you have one.
 * Everything Jupiter-specific is in this file.
 */

const BASE = () => (process.env.JUPITER_API_URL || "https://lite-api.jup.ag/swap/v1").replace(/\/$/, "")

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" }
  if (process.env.JUPITER_API_KEY) h["x-api-key"] = process.env.JUPITER_API_KEY
  return h
}

export interface JupQuote {
  raw: any
  outAmount: bigint
  minOut: bigint
  /** Percent (Jupiter reports a fraction). */
  priceImpactPct: number | null
}

const bigint = (v: unknown, what: string): bigint => {
  try {
    return BigInt(String(v))
  } catch {
    throw new TradeError("permanent", `Jupiter returned an unexpected ${what}`)
  }
}

export function parseJupQuote(json: any): JupQuote {
  if (!json || json.error || typeof json.outAmount === "undefined") {
    throw new TradeError("permanent", `No swap route found${json?.error ? `: ${String(json.error).slice(0, 140)}` : ""}`)
  }
  const out = bigint(json.outAmount, "output amount")
  const min = json.otherAmountThreshold !== undefined ? bigint(json.otherAmountThreshold, "minimum output") : out
  if (out <= 0n) throw new TradeError("permanent", "The route returns nothing. Not tradable right now.")
  const impact = Number(json.priceImpactPct)
  return { raw: json, outAmount: out, minOut: min, priceImpactPct: Number.isFinite(impact) ? Math.abs(impact) * 100 : null }
}

async function call(url: string, init?: RequestInit): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: headers(), signal: AbortSignal.timeout(20000), cache: "no-store" })
  } catch {
    throw new TradeError("transient", "Jupiter did not answer in time")
  }
  if (res.status === 429 || res.status >= 500) throw new TradeError("transient", `Jupiter is busy (${res.status})`)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new TradeError("permanent", `Jupiter refused the request (${res.status})${json?.error ? `: ${String(json.error).slice(0, 120)}` : ""}`)
  return json
}

export async function jupiterQuote(p: { inputMint: string; outputMint: string; amount: bigint; slippagePct: number }): Promise<JupQuote> {
  if (p.slippagePct < 0.1 || p.slippagePct > 30) throw new TradeError("permanent", "Slippage must be between 0.1% and 30%")
  const url = new URL(`${BASE()}/quote`)
  url.searchParams.set("inputMint", p.inputMint)
  url.searchParams.set("outputMint", p.outputMint)
  url.searchParams.set("amount", p.amount.toString())
  url.searchParams.set("slippageBps", String(Math.round(p.slippagePct * 100)))
  url.searchParams.set("restrictIntermediateTokens", "true")
  return parseJupQuote(await call(url.toString()))
}

/** Builds the unsigned swap transaction for a quote. The caller signs it and checks it first. */
export async function jupiterSwapTransaction(quote: JupQuote, user: string): Promise<{ txBytes: Uint8Array; lastValidBlockHeight: number }> {
  const maxLamports = Number(process.env.SOLANA_PRIORITY_MAX_LAMPORTS || 1_000_000)
  const json = await call(`${BASE()}/swap`, {
    method: "POST",
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: user,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports, priorityLevel: "high" } },
    }),
  })
  if (!json || typeof json.swapTransaction !== "string") throw new TradeError("permanent", "Jupiter did not return a transaction")
  const txBytes = new Uint8Array(Buffer.from(json.swapTransaction, "base64"))
  if (txBytes.length < 100 || txBytes.length > 1300) throw new TradeError("permanent", "Jupiter returned a transaction of unexpected size")
  return { txBytes, lastValidBlockHeight: Number(json.lastValidBlockHeight) || 0 }
}
