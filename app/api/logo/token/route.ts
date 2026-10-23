import { NO_INDEX } from "@/lib/security/guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 20

/** Token logos. Only a short list of image hosts is allowed, never SVG, and size is capped. */
const HOSTS = new Set(["dd.dexscreener.com", "cdn.dexscreener.com", "raw.githubusercontent.com", "ipfs.io", "arweave.net", "cf-ipfs.com"])
const MAX_BYTES = 400 * 1024

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") || ""
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  if (target.protocol !== "https:" || !HOSTS.has(target.hostname) || target.username || target.password || target.port) return new Response(null, { status: 400 })
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: "error" })
    if (!res.ok) return new Response(null, { status: 404 })
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length === 0 || body.length > MAX_BYTES) return new Response(null, { status: 413 })
    let type = ""
    if (body[0] === 0x89 && body[1] === 0x50) type = "image/png"
    else if (body[0] === 0xff && body[1] === 0xd8) type = "image/jpeg"
    else if (body.subarray(0, 3).toString() === "GIF") type = "image/gif"
    else if (body.subarray(8, 12).toString() === "WEBP") type = "image/webp"
    else return new Response(null, { status: 415 })
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Robots-Tag": NO_INDEX },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
