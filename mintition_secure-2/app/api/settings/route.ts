import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { getBranding, updateProjectName } from "@/lib/server/settings"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => getBranding())

const schema = z.object({ projectName: z.string().min(1).max(40) })

export const PATCH = route(async (req, { ip }) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Name must be 1 to 40 characters")
  const name = await updateProjectName(body.data.projectName)
  await audit("settings.name", ip)
  return { name }
})
