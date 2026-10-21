import { ethers } from "ethers"
import { randomInt, randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { decrypt, decryptJson, encrypt, encryptJson } from "@/lib/security/crypto"
import { ApiError } from "@/lib/security/guard"
import { getChain, isLiveChain } from "@/lib/chains"
import { listWallets } from "@/lib/server/vault"

const db = () => createAdminClient() as any
const MAX_ITEMS_PER_JOB = 20_000

function must<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message || "Database error")
  return res.data
}

export const jobCtx = {
  name: (id: string) => `job.name|${id}`,
  contract: (id: string) => `job.contract|${id}`,
  params: (id: string) => `job.params|${id}`,
  tx: (itemId: string) => `job.item.tx|${itemId}`,
  err: (itemId: string) => `job.item.err|${itemId}`,
  meta: (itemId: string) => `job.item.meta|${itemId}`,
  txRow: (id: string) => `tx|${id}`,
}

export type JobKind = "mint" | "buy" | "sell" | "transfer"

/** Settings stored (encrypted) with a job. */
export type JobParams =
  | { kind: "mint" }
  | { kind: "buy"; amountWei: string; amountDisplay: string; slippage: number; maxImpact: number; symbol?: string }
  | { kind: "sell"; percent: number; slippage: number; maxImpact: number; symbol?: string }
  | { kind: "transfer"; asset: "native" | "token"; mode: "fixed" | "all"; amountWei?: string; amountDisplay?: string; symbol?: string }

