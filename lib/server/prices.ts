import type { ChainConfig } from "@/lib/chains"

/** USD prices of native coins from DefiLlama's free price API. Missing = null (the UI then shows no USD value). */
const cache = new Map<string, { at: number; price: number | null }>()

export async function nativePrices(chains: ChainConfig[]): Promise<Record<string, number | null>> {
  const ids = [...new Set(chains.map((c) => c.coingecko).filter((x): x is string => Boolean(x)))]
  const need = ids.filter((id) => !cache.has(id) || Date.now() - cache.get(id)!.at > 60_000)
  if (need.length) {
    try {
      const res = await fetch(`https://coins.llama.fi/prices/current/${need.map((id) => `coingecko:${encodeURIComponent(id)}`).join(",")}`, { signal: AbortSignal.timeout(8000), cache: "no-store" })
      const json = res.ok ? ((await res.json()) as { coins?: Record<string, { price?: number }> }) : { coins: {} }
      for (const id of need) cache.set(id, { at: Date.now(), price: json.coins?.[`coingecko:${id}`]?.price ?? null })
    } catch {
      for (const id of need) cache.set(id, { at: Date.now(), price: cache.get(id)?.price ?? null })
    }
  }
  const out: Record<string, number | null> = {}
  for (const c of chains) out[c.id] = c.coingecko ? (cache.get(c.coingecko)?.price ?? null) : null
  return out
}
