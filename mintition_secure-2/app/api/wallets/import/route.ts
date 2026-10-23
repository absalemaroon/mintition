import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { importWallets } from "@/lib/server/vault"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  name: z.string().max(80).optional(),
  family: z.enum(["evm", "solana"]).default("evm"),
  wallets: z.array(z.object({ address: z.string().max(64).default(""), privateKey: z.string().max(400) })).min(1).max(2000),
})

export const POST = route(async (req, { ip }) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Invalid wallet list")
  const result = await importWallets(body.data.wallets, body.data.name, body.data.family)
  await audit("wallets.imported", ip, { imported: result.imported })
  return result
})
