import { ethers } from "ethers"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { decrypt, decryptJson, encrypt, encryptJson } from "@/lib/security/crypto"
import { MINET_ABI } from "@/lib/contract-config"
import { getChain } from "@/lib/chains"
import { getWalletSecrets } from "@/lib/server/vault"
import { jobCtx, type JobKind, type JobParams } from "@/lib/server/jobs"
import { ERC20_ABI, NATIVE_TOKEN_ADDRESS, chainOrThrow, getProvider } from "@/lib/server/evm"
import { TradeError, getSwapQuote } from "@/lib/server/swap"
import { prepareSolana, signAndCheck } from "@/lib/server/solana/trade"
import { getBlockHeight, getSignatureStatus, sendRaw as solanaSend } from "@/lib/server/solana/rpc"

/**
 * Server-side worker for every job kind: mint, buy, sell, transfer.
 *
 *  - Runs inside /api/cron/mint-worker, which Supabase pg_cron calls every minute, so jobs continue when no
 *    browser is open. Starting a job also kicks the worker immediately.
 *  - Parallel: `concurrency` lanes each claim one item at a time. Wallets are independent accounts, so they
 *    act at the same time; one wallet's own items stay in nonce order, across all jobs.
 *  - Safe to interrupt and to run twice at once: items are claimed with FOR UPDATE SKIP LOCKED, the nonce of the
 *    final transaction is fixed before sending, and the hash is saved the moment it is sent. A retry can
 *    therefore never repeat a transaction.
 *  - Every transaction is simulated (gas estimate) first. If the simulation fails, nothing is sent and no gas is spent.
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
  kind: JobKind
  /** Contract (mint), token (buy / sell / token transfer) or "native". */
  contract: string
  concurrency: number
  params: JobParams | null
}

export type FailureKind = "transient" | "permanent"

export function classifyError(err: any): { kind: FailureKind; message: string } {
  if (err?.name === "TradeError") return { kind: err.kind, message: String(err.message).slice(0, 280) }
  const code = String(err?.code || "")
  const raw = String(err?.shortMessage || err?.message || err || "Unknown error")
  const message = raw.replace(/\s+/g, " ").slice(0, 280)
  if (code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(raw)) return { kind: "permanent", message: "Not enough balance (including gas). Fund the wallet first." }
  if (code === "CALL_EXCEPTION" || code === "UNPREDICTABLE_GAS_LIMIT" || /execution reverted/i.test(raw)) {
    const reason = err?.reason ? `: ${String(err.reason).slice(0, 120)}` : ""
    return { kind: "permanent", message: `The transaction would fail, so it was not sent${reason}` }
  }
  if (code === "NONCE_EXPIRED" || /nonce too low|already known/i.test(raw)) {
    return { kind: "permanent", message: "Nonce already used. This may have gone through, check the wallet on the block explorer." }
  }
  return { kind: "transient", message }
}

