import { ethers } from "ethers"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { blindIndex, decrypt, decryptJson, encrypt, encryptJson } from "@/lib/security/crypto"
import { ApiError } from "@/lib/security/guard"
import { generateKeypair, parseSecretKey } from "@/lib/server/solana/keys"

export type WalletFamily = "evm" | "solana"

/** EVM addresses are case-insensitive, Solana addresses are not. */
const addrKey = (family: WalletFamily, address: string) => (family === "evm" ? address.toLowerCase() : address)

/**
 * Encrypted wallet vault. Private keys and addresses never touch the database in plain text:
 * they are encrypted here with AES-256-GCM (see lib/security/crypto.ts), bound to their row id.
 * The browser only ever receives addresses and statuses, never keys.
 */

const db = () => createAdminClient() as any

export const FUNDING_STATUSES = ["not_funded", "funding", "funded", "funding_failed"] as const
export type FundingStatus = (typeof FUNDING_STATUSES)[number]

export interface PublicWallet {
  id: string
  family: WalletFamily
  batchId: string | null
  address: string
  fundingStatus: FundingStatus
  status: string
  mintsCompleted: number
  balance: string
}

export interface PublicBatch {
  id: string
  family: WalletFamily
  name: string
  description: string
  walletCount: number
  totalMints: number
  createdAt: string
}

function must<T>(res: { data: T; error: any }): T {
  if (res.error) throw new Error(res.error.message || "Database error")
  return res.data
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const ctx = {
  pk: (id: string) => `wallet.pk|${id}`,
  addr: (id: string) => `wallet.addr|${id}`,
  meta: (id: string) => `wallet.meta|${id}`,
  batch: (id: string) => `batch.meta|${id}`,
}

interface NewWallet {
  address: string
  privateKey: string
}

function sanitizeName(name: string | undefined, fallback: string): string {
  const cleaned = (name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80)
  return cleaned || fallback
}

function walletRow(batchId: string, w: NewWallet, family: WalletFamily = "evm") {
  const id = randomUUID()
  return {
    id,
    batch_id: batchId,
    family,
    address_enc: encrypt(w.address, ctx.addr(id)),
    address_hash: blindIndex(addrKey(family, w.address)),
    pk_enc: encrypt(w.privateKey, ctx.pk(id)),
    meta_enc: encryptJson({ balance: "0" }, ctx.meta(id)),
  }
}

/** Creates a batch and encrypts + stores its wallets. Skips addresses already in the vault. */
async function storeBatch(name: string, description: string, wallets: NewWallet[], family: WalletFamily = "evm"): Promise<string> {
  const batchId = randomUUID()
  must(
    await db()
      .from("wallet_batches")
      .insert({
        id: batchId,
        family,
        name: "encrypted",
        description: "",
        wallet_count: 0,
        wallet_data: [],
        total_mints: 0,
        total_funded: "0",
        meta_enc: encryptJson({ name, description }, ctx.batch(batchId)),
      }),
  )

  try {
    let stored = 0
    for (const group of chunk(wallets, 200)) {
      const existing = must(
        await db()
          .from("wallets")
          .select("address_hash")
          .in("address_hash", group.map((w) => blindIndex(addrKey(family, w.address)))),
      ) as { address_hash: string }[]
      const known = new Set(existing.map((r) => r.address_hash))
      const rows = group.filter((w) => !known.has(blindIndex(addrKey(family, w.address)))).map((w) => walletRow(batchId, w, family))
      if (rows.length) must(await db().from("wallets").insert(rows))
      stored += rows.length
    }
    must(await db().from("wallet_batches").update({ wallet_count: stored }).eq("id", batchId))
    return batchId
  } catch (error) {
    await db().from("wallets").delete().eq("batch_id", batchId)
    await db().from("wallet_batches").delete().eq("id", batchId)
    throw error
  }
}

/** Generates wallets on the server so the keys are born encrypted. */
export async function generateBatch(count: number, name?: string, family: WalletFamily = "evm"): Promise<{ batchId: string; wallets: PublicWallet[] }> {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new ApiError(400, "Count must be between 1 and 100")
  const wallets: NewWallet[] = Array.from({ length: count }, () => {
    if (family === "solana") {
      const k = generateKeypair()
      return { address: k.address, privateKey: k.secretKey }
    }
    const w = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)))
    return { address: w.address, privateKey: w.privateKey }
  })
  const batchId = await storeBatch(sanitizeName(name, `Batch ${new Date().toISOString().slice(0, 16).replace("T", " ")}`), "", wallets, family)
  return { batchId, wallets: await listWallets(batchId) }
}

