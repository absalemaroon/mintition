import { ethers } from "ethers"
import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { chainOrThrow, ERC20_ABI, getProvider } from "@/lib/server/evm"
import { listWallets } from "@/lib/server/vault"
import { isSolanaAddress } from "@/lib/server/solana/base58"
import { getBalance, getMintInfo, getTokenBalance } from "@/lib/server/solana/rpc"
import { getTokenQuotes } from "@/lib/server/market"
import { nativePrices } from "@/lib/server/prices"

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
  const solana = chain.family === "solana"
  if (token && (solana ? !isSolanaAddress(token) : !ethers.isAddress(token))) throw new ApiError(400, "Enter a valid token address")

  const wallets = (await listWallets(batchId)).slice(0, LIMIT)
  if (wallets[0] && wallets[0].family !== chain.family) throw new ApiError(400, `This batch holds ${wallets[0].family === "solana" ? "Solana" : "EVM"} wallets, not ${chain.name} wallets. Pick another batch.`)
  const provider = solana ? null : await getProvider(chainId)
  const tokenAddr = token ? (solana ? token : ethers.getAddress(token.toLowerCase())) : undefined
  const erc20 = !solana && tokenAddr ? new ethers.Contract(tokenAddr, ERC20_ABI, provider!) : null
  const decimals = solana ? (tokenAddr ? (await getMintInfo(tokenAddr)).decimals : 9) : erc20 ? Number(await erc20.getFunction("decimals")().catch(() => 18)) : 18
  const nativeDecimals = chain.nativeDecimals
  const [priceMap, tokenQuotes] = await Promise.all([nativePrices([chain]), tokenAddr ? getTokenQuotes(chain, [tokenAddr]) : Promise.resolve(new Map())])

  const rows: { walletId: string; address: string; native: string; token: string | null; error?: boolean }[] = []
  const queue = [...wallets]
  await Promise.all(
    Array.from({ length: solana ? 3 : 8 }, async () => {
      while (queue.length) {
        const w = queue.shift()!
        try {
          const [native, tokenBal] = await Promise.all([
            solana ? getBalance(w.address) : provider!.getBalance(w.address),
            solana ? (tokenAddr ? getTokenBalance(w.address, tokenAddr) : Promise.resolve(null)) : erc20 ? (erc20.getFunction("balanceOf")(w.address) as Promise<bigint>) : Promise.resolve(null),
          ])
          rows.push({ walletId: w.id, address: w.address, native: ethers.formatUnits(native, nativeDecimals), token: tokenBal === null ? null : ethers.formatUnits(tokenBal, decimals) })
        } catch {
          rows.push({ walletId: w.id, address: w.address, native: "0", token: null, error: true })
        }
      }
    }),
  )
  const order = new Map(wallets.map((w, i) => [w.id, i]))
  rows.sort((a, b) => (order.get(a.walletId) ?? 0) - (order.get(b.walletId) ?? 0))
  return { rows, truncated: wallets.length === LIMIT, nativePriceUsd: priceMap[chain.id] ?? null, tokenPriceUsd: tokenAddr ? (tokenQuotes.get(tokenAddr)?.priceUsd ?? null) : null }
})
