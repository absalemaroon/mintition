import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function isValidSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  try {
    if (!url) return false
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Create a server-side Supabase client with cookie management
 */
export async function createClient() {
  const cookieStore = await cookies()

  // Fallback for dev mode when Supabase isn't configured
  if (!isValidSupabaseUrl()) {
    return createServerClient("https://placeholder.supabase.co", "placeholder-anon-key", {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    })
  }

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have proxy refreshing
          // user sessions.
        }
      },
    },
  })
}