/** Moves wallets the user already has (for example from the old browser storage) into the vault. */
export async function importWallets(items: NewWallet[], name?: string, family: WalletFamily = "evm"): Promise<{ batchId: string; imported: number; skipped: number }> {
  const valid: NewWallet[] = []
  const seen = new Set<string>()
  for (const item of items) {
    try {
      let derived: string
      let secret = item.privateKey
      if (family === "solana") {
        const k = parseSecretKey(item.privateKey) // the address is always derived from the key
        derived = k.address
        secret = k.secretKey
      } else {
        if (!ethers.isHexString(item.privateKey, 32)) continue
        derived = new ethers.Wallet(item.privateKey).address
      }
      if (seen.has(addrKey(family, derived))) continue
      seen.add(addrKey(family, derived))
      valid.push({ address: derived, privateKey: secret })
    } catch {
      /* skip invalid entry */
    }
  }
  if (valid.length === 0) throw new ApiError(400, "No valid wallets found")
  const batchId = await storeBatch(sanitizeName(name, "Imported wallets"), "Imported", valid, family)
  const { count } = await db().from("wallets").select("id", { count: "exact", head: true }).eq("batch_id", batchId)
  const imported = count ?? 0
  return { batchId, imported, skipped: items.length - imported }
}

export async function listWallets(batchId?: string): Promise<PublicWallet[]> {
  let query = db()
    .from("wallets")
    .select("id,batch_id,family,address_enc,funding_status,status,mints_completed,meta_enc,created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(0, 4999)
  if (batchId) query = query.eq("batch_id", batchId)
  const rows = must(await query) as any[]
  return rows.map((r) => {
    let balance = "0"
    try {
      if (r.meta_enc) balance = decryptJson<{ balance?: string }>(r.meta_enc, ctx.meta(r.id)).balance ?? "0"
    } catch {
      /* unreadable meta is shown as 0 */
    }
    return {
      id: r.id,
      family: (r.family ?? "evm") as WalletFamily,
      batchId: r.batch_id,
      address: decrypt(r.address_enc, ctx.addr(r.id)),
      fundingStatus: r.funding_status,
      status: r.status,
      mintsCompleted: r.mints_completed,
      balance,
    }
  })
}

export async function listBatches(): Promise<PublicBatch[]> {
  const rows = must(
    await db()
      .from("wallet_batches")
      .select("id,family,name,description,wallet_count,total_mints,created_at,meta_enc")
      .order("created_at", { ascending: false })
      .limit(200),
  ) as any[]
  return rows.map((r) => {
    let name = r.name
    let description = r.description || ""
    if (r.meta_enc) {
      try {
        const meta = decryptJson<{ name: string; description?: string }>(r.meta_enc, ctx.batch(r.id))
        name = meta.name
        description = meta.description ?? ""
      } catch {
        name = "Unreadable batch"
      }
    }
    return { id: r.id, family: (r.family ?? "evm") as WalletFamily, name, description, walletCount: r.wallet_count, totalMints: r.total_mints ?? 0, createdAt: r.created_at }
  })
}

export async function updateFunding(updates: { id: string; fundingStatus: FundingStatus; balance?: string }[]) {
  for (const group of chunk(updates, 25)) {
    await Promise.all(
      group.map(async (u) => {
        const patch: Record<string, unknown> = { funding_status: u.fundingStatus }
        if (u.balance !== undefined) patch.meta_enc = encryptJson({ balance: u.balance }, ctx.meta(u.id))
        must(await db().from("wallets").update(patch).eq("id", u.id))
      }),
    )
  }
}

/** Server-only: decrypts keys for the mint worker. Never return this to a client. */
export async function getWalletSecrets(ids: string[]): Promise<Map<string, { address: string; privateKey: string }>> {
  const out = new Map<string, { address: string; privateKey: string }>()
  for (const group of chunk([...new Set(ids)], 200)) {
    const rows = must(await db().from("wallets").select("id,address_enc,pk_enc").in("id", group)) as any[]
    for (const r of rows) {
      out.set(r.id, { address: decrypt(r.address_enc, ctx.addr(r.id)), privateKey: decrypt(r.pk_enc, ctx.pk(r.id)) })
    }
  }
  return out
}

/** Addresses only (no keys) for the given wallet ids. */
export async function getWalletAddresses(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const group of chunk([...new Set(ids)], 200)) {
    const rows = must(await db().from("wallets").select("id,address_enc").in("id", group)) as any[]
    for (const r of rows) out.set(r.id, decrypt(r.address_enc, ctx.addr(r.id)))
  }
  return out
}

