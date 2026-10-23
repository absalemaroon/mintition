import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { FUNDING_STATUSES, updateFunding } from "@/lib/server/vault"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  updates: z
    .array(z.object({ id: z.string().uuid(), fundingStatus: z.enum(FUNDING_STATUSES), balance: z.string().max(40).optional() }))
    .min(1)
    .max(500),
})

export const POST = route(async (req) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Invalid update")
  await updateFunding(body.data.updates)
  return { ok: true }
})
