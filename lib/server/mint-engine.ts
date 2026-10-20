import { ethers } from "ethers"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { decrypt, encrypt, encryptJson } from "@/lib/security/crypto"
import { MINET_ABI } from "@/lib/contract-config"
import { getChain } from "@/lib/chains"
import { getWalletSecrets } from "@/lib/server/vault"
import { jobCtx } from "@/lib/server/jobs"

/**
 * Server-side mint worker.
 *
 *  - Runs inside /api/cron/mint-worker, which Supabase pg_cron calls every minute, so minting
 *    continues when no browser is open. "Mint now" simply starts a job that is due immediately.
 *  - Parallel: `concurrency` lanes each claim one item at a time. Wallets are independent
 *    accounts, so they mint at the same time; a wallet's own mints stay in nonce order.
 *  - Safe to interrupt and to run twice at once: items are claimed with FOR UPDATE SKIP LOCKED,
 *    the nonce is fixed on the first attempt, and the tx hash is saved the moment it is sent.
 *    A retry can therefore never mint twice.
 */

const db = () => createAdminClient() as any
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const MAX_ATTEMPTS = 4
const SENT_TIMEOUT_MS = 30 * 60_000

function must<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message || "Database error")
  return res.data
}

interface Job {
  id: string
  chainId: number
  contract: string
  concurrency: number
}

const providers = new Map<number, ethers.JsonRpcProvider>()
function getProvider(chainId: number): ethers.JsonRpcProvider {
  const cached = providers.get(chainId)
  if (cached) return cached
  const chain = getChain(String(chainId))
  const url = process.env[`RPC_URL_${chainId}`] || (chain.chainId === chainId ? chain.rpcUrl : undefined)
  if (!url) throw new Error(`No RPC URL configured for chain ${chainId}`)
  const network = ethers.Network.from(chainId)
  const provider = new ethers.JsonRpcProvider(url, network, { staticNetwork: network, batchMaxCount: 1 })
  providers.set(chainId, provider)
  return provider
}

export type FailureKind = "transient" | "permanent"

export function classifyError(err: any): { kind: FailureKind; message: string } {
  const code = String(err?.code || "")
  const raw = String(err?.shortMessage || err?.message || err || "Unknown error")
  const message = raw.replace(/\s+/g, " ").slice(0, 280)
  if (code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(raw)) return { kind: "permanent", message: "Wallet has no gas. Fund it first." }
  if (code === "CALL_EXCEPTION" || /execution reverted/i.test(raw)) {
    const reason = err?.reason ? `: ${String(err.reason).slice(0, 120)}` : ""
    return { kind: "permanent", message: `The contract rejected the mint${reason}` }
  }
  if (code === "NONCE_EXPIRED" || /nonce too low|already known/i.test(raw)) {
    return { kind: "permanent", message: "Nonce already used. This mint may have gone through, check the wallet on the block explorer." }
  }
  return { kind: "transient", message }
}

