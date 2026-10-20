import { ipMatchesAny, parseIpList } from "@/lib/security/ip"

/**
 * IP gate used by the proxy on EVERY request.
 *
 * Allowed = the client IP is in the ALLOWED_IPS env var (break-glass, always works)
 * or in the allowed_ips table (managed by the owner in Settings).
 *
 * Fresh install (no owner yet and nothing listed) is the only case that is open, so
 * the owner can create the account; creating it adds their IP and closes the door.
 * If the database cannot be reached the gate fails CLOSED, using the last good list
 * for a short time.
 */

interface Snapshot {
  ips: string[]
  ownerExists: boolean
  at: number
}

const FRESH_MS = 20_000
const STALE_MS = 10 * 60_000
let cache: Snapshot | null = null

export function invalidateAllowlistCache() {
  cache = null
}

async function rest<T>(path: string): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env missing")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Supabase responded ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function loadSnapshot(): Promise<Snapshot | null> {
  const now = Date.now()
  if (cache && now - cache.at < FRESH_MS) return cache
  try {
    const [rows, owners] = await Promise.all([
      rest<{ cidr: string }[]>("allowed_ips?select=cidr"),
      rest<{ user_id: string }[]>("app_owner?select=user_id&limit=1"),
    ])
    cache = { ips: rows.map((r) => r.cidr), ownerExists: owners.length > 0, at: now }
    return cache
  } catch {
    return cache && now - cache.at < STALE_MS ? cache : null
  }
}

export interface GateResult {
  allowed: boolean
  reason: "env" | "list" | "setup-mode" | "denied" | "no-ip" | "db-unavailable"
}

export async function checkIp(ip: string | null): Promise<GateResult> {
  if (!ip) return { allowed: false, reason: "no-ip" }
  const envList = parseIpList(process.env.ALLOWED_IPS)
  if (ipMatchesAny(ip, envList)) return { allowed: true, reason: "env" }

  const snapshot = await loadSnapshot()
  if (!snapshot) return { allowed: false, reason: "db-unavailable" }

  const strict = snapshot.ownerExists || snapshot.ips.length > 0 || envList.length > 0
  if (!strict) return { allowed: true, reason: "setup-mode" }
  return ipMatchesAny(ip, snapshot.ips) ? { allowed: true, reason: "list" } : { allowed: false, reason: "denied" }
}