export async function exportCsv(batchId?: string): Promise<string> {
  let query = db().from("wallets").select("id,address_enc,pk_enc,funding_status,mints_completed,status").order("created_at", { ascending: true }).range(0, 4999)
  if (batchId) query = query.eq("batch_id", batchId)
  const rows = must(await query) as any[]
  const lines = rows.map((r, i) =>
    [i + 1, decrypt(r.address_enc, ctx.addr(r.id)), decrypt(r.pk_enc, ctx.pk(r.id)), r.funding_status === "funded" ? "Yes" : "No", r.mints_completed, r.status]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  )
  return ["Wallet #,Address,Private Key,Funded,Mints Completed,Status", ...lines].join("\n")
}

/**
 * One-time upgrade for data saved by the old version, where private keys sat in plain text in
 * wallet_batches.wallet_data. Encrypts each wallet, and only wipes the plain copy once it is safely stored.
 */
export async function migrateLegacyBatches(): Promise<{ batches: number; wallets: number }> {
  const rows = must(await db().from("wallet_batches").select("id,name,description,wallet_data,meta_enc").limit(500)) as any[]
  let batches = 0
  let walletsMoved = 0
  for (const row of rows) {
    const data = Array.isArray(row.wallet_data) ? row.wallet_data : []
    if (data.length === 0) continue

    const valid: NewWallet[] = []
    for (const w of data) {
      try {
        if (ethers.isHexString(w?.privateKey, 32)) valid.push({ address: new ethers.Wallet(w.privateKey).address, privateKey: w.privateKey })
      } catch {
        /* skip */
      }
    }

    const hashes = valid.map((w) => blindIndex(w.address.toLowerCase()))
    const existing = valid.length
      ? (must(await db().from("wallets").select("address_hash").in("address_hash", hashes)) as { address_hash: string }[])
      : []
    const known = new Set(existing.map((r) => r.address_hash))
    const fresh = valid.filter((w) => !known.has(blindIndex(w.address.toLowerCase())))
    for (const group of chunk(fresh, 200)) must(await db().from("wallets").insert(group.map((w) => walletRow(row.id, w))))

    // Verify everything is in the vault before removing the plain-text copy.
    const stored = hashes.length
      ? (must(await db().from("wallets").select("address_hash").in("address_hash", hashes)) as unknown[]).length
      : 0
    if (stored < valid.length) throw new Error(`Batch ${row.id}: not all wallets were stored, plain copy kept`)

    must(
      await db()
        .from("wallet_batches")
        .update({
          name: "encrypted",
          description: "",
          wallet_data: [],
          wallet_count: valid.length,
          meta_enc: row.meta_enc ?? encryptJson({ name: row.name, description: row.description || "" }, ctx.batch(row.id)),
        })
        .eq("id", row.id),
    )
    batches++
    walletsMoved += fresh.length
  }
  return { batches, wallets: walletsMoved }
}