function tokenUri(chainName: string, address: string, seq: number): string {
  const metadata = {
    name: `${chainName} Credential`,
    description: `Verifiable credential NFT on ${chainName}`,
    image: "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#111'/></svg>").toString("base64"),
    attributes: [
      { trait_type: "Wallet", value: address },
      { trait_type: "Mint", value: String(seq) },
    ],
  }
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`
}

async function saveTransaction(
  item: { id: string; job_id: string; wallet_id: string },
  chainId: number,
  status: "pending" | "success" | "failed",
  payload: Record<string, unknown>,
) {
  const existing = await db().from("transactions").select("id").eq("item_id", item.id).maybeSingle()
  const id: string = existing.data?.id ?? randomUUID()
  must(
    await db()
      .from("transactions")
      .upsert(
        { id, item_id: item.id, job_id: item.job_id, wallet_id: item.wallet_id, chain_id: chainId, status, payload_enc: encryptJson(payload, jobCtx.txRow(id)) },
        { onConflict: "id" },
      ),
  )
}

async function setItem(id: string, patch: Record<string, unknown>) {
  must(await db().from("mint_job_items").update(patch).eq("id", id))
}

function parseTokenId(receipt: ethers.TransactionReceipt): string {
  const iface = new ethers.Interface(MINET_ABI)
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log)
      if (parsed && parsed.name === "CredentialMinted") return parsed.args[1].toString()
    } catch {
      /* not our event */
    }
  }
  return "unknown"
}

async function finishSuccess(job: Job, item: any, address: string, hash: string, receipt: ethers.TransactionReceipt) {
  await setItem(item.id, { status: "success", locked_until: null, error_enc: null })
  await saveTransaction(item, job.chainId, "success", {
    hash,
    wallet: address,
    contract: job.contract,
    tokenId: parseTokenId(receipt),
    blockNumber: receipt.blockNumber,
  })
  await db().rpc("increment_wallet_mints", { p_wallet_id: item.wallet_id })
  await db().rpc("finalize_job", { p_job_id: item.job_id })
}

async function finishFailure(job: Job, item: any, address: string, message: string, hash?: string) {
  await setItem(item.id, { status: "failed", locked_until: null, error_enc: encrypt(message, jobCtx.err(item.id)) })
  await saveTransaction(item, job.chainId, "failed", { hash: hash ?? null, wallet: address, contract: job.contract, error: message })
  await db().rpc("finalize_job", { p_job_id: item.job_id })
}

async function processItem(job: Job, item: any, secrets: Map<string, { address: string; privateKey: string }>, deadline: number) {
  const wallet = secrets.get(item.wallet_id)
  if (!wallet) {
    await finishFailure(job, item, "", "Wallet not found in the vault")
    return
  }
  const chain = getChain(String(job.chainId))
  const provider = getProvider(job.chainId)
  const signer = new ethers.Wallet(wallet.privateKey, provider)
  const contract = new ethers.Contract(job.contract, MINET_ABI, signer)

  let tx: ethers.TransactionResponse
  try {
    // Fix the nonce on the first attempt and keep it for every retry, so a retry cannot mint twice.
    let nonce: number | null = item.nonce
    if (nonce === null || nonce === undefined) {
      nonce = await provider.getTransactionCount(wallet.address, "pending")
      await setItem(item.id, { nonce })
    }
    const uri = tokenUri(chain.name, wallet.address, item.seq)
    const estimate: bigint = await contract.getFunction("mint").estimateGas(wallet.address, uri) // reverts here cost no gas
    tx = await contract.getFunction("mint")(wallet.address, uri, { nonce, gasLimit: (estimate * 125n) / 100n })
  } catch (error) {
    const { kind, message } = classifyError(error)
    if (kind === "transient" && item.attempts < MAX_ATTEMPTS) {
      await setItem(item.id, {
        status: "pending",
        locked_until: null,
        next_attempt_at: new Date(Date.now() + item.attempts * 10_000).toISOString(),
        error_enc: encrypt(message, jobCtx.err(item.id)),
      })
    } else {
      await finishFailure(job, item, wallet.address, message)
    }
    return
  }

  // Sent. From here on it is never re-sent: record the hash first, then wait for confirmation.
  await setItem(item.id, { status: "sent", tx_enc: encrypt(tx.hash, jobCtx.tx(item.id)), sent_at: new Date().toISOString(), locked_until: null })
  await saveTransaction(item, job.chainId, "pending", { hash: tx.hash, wallet: wallet.address, contract: job.contract })

  try {
    const waitMs = Math.max(5_000, Math.min(45_000, deadline - Date.now() - 3_000))
    const receipt = await Promise.race([tx.wait(1), sleep(waitMs).then(() => null)])
    if (receipt) await finishSuccess(job, item, wallet.address, tx.hash, receipt)
    // no receipt yet: stays "sent", the next worker run confirms it
  } catch (error: any) {
    if (error?.code === "CALL_EXCEPTION") await finishFailure(job, item, wallet.address, "Transaction reverted on chain", tx.hash)
  }
}

async function runJob(job: Job, deadline: number) {
  const lanes = Math.max(1, Math.min(job.concurrency, 50))
  const secretsCache = new Map<string, { address: string; privateKey: string }>()

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (Date.now() < deadline - 10_000) {
        const claimed = await db().rpc("claim_mint_items", { p_job_id: job.id, p_limit: 1, p_lock_seconds: 180 })
        if (claimed.error) throw new Error(claimed.error.message)
        const item = (claimed.data as any[])?.[0]
        if (!item) {
          // Nothing claimable right now. Wait only if something will be ready within seconds
          // (for example a wallet's next mint behind its previous one).
          const soon = new Date(Date.now() + 5_000).toISOString()
          const { count } = await db().from("mint_job_items").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "pending").lte("next_attempt_at", soon)
          if (!count) return
          await sleep(1_500)
          continue
        }
        if (!secretsCache.has(item.wallet_id)) {
          const fetched = await getWalletSecrets([item.wallet_id])
          fetched.forEach((v, k) => secretsCache.set(k, v))
        }
        await processItem(job, item, secretsCache, deadline)
      }
    }),
  )
  await db().rpc("finalize_job", { p_job_id: job.id })
}

/** Items left "processing" by a crashed run: retry them safely, or flag them if a send may have happened. */
async function recoverStale() {
  const rows = must(
    await db()
      .from("mint_job_items")
      .select("id,job_id,wallet_id,nonce,mint_jobs(chain_id,contract_enc)")
      .eq("status", "processing")
      .lt("locked_until", new Date().toISOString())
      .limit(100),
  ) as any[]
  if (rows.length === 0) return
  const secrets = await getWalletSecrets(rows.map((r) => r.wallet_id))
  for (const row of rows) {
    try {
      const wallet = secrets.get(row.wallet_id)
      if (row.nonce === null || !wallet) {
        await setItem(row.id, { status: "pending", locked_until: null })
        continue
      }
      const latest = await getProvider(row.mint_jobs.chain_id).getTransactionCount(wallet.address, "latest")
      if (latest > row.nonce) {
        const job: Job = { id: row.job_id, chainId: row.mint_jobs.chain_id, contract: decrypt(row.mint_jobs.contract_enc, jobCtx.contract(row.job_id)), concurrency: 1 }
        await finishFailure(job, row, wallet.address, "Interrupted after the transaction may have been sent. Check the wallet on the block explorer.")
      } else {
        await setItem(row.id, { status: "pending", locked_until: null })
      }
    } catch {
      /* try again on the next run */
    }
  }
}

/** Confirms transactions that were sent but not yet seen mined (including ones from earlier runs). */
async function reconcileSent(deadline: number) {
  const rows = must(
    await db()
      .from("mint_job_items")
      .select("id,job_id,wallet_id,tx_enc,sent_at,mint_jobs(chain_id,contract_enc)")
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .limit(200),
  ) as any[]
  if (rows.length === 0) return
  const secrets = await getWalletSecrets(rows.map((r) => r.wallet_id))
  const queue = [...rows]

  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (queue.length && Date.now() < deadline - 5_000) {
        const row = queue.shift()!
        try {
          const hash = decrypt(row.tx_enc, jobCtx.tx(row.id))
          const job: Job = { id: row.job_id, chainId: row.mint_jobs.chain_id, contract: decrypt(row.mint_jobs.contract_enc, jobCtx.contract(row.job_id)), concurrency: 1 }
          const address = secrets.get(row.wallet_id)?.address ?? ""
          const receipt = await getProvider(job.chainId).getTransactionReceipt(hash)
          if (receipt) {
            if (receipt.status === 1) await finishSuccess(job, row, address, hash, receipt)
            else await finishFailure(job, row, address, "Transaction reverted on chain", hash)
          } else if (Date.now() - Date.parse(row.sent_at) > SENT_TIMEOUT_MS) {
            await finishFailure(job, row, address, "Not confirmed after 30 minutes. Check the transaction on the block explorer.", hash)
          }
        } catch {
          /* leave it for the next run */
        }
      }
    }),
  )
}

export interface WorkerSummary {
  startedJobs: number
  jobsProcessed: number
  ms: number
}

/** One pass of the worker. Safe to call from cron and from "mint now" at the same time. */
export async function runWorker(options: { budgetMs?: number } = {}): Promise<WorkerSummary> {
  const started = Date.now()
  const deadline = started + (options.budgetMs ?? 50_000)

  await recoverStale()
  await reconcileSent(deadline)

  const claimed = await db().rpc("claim_due_jobs", { p_limit: 5 })
  if (claimed.error) throw new Error(claimed.error.message)

  const running = must(await db().from("mint_jobs").select("*").eq("status", "running").order("run_at", { ascending: true }).limit(10)) as any[]
  let processed = 0
  for (const row of running) {
    if (Date.now() > deadline - 12_000) break
    const job: Job = {
      id: row.id,
      chainId: row.chain_id,
      contract: decrypt(row.contract_enc, jobCtx.contract(row.id)),
      concurrency: row.concurrency,
    }
    try {
      await runJob(job, deadline)
      processed++
    } catch (error) {
      console.error("[worker] job pass failed:", error instanceof Error ? error.message : "unknown")
    }
  }
  return { startedJobs: (claimed.data as any[])?.length ?? 0, jobsProcessed: processed, ms: Date.now() - started }
}
