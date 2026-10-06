import { createBrowserClient } from "@supabase/ssr"

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
 * Create a browser-side Supabase client
 */
export function createClient() {
  const url = isValidSupabaseUrl() ? process.env.NEXT_PUBLIC_SUPABASE_URL! : "https://placeholder.supabase.co"
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
  return createBrowserClient(url, key)
}
