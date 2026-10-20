import { NO_INDEX } from "@/lib/security/guard"
import { readLogo } from "@/lib/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const logo = await readLogo()
  if (!logo) return new Response(null, { status: 404, headers: { "X-Robots-Tag": NO_INDEX } })
  return new Response(logo.body, {
    headers: {
      "Content-Type": logo.mime,
      // The page asks for ?v=<version>, so a new upload gets a new URL and can be cached hard.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Robots-Tag": NO_INDEX,
    },
  })
}
