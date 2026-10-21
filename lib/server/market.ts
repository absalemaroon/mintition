import { ethers } from "ethers"
import { ERC20_ABI, getProvider } from "@/lib/server/evm"
import type { ChainConfig } from "@/lib/chains"
import { CHAINS } from "@/lib/chains"

/** Token information for the Trade page: on-chain facts plus market data from DexScreener (free, no key). */

export interface PairInfo {
  dex: string
  pairAddress: string
  url: string
  quoteSymbol: string
  priceUsd: number | null
  priceNative: number | null
  liquidityUsd: number | null
  volume24h: number | null
  volume1h: number | null
  change24h: number | null
  change1h: number | null
  buys24h: number | null
  sells24h: number | null
  fdv: number | null
  marketCap: number | null
  createdAt: number | null
}

export interface TokenInfo {
  address: string
  chainId: number
  isContract: boolean
  name: string | null
  symbol: string | null
  decimals: number | null
  totalSupply: string | null
  image: string | null
  websites: { label: string; url: string }[]
  socials: { type: string; url: string }[]
  /** Best pair on the selected chain (highest liquidity). */
  market: PairInfo | null
  pairs: PairInfo[]
  /** Chains where this same address has trading pairs, when none were found on the selected chain. */
  elsewhere: string[]
  warnings: string[]
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null)

export function parsePair(p: any): PairInfo {
  return {
    dex: String(p?.dexId ?? ""),
    pairAddress: String(p?.pairAddress ?? ""),
    url: typeof p?.url === "string" && p.url.startsWith("https://dexscreener.com/") ? p.url : "",
    quoteSymbol: String(p?.quoteToken?.symbol ?? ""),
    priceUsd: num(p?.priceUsd),
    priceNative: num(p?.priceNative),
    liquidityUsd: num(p?.liquidity?.usd),
    volume24h: num(p?.volume?.h24),
    volume1h: num(p?.volume?.h1),
    change24h: num(p?.priceChange?.h24),
    change1h: num(p?.priceChange?.h1),
    buys24h: num(p?.txns?.h24?.buys),
    sells24h: num(p?.txns?.h24?.sells),
    fdv: num(p?.fdv),
    marketCap: num(p?.marketCap),
    createdAt: num(p?.pairCreatedAt),
  }
}

const cache = new Map<string, { at: number; value: any }>()

async function fetchPairs(address: string): Promise<any[]> {
  const key = address.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15_000) return hit.value
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Market data service answered ${res.status}`)
  const data = (await res.json()) as { pairs?: any[] | null }
  const pairs = Array.isArray(data.pairs) ? data.pairs : []
  cache.set(key, { at: Date.now(), value: pairs })
  return pairs
}

async function onChain(chain: ChainConfig, address: string) {
  const provider = await getProvider(chain.chainId)
  const code = await provider.getCode(address)
  if (code === "0x") return { isContract: false, name: null, symbol: null, decimals: null, totalSupply: null }
  const token = new ethers.Contract(address, ERC20_ABI, provider)
  const read = async <T,>(fn: string): Promise<T | null> => {
    try {
      return (await token.getFunction(fn)()) as T
    } catch {
      return null
    }
  }
  const [name, symbol, decimals, supply] = await Promise.all([read<string>("name"), read<string>("symbol"), read<bigint>("decimals"), read<bigint>("totalSupply")])
  const dec = decimals === null ? null : Number(decimals)
  return {
    isContract: true,
    name,
    symbol,
    decimals: dec,
    totalSupply: supply !== null && dec !== null ? ethers.formatUnits(supply, dec) : null,
  }
}

export async function getTokenInfo(chain: ChainConfig, rawAddress: string): Promise<TokenInfo> {
  if (!ethers.isAddress(rawAddress)) throw new Error("That is not a valid token address")
  const address = ethers.getAddress(rawAddress.toLowerCase())

  const [chainFacts, allPairs] = await Promise.all([
    onChain(chain, address),
    fetchPairs(address).catch((): any[] => []),
  ])

  const slug = chain.dexscreener
  const lower = address.toLowerCase()
  const involving = allPairs.filter((p) => p?.baseToken?.address?.toLowerCase() === lower || p?.quoteToken?.address?.toLowerCase() === lower)
  const onSelected = slug ? involving.filter((p) => p.chainId === slug) : involving
  const sorted = [...onSelected].sort((a, b) => (num(b?.liquidity?.usd) ?? 0) - (num(a?.liquidity?.usd) ?? 0))
  const pairs = sorted.slice(0, 8).map(parsePair)
  const best = sorted[0]

  const elsewhere = slug && onSelected.length === 0 ? [...new Set(involving.map((p) => String(p.chainId)))].slice(0, 8) : []
  const tokenSide = best ? (best.baseToken?.address?.toLowerCase() === lower ? best.baseToken : best.quoteToken) : null
  const info = best?.info ?? {}

  const warnings: string[] = []
  if (!chainFacts.isContract) warnings.push(`There is no contract at this address on ${chain.name}.`)
  if (chainFacts.isContract && pairs.length === 0) warnings.push("No trading pairs found. It may not be tradable yet, or the market data service does not list this chain.")
  const liq = pairs[0]?.liquidityUsd
  if (liq != null && liq < 5000) warnings.push("Very low liquidity. Even small trades can move the price a lot, and exiting may be hard.")
  if (pairs[0]?.createdAt && Date.now() - pairs[0].createdAt < 24 * 3600 * 1000) warnings.push("This pool is less than a day old.")

  return {
    address,
    chainId: chain.chainId,
    isContract: chainFacts.isContract,
    name: chainFacts.name ?? tokenSide?.name ?? null,
    symbol: chainFacts.symbol ?? tokenSide?.symbol ?? null,
    decimals: chainFacts.decimals,
    totalSupply: chainFacts.totalSupply,
    image: typeof info.imageUrl === "string" && info.imageUrl.startsWith("https://") ? info.imageUrl : null,
    websites: Array.isArray(info.websites) ? info.websites.filter((w: any) => typeof w?.url === "string" && w.url.startsWith("https://")).slice(0, 3).map((w: any) => ({ label: String(w.label ?? "Website"), url: w.url })) : [],
    socials: Array.isArray(info.socials) ? info.socials.filter((s: any) => typeof s?.url === "string" && s.url.startsWith("https://")).slice(0, 4).map((s: any) => ({ type: String(s.type ?? "link"), url: s.url })) : [],
    market: pairs[0] ?? null,
    pairs,
    elsewhere,
    warnings,
  }
}

/** Human names for DexScreener slugs, used for the "found on other chains" hint. */
export function chainNameForSlug(slug: string): string {
  return CHAINS.find((c) => c.dexscreener === slug)?.name ?? slug
}
