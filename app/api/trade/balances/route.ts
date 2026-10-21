import { ethers } from "ethers"
import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { chainOrThrow, ERC20_ABI, getProvider } from "@/lib/server/evm"
import { listWallets } from "@/lib/server/vault"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const schema = z.object({
  chainId: z.number().int().positive(),
  batchId: z.string().uuid(),
  token: z.string().max(64).optional(),
})

const LIMIT = 200

export const POST = route(async (req) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Check the form")
  const { chainId, batchId, token } = body.data
  const chain = chainOrThrow(chainId)
  if (chain.status !== "live") throw new ApiError(400, "That network is not available yet")
  if (token && !ethers.isAddress(token)) throw new ApiError(400, "Enter a valid token address")

  const wallets = (await listWallets(batchId)).slice(0, LIMIT)
  const provider = await getProvider(chainId)
  const erc20 = token ? new ethers.Contract(ethers.getAddress(token.toLowerCase()), ERC20_ABI, provider) : null
  const decimals = erc20 ? Number(await erc20.getFunction("decimals")().catch(() => 18)) : 18

  const rows: { walletId: string; address: string; native: string; token: string | null; error?: boolean }[] = []
  const queue = [...wallets]
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const w = queue.shift()!
        try {
          const [native, tokenBal] = await Promise.all([provider.getBalance(w.address), erc20 ? (erc20.getFunction("balanceOf")(w.address) as Promise<bigint>) : Promise.resolve(null)])
          rows.push({ walletId: w.id, address: w.address, native: ethers.formatEther(native), token: tokenBal === null ? null : ethers.formatUnits(tokenBal, decimals) })
        } catch {
          rows.push({ walletId: w.id, address: w.address, native: "0", token: null, error: true })
        }
      }
    }),
  )
  const order = new Map(wallets.map((w, i) => [w.id, i]))
  rows.sort((a, b) => (order.get(a.walletId) ?? 0) - (order.get(b.walletId) ?? 0))
  return { rows, truncated: wallets.length === LIMIT }
})
