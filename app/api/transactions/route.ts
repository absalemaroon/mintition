import { route } from "@/lib/security/guard"
import { listTransactions } from "@/lib/server/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => ({ transactions: await listTransactions(200) }))
