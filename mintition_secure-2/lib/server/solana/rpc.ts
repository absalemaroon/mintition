import { TradeError } from "@/lib/server/swap"
import { getChain } from "@/lib/chains"

/** Minimal Solana JSON-RPC client (fetch only). Public RPC is rate limited: set RPC_URL_101 to a private one for heavy use. */

export const SOLANA_CHAIN_ID = 101

export function solanaRpcUrl(): string {
  return process.env.RPC_URL_101 || process.env.RPC_URL_SOLANA || getChain(String(SOLANA_CHAIN_ID)).rpcUrl || "https://api.mainnet-beta.solana.com"
}

function classify(message: string, code?: number): TradeError {
  const m = message.slice(0, 220)
  if (/blockhash not found|node is behind|too many requests|rate limit|timed out|unavailable|try again/i.test(message) || code === -32005 || code === -32004) return new TradeError("transient", m)
  if (/insufficient (funds|lamports)|0x1\b|custom program error: 0x1\b/i.test(message)) return new TradeError("permanent", "Not enough SOL (or tokens) in the wallet")
  return new TradeError("permanent", m)
}

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  let res: Response
  try {
    res = await fetch(solanaRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    })
  } catch {
    throw new TradeError("transient", "The Solana RPC did not answer in time")
  }
  if (res.status === 429 || res.status >= 500) throw new TradeError("transient", `The Solana RPC is busy (${res.status})`)
  const json = (await res.json().catch(() => null)) as { result?: T; error?: { code?: number; message?: string } } | null
  if (!json) throw new TradeError("transient", "The Solana RPC returned an unreadable answer")
  if (json.error) throw classify(json.error.message || "RPC error", json.error.code)
  return json.result as T
}

export async function getBalance(address: string): Promise<bigint> {
  return BigInt((await rpc<{ value: number }>("getBalance", [address, { commitment: "confirmed" }])).value)
}

export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  return (await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }])).value
}

export const getBlockHeight = () => rpc<number>("getBlockHeight", [{ commitment: "confirmed" }])

export interface MintInfo {
  exists: boolean
  program: string
  decimals: number
  supply: bigint
}

export async function getMintInfo(mint: string): Promise<MintInfo> {
  const r = await rpc<{ value: { owner: string; data: { parsed?: { type?: string; info?: { decimals?: number; supply?: string } } } } | null }>("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }])
  const parsed = r.value?.data?.parsed
  if (!r.value || parsed?.type !== "mint") return { exists: false, program: "", decimals: 0, supply: 0n }
  return { exists: true, program: r.value.owner, decimals: Number(parsed.info?.decimals ?? 0), supply: BigInt(parsed.info?.supply ?? "0") }
}

/** Total balance of one token across all of the owner's token accounts. */
export async function getTokenBalance(owner: string, mint: string): Promise<bigint> {
  const r = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }])
  return r.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n)
}

/** Balance of one specific token account, or null if it does not exist. */
export async function getTokenAccountAmount(tokenAccount: string): Promise<bigint | null> {
  try {
    return BigInt((await rpc<{ value: { amount: string } }>("getTokenAccountBalance", [tokenAccount, { commitment: "confirmed" }])).value.amount)
  } catch (e) {
    if (e instanceof TradeError && /could not find account|invalid param/i.test(e.message)) return null
    throw e
  }
}

export interface Simulation {
  err: unknown
  /** SOL balance of the account after the simulated transaction, if it could be read. */
  lamportsAfter: bigint | null
}

export async function simulate(txBase64: string, watch: string): Promise<Simulation> {
  const r = await rpc<{ value: { err: unknown; accounts?: ({ lamports: number } | null)[] } }>("simulateTransaction", [
    txBase64,
    { encoding: "base64", sigVerify: false, commitment: "confirmed", accounts: { encoding: "base64", addresses: [watch] } },
  ])
  const acct = r.value.accounts?.[0]
  return { err: r.value.err, lamportsAfter: acct ? BigInt(acct.lamports) : null }
}

export async function sendRaw(txBase64: string): Promise<string> {
  return rpc<string>("sendTransaction", [txBase64, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 }])
}

export interface SigStatus {
  confirmationStatus?: "processed" | "confirmed" | "finalized"
  err: unknown
}

export async function getSignatureStatus(signature: string): Promise<SigStatus | null> {
  const r = await rpc<{ value: (SigStatus | null)[] }>("getSignatureStatuses", [[signature], { searchTransactionHistory: false }])
  return r.value[0] ?? null
}
