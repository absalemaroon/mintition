import { NextResponse } from "next/server"
import { ApiError, NO_INDEX, assertCronSecret } from "@/lib/security/guard"
import { runWorker } from "@/lib/server/mint-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Called every minute by Supabase pg_cron (see scripts/003_schedule_worker.sql).
 * Not behind the IP allowlist or a login: it is protected by the CRON_SECRET bearer token instead.
 */
export async function POST(req: Request) {
  try {
    assertCronSecret(req)
    const summary = await runWorker({ budgetMs: 50_000 })
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX } })
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[worker] failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Worker error" }, { status: 500 })
  }
}
