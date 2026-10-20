import { route } from "@/lib/security/guard"
import { migrateLegacyBatches } from "@/lib/server/vault"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Encrypts wallets that older versions stored in plain text, then wipes the plain copy. */
export const POST = route(async (_req, { ip }) => {
  const result = await migrateLegacyBatches()
  await audit("legacy.migrated", ip, result)
  return result
})
