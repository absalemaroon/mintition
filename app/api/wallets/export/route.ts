import { z } from "zod"
import { createClient as createPlainClient } from "@supabase/supabase-js"
import { route, ApiError } from "@/lib/security/guard"
import { exportCsv } from "@/lib/server/vault"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({ password: z.string().min(1).max(200), batchId: z.string().uuid().optional() })

// Slows down password guessing on this endpoint (Supabase also rate-limits sign-ins).
const attempts: number[] = []
const WINDOW_MS = 10 * 60_000
const MAX_ATTEMPTS = 5

/** Exporting private keys is the most sensitive action in the app: the password must be typed again. */
export const POST = route(async (req, { email, ip }) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Password required")

  const now = Date.now()
  while (attempts.length && now - attempts[0] > WINDOW_MS) attempts.shift()
  if (attempts.length >= MAX_ATTEMPTS) throw new ApiError(429, "Too many attempts. Try again in a few minutes.")
  attempts.push(now)

  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await verifier.auth.signInWithPassword({ email, password: body.data.password })
  if (error) {
    await audit("export.denied", ip)
    throw new ApiError(403, "Wrong password")
  }

  const csv = await exportCsv(body.data.batchId)
  await audit("export.keys", ip, { batchId: body.data.batchId ?? "all" })
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wallets-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  })
})
