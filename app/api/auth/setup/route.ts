import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { route, ApiError } from "@/lib/security/guard"
import { normalizeCidr } from "@/lib/security/ip"
import { invalidateAllowlistCache } from "@/lib/security/allowlist"
import { audit } from "@/lib/server/audit"
import { needsSetup } from "@/lib/server/owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const db = () => createAdminClient() as any

export const GET = route(async () => ({ needsSetup: await needsSetup() }), { auth: false })

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12, "Use at least 12 characters").max(200),
})

/**
 * Creates THE account. Works exactly once: after it, the database itself refuses any other
 * user (trigger enforce_single_user), and this endpoint answers 404.
 */
export const POST = route(
  async (req, { ip }) => {
    if (!(await needsSetup())) throw new ApiError(404, "Not found")
    const body = schema.safeParse(await req.json().catch(() => null))
    if (!body.success) throw new ApiError(400, body.error.issues[0]?.message || "Check email and password")

    const { error } = await db().auth.admin.createUser({ email: body.data.email, password: body.data.password, email_confirm: true })
    if (error) throw new ApiError(400, "Could not create the account")

    // The owner's current IP becomes the first allowed address, which closes the setup window.
    const cidr = ip ? normalizeCidr(ip) : null
    if (cidr) {
      await db().from("allowed_ips").insert({ cidr, label: "Owner (first sign-up)" })
      invalidateAllowlistCache()
    }
    await audit("owner.created", ip)
    return { ok: true, ipAllowed: cidr }
  },
  { auth: false },
)
