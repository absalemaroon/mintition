import { route } from "@/lib/security/guard"
import { CHAINS } from "@/lib/chains"
import { nativePrices } from "@/lib/server/prices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** USD price of every network's native coin (null where unknown). */
export const GET = route(async () => ({ prices: await nativePrices(CHAINS.filter((c) => c.status === "live")) }))
