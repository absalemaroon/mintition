import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { clientIpFromHeaders } from "@/lib/security/ip"

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const NO_INDEX = "noindex, nofollow, noarchive, nosnippet, noimageindex"

export function clientIp(req: Request): string | null {
  return clientIpFromHeaders(req.headers)
}

let ownerCache: { userId: string; at: number } | null = null

async function getOwnerId(): Promise<string | null> {
  if (ownerCache && Date.now() - ownerCache.at < 60_000) return ownerCache.userId
  const admin = createAdminClient()
  const { data } = await admin.from("app_owner").select("user_id").limit(1).maybeSingle()
  const userId = (data as { user_id: string } | null)?.user_id ?? null
  if (userId) ownerCache = { userId, at: Date.now() }
  return userId
}

/**
 * Every API route calls this first. It does not trust the proxy: the session is
 * verified with Supabase Auth, and the user must be THE owner of this project.
 */
export async function requireOwner(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiError(401, "Not signed in")
  const ownerId = await getOwnerId()
  if (!ownerId || ownerId !== user.id) throw new ApiError(403, "Forbidden")
  return { userId: user.id, email: user.email ?? "" }
}

/** Blocks cross-site form posts: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request) {
  const method = req.method.toUpperCase()
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return
  const origin = req.headers.get("origin")
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  if (!origin || !host) throw new ApiError(403, "Missing origin")
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new ApiError(403, "Bad origin")
  }
  if (originHost !== host) throw new ApiError(403, "Cross-origin request blocked")
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Bearer secret check for the background worker. */
export function assertCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32) throw new ApiError(503, "Worker is not configured")
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token || !safeEqual(token, secret)) throw new ApiError(401, "Unauthorized")
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX },
  })
}

/**
 * Wraps a route handler: same-origin check, owner check, and errors that never leak internals.
 * Pass { auth: false } for routes that authenticate themselves.
 */
export function route(
  handler: (req: Request, ctx: { userId: string; email: string; ip: string | null }) => Promise<unknown>,
  options: { auth?: boolean } = {},
) {
  return async (req: Request) => {
    try {
      assertSameOrigin(req)
      const identity = options.auth === false ? { userId: "", email: "" } : await requireOwner()
      const result = await handler(req, { ...identity, ip: clientIp(req) })
      if (result instanceof Response) return result
      return json(result)
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status)
      console.error("[api] unexpected error:", error instanceof Error ? error.message : "unknown")
      return json({ error: "Something went wrong" }, 500)
    }
  }
}

export { json }
