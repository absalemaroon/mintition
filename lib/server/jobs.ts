import { ethers } from "ethers"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { decrypt, decryptJson, encrypt } from "@/lib/security/crypto"
import { ApiError } from "@/lib/security/guard"
import { isLiveChain } from "@/lib/chains"

const db = () => createAdminClient() as any
const MAX_ITEMS_PER_JOB = 20_000

function must<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message || "Database error")
  return res.data
}

export const jobCtx = {
  name: (id: string) => `job.name|${id}`,
  contract: (id: string) => `job.contract|${id}`,
  tx: (itemId: string) => `job.item.tx|${itemId}`,
  err: (itemId: string) => `job.item.err|${itemId}`,
  txRow: (id: string) => `tx|${id}`,
}

export interface JobSummary {
  id: string
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

function toSummary(r: any): JobSummary {
  let name = "Unreadable job"
  let contract = ""
  try {
    name = decrypt(r.name_enc, jobCtx.name(r.id))
    contract = decrypt(r.contract_enc, jobCtx.contract(r.id))
  } catch {
    /* leave placeholders */
  }
  return {
    id: r.id,
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

export interface CreateJobInput {
  name: string
  chainId: number
  contractAddress: string
  batchId: string
  runAt?: string | null // null / past = now
  concurrency: number
  mintsPerWallet: number
}

export async function createJob(input: CreateJobInput): Promise<JobSummary> {
  if (!isLiveChain(input.chainId)) throw new ApiError(400, "That network is not available yet")
  if (!ethers.isAddress(input.contractAddress)) throw new ApiError(400, "Enter a valid contract address")
  const contract = ethers.getAddress(input.contractAddress.toLowerCase())

  const now = Date.now()
  let runAt = now
  if (input.runAt) {
    const parsed = Date.parse(input.runAt)
    if (Number.isNaN(parsed)) throw new ApiError(400, "Invalid start time")
    if (parsed > now + 365 * 24 * 3600 * 1000) throw new ApiError(400, "Start time must be within a year")
    runAt = Math.max(parsed, now)
  }

  const wallets = must(await db().from("wallets").select("id").eq("batch_id", input.batchId).range(0, 4999)) as { id: string }[]
  if (wallets.length === 0) throw new ApiError(400, "That batch has no wallets")
  const total = wallets.length * input.mintsPerWallet
  if (total > MAX_ITEMS_PER_JOB) throw new ApiError(400, `Too many mints in one job (max ${MAX_ITEMS_PER_JOB})`)

  const id = randomUUID()
  const name = (input.name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || `Mint ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
  const jobRow = must(
    await db()
      .from("mint_jobs")
      .insert({
        id,
        name_enc: encrypt(name, jobCtx.name(id)),
        chain_id: input.chainId,
        contract_enc: encrypt(contract, jobCtx.contract(id)),
        batch_id: input.batchId,
        status: "scheduled",
        run_at: new Date(runAt).toISOString(),
        concurrency: input.concurrency,
        mints_per_wallet: input.mintsPerWallet,
        total_items: total,
      })
      .select()
      .single(),
  )

  try {
    const items: any[] = []
    for (const w of wallets) for (let seq = 1; seq <= input.mintsPerWallet; seq++) items.push({ job_id: id, wallet_id: w.id, seq })
    for (let i = 0; i < items.length; i += 500) must(await db().from("mint_job_items").insert(items.slice(i, i + 500)))
  } catch (error) {
    await db().from("mint_jobs").delete().eq("id", id)
    throw error
  }
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
  status: "pending" | "success" | "failed"
  hash: string
  wallet: string
  tokenId?: string
  error?: string
  timestamp: number
}

export async function listTransactions(limit = 200): Promise<TransactionView[]> {
  const rows = must(
    await db().from("transactions").select("id,job_id,chain_id,status,payload_enc,created_at").order("created_at", { ascending: false }).limit(limit),
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
      status: r.status,
      hash: p.hash || (r.status === "failed" ? "failed" : "pending"),
      wallet: p.wallet || "",
      tokenId: p.tokenId,
      error: p.error,
      timestamp: Date.parse(r.created_at),
    }
  })
}
