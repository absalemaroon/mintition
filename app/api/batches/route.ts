import { route } from "@/lib/security/guard"
import { listBatches } from "@/lib/server/vault"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = route(async () => ({ batches: await listBatches() }))
