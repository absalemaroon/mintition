import { updateSession } from "@/lib/supabase/proxy"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

function isValidSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    if (!url) return false
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const pathname = requestUrl.pathname

  // First, update the session
  const response = await updateSession(request)

  // If Supabase isn't configured (dev mode without credentials), redirect to login for protected routes
  if (!isValidSupabaseConfig()) {
    if (pathname.startsWith("/auth/")) {
      return response
    }
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  // Create a Supabase client to check user session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  // Get the user session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Handle auth route access
  if (pathname.startsWith("/auth/")) {
    // If user is authenticated and trying to access login, redirect to dashboard
    if (user && pathname === "/auth/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return response
  }

  // Protect other routes - redirect to login if not authenticated
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
