import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { generateBatch, listWallets } from "@/lib/server/vault"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const uuid = z.string().uuid()

export const GET = route(async (req) => {
  const batchId = new URL(req.url).searchParams.get("batchId") || undefined
  if (batchId && !uuid.safeParse(batchId).success) throw new ApiError(400, "Bad batch id")
  return { wallets: await listWallets(batchId) }
})

const generateSchema = z.object({ count: z.number().int().min(1).max(100), name: z.string().max(80).optional(), family: z.enum(["evm", "solana"]).default("evm") })

export const POST = route(async (req, { ip }) => {
  const body = generateSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Count must be between 1 and 100")
  const result = await generateBatch(body.data.count, body.data.name, body.data.family)
  await audit("wallets.generated", ip, { count: body.data.count, batchId: result.batchId, family: body.data.family })
  return result
})
