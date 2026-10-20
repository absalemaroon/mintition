import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"
import { checkIp } from "@/lib/security/allowlist"
import { clientIpFromHeaders } from "@/lib/security/ip"

const NO_INDEX = "noindex, nofollow, noarchive, nosnippet, noimageindex"

/** Pages and endpoints that work without being signed in (the IP gate still applies to all of them). */
const PUBLIC_PREFIXES = ["/auth/", "/api/auth/", "/api/branding"]

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next/") || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?)$/.test(pathname)
}

function withHeaders(response: NextResponse, pathname: string) {
  response.headers.set("X-Robots-Tag", NO_INDEX)
  if (!isStaticAsset(pathname)) response.headers.set("Cache-Control", "no-store")
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. The background worker is called by Supabase, not by you. It is protected by its own secret
  //    (checked in the route), so it skips the IP gate and the login.
  if (pathname === "/api/cron/mint-worker") return withHeaders(NextResponse.next(), pathname)

  // 2. IP allowlist. Anyone else gets a blank 404: the app never loads, and nothing says it exists.
  const gate = await checkIp(clientIpFromHeaders(request.headers))
  if (!gate.allowed) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX },
    })
  }

  // 3. Static files need no session.
  if (isStaticAsset(pathname)) return withHeaders(NextResponse.next(), pathname)

  // 4. Session.
  const { response, user } = await updateSession(request)
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === "/robots.txt"

  if (user && pathname === "/auth/login") return withHeaders(NextResponse.redirect(new URL("/dashboard", request.url)), pathname)
  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return withHeaders(NextResponse.json({ error: "Not signed in" }, { status: 401 }), pathname)
    }
    return withHeaders(NextResponse.redirect(new URL("/auth/login", request.url)), pathname)
  }
  return withHeaders(response, pathname)
}

export const config = {
  // Everything, including static files: an IP that is not allowed cannot load even one byte.
  matcher: ["/:path*"],
}
