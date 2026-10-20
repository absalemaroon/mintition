import { route } from "@/lib/security/guard"
import { getBranding } from "@/lib/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Read by the login page too, so no session is needed. The IP gate in proxy.ts still applies.
export const GET = route(async () => getBranding(), { auth: false })