export interface JobSummary {
  id: string
  kind: JobKind
  detail: string
  name: string
  chainId: number
  contract: string
  status: "scheduled" | "running" | "completed" | "cancelled" | "failed"
  runAt: string
  concurrency: number
  mintsPerWallet: number
  total: number
  success: number
  failed: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

function describe(kind: JobKind, p: JobParams | null, chainId: number): string {
  const native = getChain(String(chainId)).nativeSymbol
  if (!p || p.kind === "mint") return "Mint"
  if (p.kind === "buy") return `Buy ${p.amountDisplay} ${native}${p.symbol ? ` of ${p.symbol}` : ""} per wallet`
  if (p.kind === "sell") return `Sell ${p.percent}%${p.symbol ? ` of ${p.symbol}` : ""} per wallet`
  const asset = p.asset === "native" ? native : p.symbol || "token"
  return `Transfer ${p.mode === "all" ? `all ${asset}` : `${p.amountDisplay} ${asset}`} per wallet`
}

function toSummary(r: any): JobSummary {
  let name = "Unreadable job"
  let contract = ""
  let params: JobParams | null = null
  try {
    name = decrypt(r.name_enc, jobCtx.name(r.id))
    contract = decrypt(r.contract_enc, jobCtx.contract(r.id))
    if (r.params_enc) params = decryptJson<JobParams>(r.params_enc, jobCtx.params(r.id))
  } catch {
    /* leave placeholders */
  }
  const kind: JobKind = r.kind ?? "mint"
  return {
    id: r.id,
    kind,
    detail: describe(kind, params, r.chain_id),
    name,
    chainId: r.chain_id,
    contract,
    status: r.status,
    runAt: r.run_at,
    concurrency: r.concurrency,
    mintsPerWallet: r.mints_per_wallet,
    total: r.total_items,
    success: r.success_items,
    failed: r.failed_items,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }
}

interface Common {
  name: string
  chainId: number
  batchId: string
  runAt?: string | null // null / past = now
  concurrency: number
}

export type CreateJobInput = Common &
  (
    | { kind: "mint"; contractAddress: string; mintsPerWallet: number }
    | { kind: "buy"; token: string; amountWei: string; amountDisplay: string; slippage: number; maxImpact: number; symbol?: string }
    | { kind: "sell"; token: string; percent: number; slippage: number; maxImpact: number; symbol?: string }
    | {
        kind: "transfer"
        asset: "native" | "token"
        token?: string
        mode: "fixed" | "all"
        amountWei?: string
        amountDisplay?: string
        symbol?: string
        destination: { type: "address"; address: string } | { type: "batch"; batchId: string; pairing: "sequential" | "random" }
      }
  )

const checksum = (address: string, what: string) => {
  if (!ethers.isAddress(address)) throw new ApiError(400, `Enter a valid ${what} address`)
  return ethers.getAddress(address.toLowerCase())
}

const positiveWei = (value: string | undefined, what: string) => {
  try {
    const n = BigInt(value ?? "")
    if (n <= 0n) throw new Error("not positive")
    return n
  } catch {
    throw new ApiError(400, `Enter a valid ${what}`)
  }
}

/** Decides which destination each source wallet sends to. Pure, so it can be tested. */
export function planTransfers(
  sources: { id: string; address: string }[],
  destination: { type: "address"; address: string } | { type: "batch"; wallets: { address: string }[]; pairing: "sequential" | "random"; sameBatch: boolean },
  rand: (max: number) => number = randomInt,
): { sourceId: string; to: string }[] {
  if (destination.type === "address") return sources.map((s) => ({ sourceId: s.id, to: destination.address })).filter((p) => p.to.toLowerCase() !== sources.find((s) => s.id === p.sourceId)!.address.toLowerCase())

  const dest = destination.wallets
  if (dest.length === 0) throw new ApiError(400, "The destination batch has no wallets")
  if (destination.sameBatch && sources.length < 2) throw new ApiError(400, "A batch needs at least 2 wallets to send between its own wallets")

  let order = dest.map((_, i) => i)
  if (destination.pairing === "random") {
    for (let i = order.length - 1; i > 0; i--) {
      const j = rand(i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  return sources.map((s, i) => {
    // Within the same batch, shift by one so a wallet never sends to itself.
    let idx = destination.sameBatch && destination.pairing === "sequential" ? (i + 1) % dest.length : order[i % order.length]
    if (dest[idx].address.toLowerCase() === s.address.toLowerCase()) idx = (idx + 1) % dest.length
    return { sourceId: s.id, to: dest[idx].address }
  })
}

export async function createJob(input: CreateJobInput): Promise<JobSummary> {
  if (!isLiveChain(input.chainId)) throw new ApiError(400, "That network is not available yet")
  const nativeSymbol = getChain(String(input.chainId)).nativeSymbol

  const now = Date.now()
  let runAt = now
  if (input.runAt) {
    const parsed = Date.parse(input.runAt)
    if (Number.isNaN(parsed)) throw new ApiError(400, "Invalid start time")
    if (parsed > now + 365 * 24 * 3600 * 1000) throw new ApiError(400, "Start time must be within a year")
    runAt = Math.max(parsed, now)
  }

  const sources = await listWallets(input.batchId)
  if (sources.length === 0) throw new ApiError(400, "That batch has no wallets")

  let contract: string
  let params: JobParams | null = null
  let mintsPerWallet = 1
  let metas: (string | null)[] = sources.map(() => null) // encrypted-later destination per wallet

  if (input.kind === "mint") {
    contract = checksum(input.contractAddress, "contract")
    mintsPerWallet = input.mintsPerWallet
  } else if (input.kind === "buy") {
    contract = checksum(input.token, "token")
    positiveWei(input.amountWei, "amount")
    params = { kind: "buy", amountWei: input.amountWei, amountDisplay: input.amountDisplay.slice(0, 30), slippage: input.slippage, maxImpact: input.maxImpact, symbol: input.symbol?.slice(0, 20) }
  } else if (input.kind === "sell") {
    contract = checksum(input.token, "token")
    params = { kind: "sell", percent: input.percent, slippage: input.slippage, maxImpact: input.maxImpact, symbol: input.symbol?.slice(0, 20) }
  } else {
    if (input.asset === "token") contract = checksum(input.token || "", "token")
    else contract = "native"
    if (input.mode === "fixed") positiveWei(input.amountWei, "amount")
    params = {
      kind: "transfer",
      asset: input.asset,
      mode: input.mode,
      amountWei: input.mode === "fixed" ? input.amountWei : undefined,
      amountDisplay: input.amountDisplay?.slice(0, 30),
      symbol: input.symbol?.slice(0, 20),
    }
    let plan: { sourceId: string; to: string }[]
    if (input.destination.type === "address") {
      plan = planTransfers(sources, { type: "address", address: checksum(input.destination.address, "destination") })
    } else {
      const same = input.destination.batchId === input.batchId
      const destWallets = same ? sources : await listWallets(input.destination.batchId)
      plan = planTransfers(sources, { type: "batch", wallets: destWallets, pairing: input.destination.pairing, sameBatch: same })
    }
    const byId = new Map(plan.map((p) => [p.sourceId, p.to]))
    metas = sources.map((s) => byId.get(s.id) ?? null)
    if (plan.length === 0) throw new ApiError(400, "Nothing to send: every wallet already is the destination")
  }

  const items = sources
    .map((w, i) => ({ w, meta: metas[i] }))
    .filter((x) => input.kind !== "transfer" || x.meta !== null)
  const total = items.length * mintsPerWallet
  if (total > MAX_ITEMS_PER_JOB) throw new ApiError(400, `Too many items in one job (max ${MAX_ITEMS_PER_JOB})`)

  const id = randomUUID()
  const name =
    (input.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) ||
    `${input.kind[0].toUpperCase()}${input.kind.slice(1)} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`

  const jobRow = must(
    await db()
      .from("mint_jobs")
      .insert({
        id,
        kind: input.kind,
        name_enc: encrypt(name, jobCtx.name(id)),
        chain_id: input.chainId,
        contract_enc: encrypt(contract, jobCtx.contract(id)),
        params_enc: params ? encryptJson(params, jobCtx.params(id)) : null,
        batch_id: input.batchId,
        status: "scheduled",
        run_at: new Date(runAt).toISOString(),
        concurrency: input.concurrency,
        mints_per_wallet: mintsPerWallet,
        total_items: total,
      })
      .select()
      .single(),
  )

  try {
    const rows: any[] = []
    for (const { w, meta } of items) {
      for (let seq = 1; seq <= mintsPerWallet; seq++) {
        const itemId = randomUUID()
        rows.push({ id: itemId, job_id: id, wallet_id: w.id, seq, meta_enc: meta ? encryptJson({ to: meta }, jobCtx.meta(itemId)) : null })
      }
    }
    for (let i = 0; i < rows.length; i += 500) must(await db().from("mint_job_items").insert(rows.slice(i, i + 500)))
  } catch (error) {
    await db().from("mint_jobs").delete().eq("id", id)
    throw error
  }
  void nativeSymbol
  return toSummary(jobRow)
}

export async function listJobs(limit = 50): Promise<JobSummary[]> {
  const rows = must(await db().from("mint_jobs").select("*").order("created_at", { ascending: false }).limit(limit)) as any[]
  return rows.map(toSummary)
}

export async function cancelJob(id: string): Promise<JobSummary> {
  const rows = must(
    await db()
      .from("mint_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["scheduled", "running"])
      .select(),
  ) as any[]
  if (rows.length === 0) throw new ApiError(409, "This job is no longer running")
  must(await db().from("mint_job_items").update({ status: "cancelled" }).eq("job_id", id).eq("status", "pending"))
  await db().rpc("finalize_job", { p_job_id: id })
  const fresh = must(await db().from("mint_jobs").select("*").eq("id", id).single())
  return toSummary(fresh)
}

export interface TransactionView {
  id: string
  jobId: string | null
  chainId: number
  kind: JobKind
  status: "pending" | "success" | "failed"
  hash: string
  wallet: string
  tokenId?: string
  detail?: string
  error?: string
  timestamp: number
}

export async function listTransactions(limit = 200): Promise<TransactionView[]> {
  const rows = must(
    await db().from("transactions").select("id,job_id,chain_id,kind,status,payload_enc,created_at").order("created_at", { ascending: false }).limit(limit),
  ) as any[]
  return rows.map((r) => {
    let p: any = {}
    try {
      p = decryptJson(r.payload_enc, jobCtx.txRow(r.id))
    } catch {
      p = { error: "Unreadable record" }
    }
    return {
      id: r.id,
      jobId: r.job_id,
      chainId: r.chain_id,
      kind: r.kind ?? "mint",
      status: r.status,
      hash: p.hash || (r.status === "failed" ? "failed" : "pending"),
      wallet: p.wallet || "",
      tokenId: p.tokenId,
      detail: p.detail,
      error: p.error,
      timestamp: Date.parse(r.created_at),
    }
  })
}
