import { createClient } from "@supabase/supabase-js"

/**
 * Create an admin client that bypasses RLS using service role key
 * This is used for server-side operations that need to access protected data
 */
let adminClient: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (!adminClient) {
    adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  return adminClient
}