const fmt = (value: bigint, decimals: number) => Number(ethers.formatUnits(value, decimals)).toLocaleString("en-US", { maximumSignificantDigits: 6 })
const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>()
async function tokenMeta(provider: ethers.JsonRpcProvider, chainId: number, token: string) {
  const key = `${chainId}:${token.toLowerCase()}`
  const hit = tokenMetaCache.get(key)
  if (hit) return hit
  const c = new ethers.Contract(token, ERC20_ABI, provider)
  const [symbol, decimals] = await Promise.all([c.getFunction("symbol")().catch(() => "TOKEN"), c.getFunction("decimals")().catch(() => 18)])
  const meta = { symbol: String(symbol).slice(0, 20), decimals: Number(decimals) }
  tokenMetaCache.set(key, meta)
  return meta
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
  job: Job,
  status: "pending" | "success" | "failed",
  payload: Record<string, unknown>,
) {
  const existing = await db().from("transactions").select("id,payload_enc").eq("item_id", item.id).maybeSingle()
  const id: string = existing.data?.id ?? randomUUID()
  let previous: Record<string, unknown> = {}
  if (existing.data?.payload_enc) {
    try {
      previous = decryptJson(existing.data.payload_enc, jobCtx.txRow(id))
    } catch {
      /* start fresh */
    }
  }
  must(
    await db()
      .from("transactions")
      .upsert(
        {
          id,
          item_id: item.id,
          job_id: item.job_id,
          wallet_id: item.wallet_id,
          chain_id: job.chainId,
          kind: job.kind,
          status,
          payload_enc: encryptJson({ ...previous, ...payload, kind: job.kind }, jobCtx.txRow(id)),
        },
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

async function finishSuccessGeneric(job: Job, item: any, address: string, hash: string, extra: Record<string, unknown>) {
  await setItem(item.id, { status: "success", locked_until: null, error_enc: null })
  await saveTransaction(item, job, "success", { hash, wallet: address, contract: job.contract, ...extra })
  if (job.kind === "mint") await db().rpc("increment_wallet_mints", { p_wallet_id: item.wallet_id })
  await db().rpc("finalize_job", { p_job_id: item.job_id })
}

async function finishSuccess(job: Job, item: any, address: string, hash: string, receipt: ethers.TransactionReceipt) {
  await finishSuccessGeneric(job, item, address, hash, { blockNumber: receipt.blockNumber, ...(job.kind === "mint" ? { tokenId: parseTokenId(receipt) } : {}) })
}

async function finishFailure(job: Job, item: any, address: string, message: string, hash?: string) {
  await setItem(item.id, { status: "failed", locked_until: null, error_enc: encrypt(message, jobCtx.err(item.id)) })
  await saveTransaction(item, job, "failed", { hash: hash ?? null, wallet: address, contract: job.contract, error: message })
  await db().rpc("finalize_job", { p_job_id: item.job_id })
}

interface Prepared {
  to: string
  data: string
  value: bigint
  /** Human summary shown in the history. */
  detail: string
  /** Gas estimate multiplier in percent. */
  gasBufferPct: number
}

async function waitForReceipt(provider: ethers.JsonRpcProvider, hash: string, ms: number) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const r = await provider.getTransactionReceipt(hash)
    if (r) return r
    await sleep(1500)
  }
  return null
}

/** Builds the transaction for one item. May send an approval first (sells). Never sends the main transaction itself. */
async function prepare(job: Job, item: any, signer: ethers.Wallet, provider: ethers.JsonRpcProvider): Promise<Prepared> {
  const chain = chainOrThrow(job.chainId)
  const address = signer.address
  const p = job.params

  if (job.kind === "mint") {
    const iface = new ethers.Interface(MINET_ABI)
    return { to: job.contract, data: iface.encodeFunctionData("mint", [address, tokenUri(chain.name, address, item.seq)]), value: 0n, detail: "Minted credential", gasBufferPct: 125 }
  }

  if (job.kind === "buy" && p?.kind === "buy") {
    const amountIn = BigInt(p.amountWei)
    const balance = await provider.getBalance(address)
    if (balance < amountIn) throw new TradeError("permanent", `Not enough ${chain.nativeSymbol}: wallet has ${fmt(balance, 18)}, needs ${p.amountDisplay} plus gas`)
    const fee = await provider.getFeeData()
    const meta = await tokenMeta(provider, job.chainId, job.contract)
    const quote = await getSwapQuote(
      { chainId: job.chainId, inToken: NATIVE_TOKEN_ADDRESS, outToken: job.contract, amountIn, slippagePct: p.slippage, account: address, gasPriceWei: fee.gasPrice ?? undefined },
      NATIVE_TOKEN_ADDRESS,
    )
    if (quote.priceImpactPct !== null && quote.priceImpactPct > p.maxImpact) {
      throw new TradeError("permanent", `Price impact ${quote.priceImpactPct.toFixed(1)}% is above your ${p.maxImpact}% limit. Not traded.`)
    }
    return { to: quote.to, data: quote.data, value: quote.value, detail: `Bought ~${fmt(quote.outAmount, meta.decimals)} ${meta.symbol} for ${p.amountDisplay} ${chain.nativeSymbol}`, gasBufferPct: 130 }
  }

  if (job.kind === "sell" && p?.kind === "sell") {
    const erc20 = new ethers.Contract(job.contract, ERC20_ABI, signer)
    const balance: bigint = await erc20.getFunction("balanceOf")(address)
    const amount = (balance * BigInt(Math.round(p.percent))) / 100n
    if (amount <= 0n) throw new TradeError("permanent", "This wallet holds none of this token")
    const meta = await tokenMeta(provider, job.chainId, job.contract)
    const fee = await provider.getFeeData()
    const quote = await getSwapQuote(
      { chainId: job.chainId, inToken: job.contract, outToken: NATIVE_TOKEN_ADDRESS, amountIn: amount, slippagePct: p.slippage, account: address, gasPriceWei: fee.gasPrice ?? undefined },
      NATIVE_TOKEN_ADDRESS,
    )
    if (quote.priceImpactPct !== null && quote.priceImpactPct > p.maxImpact) {
      throw new TradeError("permanent", `Price impact ${quote.priceImpactPct.toFixed(1)}% is above your ${p.maxImpact}% limit. Not traded.`)
    }
    // Approve exactly what is being sold (never an unlimited amount), and only if needed.
    const allowance: bigint = await erc20.getFunction("allowance")(address, quote.to)
    if (allowance < amount) {
      const approval = await erc20.getFunction("approve")(quote.to, amount)
      const receipt = await waitForReceipt(provider, approval.hash, 60_000)
      if (!receipt) throw new TradeError("transient", "Waiting for the approval to confirm")
      if (receipt.status !== 1) throw new TradeError("permanent", "The approval transaction failed")
    }
    return { to: quote.to, data: quote.data, value: quote.value, detail: `Sold ${fmt(amount, meta.decimals)} ${meta.symbol} for ~${fmt(quote.outAmount, 18)} ${chain.nativeSymbol}`, gasBufferPct: 130 }
  }

  if (job.kind === "transfer" && p?.kind === "transfer") {
    if (!item.meta_enc) throw new TradeError("permanent", "No destination for this wallet")
    const { to } = decryptJson<{ to: string }>(item.meta_enc, jobCtx.meta(item.id))
    if (!ethers.isAddress(to)) throw new TradeError("permanent", "Invalid destination address")

    if (p.asset === "native") {
      const balance = await provider.getBalance(address)
      let value: bigint
      if (p.mode === "fixed") {
        value = BigInt(p.amountWei!)
      } else {
        const fee = await provider.getFeeData()
        const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
        value = balance - 21_000n * price * 2n // keep twice the plain-transfer fee as headroom
      }
      if (value <= 0n || balance < value) throw new TradeError("permanent", `Not enough ${chain.nativeSymbol} to send and pay the fee`)
      return { to, data: "0x", value, detail: `Sent ${fmt(value, 18)} ${chain.nativeSymbol} to ${short(to)}`, gasBufferPct: 110 }
    }

    const erc20 = new ethers.Contract(job.contract, ERC20_ABI, signer)
    const meta = await tokenMeta(provider, job.chainId, job.contract)
    const balance: bigint = await erc20.getFunction("balanceOf")(address)
    const amount = p.mode === "fixed" ? BigInt(p.amountWei!) : balance
    if (amount <= 0n || balance < amount) throw new TradeError("permanent", `Not enough ${meta.symbol} in this wallet`)
    const iface = new ethers.Interface(ERC20_ABI)
    return { to: job.contract, data: iface.encodeFunctionData("transfer", [to, amount]), value: 0n, detail: `Sent ${fmt(amount, meta.decimals)} ${meta.symbol} to ${short(to)}`, gasBufferPct: 120 }
  }

  throw new TradeError("permanent", "Unknown job type")
}

/**
 * One Solana action. The transaction is signed first, and its signature (which is fixed by the signed content)
 * is saved BEFORE it is broadcast. If anything goes wrong afterwards, the same signed transaction can only ever land once.
 * A new one is built only after the old one's blockhash has expired, so a retry can never double up.
 */
async function processSolanaItem(job: Job, item: any, wallet: { address: string; privateKey: string }, deadline: number) {
  let signature = ""
  let detail = ""
  try {
    const meta = item.meta_enc ? decryptJson<{ to: string }>(item.meta_enc, jobCtx.meta(item.id)) : null
    const prepared = await prepareSolana({ kind: job.kind, contract: job.contract, params: job.params }, meta, wallet)
    detail = prepared.detail
    const checked = await signAndCheck(prepared, wallet)
    signature = checked.signature

    await setItem(item.id, { status: "sent", tx_enc: encrypt(signature, jobCtx.tx(item.id)), sent_at: new Date().toISOString(), nonce: prepared.lastValidBlockHeight, locked_until: null })
    await saveTransaction(item, job, "pending", { hash: signature, wallet: wallet.address, contract: job.contract, detail })
    try {
      await solanaSend(checked.signedBase64)
    } catch (error) {
      const c = classifyError(error)
      // A refusal on preflight means it can never land: stop here. Any other failure may have reached the network, so leave it to be confirmed by signature.
      if (c.kind === "permanent") {
        await finishFailure(job, item, wallet.address, c.message, signature)
        return
      }
    }
  } catch (error) {
    const { kind, message } = classifyError(error)
    if (signature) return // already recorded as sent
    if (kind === "transient" && item.attempts < MAX_ATTEMPTS) {
      await setItem(item.id, { status: "pending", locked_until: null, next_attempt_at: new Date(Date.now() + item.attempts * 10_000).toISOString(), error_enc: encrypt(message, jobCtx.err(item.id)) })
    } else {
      await finishFailure(job, item, wallet.address, message)
    }
    return
  }

  const until = Math.min(deadline - 3_000, Date.now() + 30_000)
  while (Date.now() < until) {
    await sleep(1_500)
    const st = await getSignatureStatus(signature).catch(() => null)
    if (st?.err) return finishFailure(job, item, wallet.address, `Transaction failed on chain: ${JSON.stringify(st.err).slice(0, 100)}`, signature)
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return finishSuccessGeneric(job, item, wallet.address, signature, {})
  }
  // not confirmed yet: it stays "sent" and the next worker run confirms it
}

async function processItem(job: Job, item: any, secrets: Map<string, { address: string; privateKey: string }>, deadline: number) {
  const wallet = secrets.get(item.wallet_id)
  if (!wallet) {
    await finishFailure(job, item, "", "Wallet not found in the vault")
    return
  }

  if (chainOrThrow(job.chainId).family === "solana") return processSolanaItem(job, item, wallet, deadline)

  let provider: ethers.JsonRpcProvider
  let tx: ethers.TransactionResponse
  let detail = ""
  try {
    provider = await getProvider(job.chainId)
    const signer = new ethers.Wallet(wallet.privateKey, provider)
    const prepared = await prepare(job, item, signer, provider)
    detail = prepared.detail

    // Fix the nonce right before the final transaction and keep it for every retry.
    let nonce: number | null = item.nonce
    if (nonce === null || nonce === undefined) {
      nonce = await provider.getTransactionCount(wallet.address, "pending")
      await setItem(item.id, { nonce })
    }
    const estimate = await signer.estimateGas({ to: prepared.to, data: prepared.data, value: prepared.value, from: wallet.address }) // reverts here cost no gas
    tx = await signer.sendTransaction({ to: prepared.to, data: prepared.data, value: prepared.value, nonce, gasLimit: (estimate * BigInt(prepared.gasBufferPct)) / 100n })
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
  await saveTransaction(item, job, "pending", { hash: tx.hash, wallet: wallet.address, contract: job.contract, detail })

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
          // (for example a wallet's next item behind its previous one).
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

function hydrateJob(row: any): Job {
  let params: JobParams | null = null
  if (row.params_enc) params = decryptJson<JobParams>(row.params_enc, jobCtx.params(row.id))
  return {
    id: row.id,
    chainId: row.chain_id,
    kind: row.kind ?? "mint",
    contract: decrypt(row.contract_enc, jobCtx.contract(row.id)),
    concurrency: row.concurrency,
    params,
  }
}

const JOB_COLUMNS = "chain_id,kind,params_enc,contract_enc"

/** Items left "processing" by a crashed run: retry them safely, or flag them if a send may have happened. */
async function recoverStale() {
  const rows = must(
    await db()
      .from("mint_job_items")
      .select(`id,job_id,wallet_id,nonce,mint_jobs(${JOB_COLUMNS})`)
      .eq("status", "processing")
      .lt("locked_until", new Date().toISOString())
      .limit(100),
  ) as any[]
  if (rows.length === 0) return
  const secrets = await getWalletSecrets(rows.map((r) => r.wallet_id))
  for (const row of rows) {
    try {
      const wallet = secrets.get(row.wallet_id)
      if (row.nonce === null || !wallet || chainOrThrow(row.mint_jobs.chain_id).family === "solana") {
        await setItem(row.id, { status: "pending", locked_until: null })
        continue
      }
      const provider = await getProvider(row.mint_jobs.chain_id)
      const latest = await provider.getTransactionCount(wallet.address, "latest")
      if (latest > row.nonce) {
        const job = hydrateJob({ id: row.job_id, concurrency: 1, ...row.mint_jobs })
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
      .select(`id,job_id,wallet_id,tx_enc,sent_at,nonce,attempts,mint_jobs(${JOB_COLUMNS})`)
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
          const job = hydrateJob({ id: row.job_id, concurrency: 1, ...row.mint_jobs })
          const address = secrets.get(row.wallet_id)?.address ?? ""
          if (chainOrThrow(job.chainId).family === "solana") {
            const st = await getSignatureStatus(hash)
            if (st) {
              if (st.err) await finishFailure(job, row, address, `Transaction failed on chain: ${JSON.stringify(st.err).slice(0, 100)}`, hash)
              else if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") await finishSuccessGeneric(job, row, address, hash, {})
            } else if (row.nonce && (await getBlockHeight()) > Number(row.nonce) + 5) {
              // Its blockhash has expired, so this transaction can never land: a fresh attempt cannot double up.
              if (row.attempts >= MAX_ATTEMPTS) await finishFailure(job, row, address, "Not confirmed before it expired", hash)
              else await setItem(row.id, { status: "pending", tx_enc: null, sent_at: null, nonce: null, locked_until: null, next_attempt_at: new Date(Date.now() + 5_000).toISOString() })
            } else if (Date.now() - Date.parse(row.sent_at) > SENT_TIMEOUT_MS) {
              await finishFailure(job, row, address, "Not confirmed after 30 minutes. Check the transaction on the block explorer.", hash)
            }
            continue
          }
          const provider = await getProvider(job.chainId)
          const receipt = await provider.getTransactionReceipt(hash)
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

/** One pass of the worker. Safe to call from cron and from "start now" at the same time. */
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
    try {
      await runJob(hydrateJob(row), deadline)
      processed++
    } catch (error) {
      console.error("[worker] job pass failed:", error instanceof Error ? error.message : "unknown")
    }
  }
  return { startedJobs: (claimed.data as any[])?.length ?? 0, jobsProcessed: processed, ms: Date.now() - started }
}
