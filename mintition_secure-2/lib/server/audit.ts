import { createAdminClient } from "@/lib/supabase/server-admin"
import { encryptJson } from "@/lib/security/crypto"

/** Records security-relevant actions. Never throws: an audit failure must not break the action. */
export async function audit(event: string, ip: string | null, detail?: Record<string, unknown>) {
  try {
    const admin = createAdminClient()
    await admin.from("audit_log").insert({
      event,
      ip,
      detail_enc: detail ? encryptJson(detail, `audit|${event}`) : null,
    })
  } catch {
    /* ignore */
  }
}
