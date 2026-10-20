import { createAdminClient } from "@/lib/supabase/server-admin"
import { route } from "@/lib/security/guard"
import { encryptionConfigured } from "@/lib/security/crypto"
import { parseIpList } from "@/lib/security/ip"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => {
  const { data } = await (createAdminClient() as any).rpc("security_status")
  const db = (data ?? {}) as Record<string, any>
  return {
    database: {
      singleUserRule: Boolean(db.single_user_trigger),
      userCount: Number(db.user_count ?? 0),
      tablesLocked: Boolean(db.rls_on_all_tables) && Boolean(db.anon_blocked),
      workerScheduled: Boolean(db.worker_scheduled),
      legacyPlaintextBatches: Number(db.legacy_plaintext_batches ?? 0),
      available: data !== null && data !== undefined,
    },
    server: {
      encryptionKeySet: encryptionConfigured(),
      cronSecretSet: (process.env.CRON_SECRET || "").length >= 32,
      envBreakGlassIps: parseIpList(process.env.ALLOWED_IPS).length,
    },
  }
})
