import { ethers } from "ethers"
import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { chainOrThrow, ERC20_ABI, getProvider, NATIVE_TOKEN_ADDRESS } from "@/lib/server/evm"
import { getSwapQuote } from "@/lib/server/swap"
import { getWalletAddresses } from "@/lib/server/vault"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const schema = z.object({
  chainId: z.number().int().positive(),
  side: z.enum(["buy", "sell"]),
  token: z.string().max(64),
  /** Buy: amount of the native coin per wallet, as typed (for example "0.05"). */
  amount: z.string().max(40).optional(),
  /** Sell: percent of the wallet's token balance. */
  percent: z.number().min(1).max(100).optional(),
  slippage: z.number().min(0.1).max(30).default(3),
  /** A wallet from the batch, used as the sender in the quote. Nothing is ever sent. */
  walletId: z.string().uuid(),
})

/** Dry run: asks for a route and returns what the trade would do. Sends no transaction and spends nothing. */
export const POST = route(async (req) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Check the form")
  const b = body.data
  const chain = chainOrThrow(b.chainId)
  if (chain.status !== "live") throw new ApiError(400, "That network is not available yet")
  if (!ethers.isAddress(b.token)) throw new ApiError(400, "Enter a valid token address")
  const token = ethers.getAddress(b.token.toLowerCase())

  const address = (await getWalletAddresses([b.walletId])).get(b.walletId)
  if (!address) throw new ApiError(404, "Wallet not found")

  try {
    const provider = await getProvider(b.chainId)
    const erc20 = new ethers.Contract(token, ERC20_ABI, provider)
    const [decimals, symbol] = await Promise.all([erc20.getFunction("decimals")().catch(() => 18), erc20.getFunction("symbol")().catch(() => "TOKEN")])
    const dec = Number(decimals)
    const fee = await provider.getFeeData()

    let amountIn: bigint
    let inToken: string
    let outToken: string
    if (b.side === "buy") {
      if (!b.amount) throw new ApiError(400, "Enter an amount")
      amountIn = ethers.parseUnits(b.amount, 18)
      inToken = NATIVE_TOKEN_ADDRESS
      outToken = token
    } else {
      const balance: bigint = await erc20.getFunction("balanceOf")(address)
      amountIn = (balance * BigInt(Math.round(b.percent ?? 100))) / 100n
      if (amountIn <= 0n) throw new ApiError(400, "That wallet holds none of this token. Pick a wallet that does.")
      inToken = token
      outToken = NATIVE_TOKEN_ADDRESS
    }

    const quote = await getSwapQuote({ chainId: b.chainId, inToken, outToken, amountIn, slippagePct: b.slippage, account: address, gasPriceWei: fee.gasPrice ?? undefined }, NATIVE_TOKEN_ADDRESS)
    const outDecimals = b.side === "buy" ? dec : 18
    return {
      side: b.side,
      router: quote.to,
      symbol,
      amountIn: ethers.formatUnits(amountIn, b.side === "buy" ? 18 : dec),
      expectedOut: ethers.formatUnits(quote.outAmount, outDecimals),
      minOut: ethers.formatUnits(quote.minOut, outDecimals),
      priceImpactPct: quote.priceImpactPct,
      outSymbol: b.side === "buy" ? symbol : chain.nativeSymbol,
      inSymbol: b.side === "buy" ? chain.nativeSymbol : symbol,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, error instanceof Error ? error.message.slice(0, 200) : "Could not get a quote")
  }
})
