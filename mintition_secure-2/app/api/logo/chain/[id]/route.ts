import { CHAINS } from "@/lib/chains"
import { NO_INDEX } from "@/lib/security/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Network logos, fetched on first use from the open ethereum-lists/chains registry (the data behind chainlist.org)
 * and kept in memory. The browser caches each one for a year. No third party sees your browser.
 */
const RAW = "https://raw.githubusercontent.com/ethereum-lists/chains/master/_data"
const GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"]
const SOLANA_LOGO = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
const MAX_BYTES = 300 * 1024
const cache = new Map<string, { type: string; body: Buffer } | null>()

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  return res.ok ? res.json() : null
}

async function fetchImage(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) return null
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length === 0 || body.length > MAX_BYTES) return null
  const head = body.subarray(0, 300).toString("utf8")
  if (body[0] === 0x89 && body[1] === 0x50) return { type: "image/png", body }
  if (body[0] === 0xff && body[1] === 0xd8) return { type: "image/jpeg", body }
  if (body.subarray(8, 12).toString() === "WEBP") return { type: "image/webp", body }
  if (head.includes("<svg") && !/<script|onload\s*=|onerror\s*=|javascript:/i.test(body.toString("utf8"))) return { type: "image/svg+xml", body }
  return null
}

async function resolve(chainId: number) {
  if (chainId === 101) return fetchImage(SOLANA_LOGO)
  const chain = await getJson(`${RAW}/chains/eip155-${chainId}.json`)
  if (!chain?.icon) return null
  const icons = await getJson(`${RAW}/icons/${encodeURIComponent(chain.icon)}.json`)
  const best = Array.isArray(icons) ? icons.find((i: any) => typeof i.url === "string" && i.url.startsWith("ipfs://")) : null
  if (!best) return null
  const path = best.url.slice("ipfs://".length)
  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) return null
  for (const gateway of GATEWAYS) {
    try {
      const img = await fetchImage(gateway + path)
      if (img) return img
    } catch {
      /* next gateway */
    }
  }
  return null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chainId = Number(id)
  if (!Number.isInteger(chainId) || !CHAINS.some((c) => c.chainId === chainId)) return new Response(null, { status: 404 })
  if (!cache.has(id)) {
    try {
      cache.set(id, await resolve(chainId))
    } catch {
      return new Response(null, { status: 404 })
    }
  }
  const hit = cache.get(id)
  if (!hit) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } })
  return new Response(new Uint8Array(hit.body), {
    headers: {
      "Content-Type": hit.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Robots-Tag": NO_INDEX,
    },
  })
}
