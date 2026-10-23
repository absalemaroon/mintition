import { route, ApiError } from "@/lib/security/guard"
import { getChain } from "@/lib/chains"
import { chainNameForSlug, getTokenInfo } from "@/lib/server/market"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export const GET = route(async (req) => {
  const url = new URL(req.url)
  const chainId = Number(url.searchParams.get("chainId"))
  const address = (url.searchParams.get("address") || "").trim()
  const chain = getChain(String(chainId))
  if (!Number.isInteger(chainId) || chain.chainId !== chainId || chain.status !== "live") throw new ApiError(400, "Choose an available network")
  try {
    const info = await getTokenInfo(chain, address)
    return { ...info, elsewhere: info.elsewhere.map(chainNameForSlug) }
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message.slice(0, 160) : "Could not read this token")
  }
})
