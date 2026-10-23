import { route } from "@/lib/security/guard"
import { CHAINS } from "@/lib/chains"
import { checkChain } from "@/lib/server/evm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Pings the RPC of every live chain and confirms it reports the right chain id. */
export const GET = route(async () => {
  const live = CHAINS.filter((c) => c.status === "live")
  const results: Record<string, { ok: boolean; ms: number; block?: number; error?: string }> = {}
  const queue = [...live]
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (queue.length) {
        const chain = queue.shift()!
        results[chain.id] = await checkChain(chain.chainId)
      }
    }),
  )
  return { results }
})
