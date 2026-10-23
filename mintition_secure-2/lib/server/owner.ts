import { createAdminClient } from "@/lib/supabase/server-admin"

/** True only on a brand-new project: no owner row and no user in Supabase Auth. */
export async function needsSetup(): Promise<boolean> {
  const admin = createAdminClient() as any
  const { data: owner } = await admin.from("app_owner").select("user_id").limit(1).maybeSingle()
  if (owner) return false
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  return (data?.users?.length ?? 0) === 0
}
