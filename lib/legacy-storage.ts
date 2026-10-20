import type { LegacyWallet } from "./types"

/**
 * Older versions kept wallets, private keys included, in this browser's localStorage.
 * This file only reads that data so it can be moved into the encrypted vault, then wipes it.
 */
const LEGACY_KEYS = ["celo_wallets_v2", "celo_transactions"]

export function readLegacyWallets(): LegacyWallet[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem("celo_wallets_v2")
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((w) => w && typeof w.address === "string" && typeof w.privateKey === "string").map((w) => ({ address: w.address, privateKey: w.privateKey }))
      : []
  } catch {
    return []
  }
}

export function clearLegacyStorage() {
  if (typeof window === "undefined") return
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}
