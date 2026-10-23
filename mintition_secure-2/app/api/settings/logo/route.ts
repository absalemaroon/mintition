import { route, ApiError } from "@/lib/security/guard"
import { clearLogo, getBranding, saveLogo } from "@/lib/server/settings"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = route(async (req, { ip }) => {
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) throw new ApiError(400, "Choose an image file")
  await saveLogo(file)
  await audit("settings.logo.set", ip)
  return getBranding()
})

export const DELETE = route(async (_req, { ip }) => {
  await clearLogo()
  await audit("settings.logo.removed", ip)
  return getBranding()
})
