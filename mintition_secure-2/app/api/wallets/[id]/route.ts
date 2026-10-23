import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { getChain } from "@/lib/chains"
import { walletPortfolio } from "@/lib/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export const GET = async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(async (r) => {
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) throw new ApiError(400, "Bad wallet id")
    const url = new URL(r.url)
    const chain = getChain(url.searchParams.get("chainId") || "")
    if (chain.status !== "live") throw new ApiError(400, "Choose an available network")
    try {
      return await walletPortfolio(chain, id, url.searchParams.get("token") || undefined)
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(502, e instanceof Error ? e.message.slice(0, 160) : "Could not read this wallet")
    }
  })(req)
