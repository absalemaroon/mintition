import { ethers } from "ethers"
import { getChain, type ChainConfig } from "@/lib/chains"

/** RPC endpoint for a chain: the RPC_URL_<chainId> env var wins, then the built-in public one. */
export function rpcUrlFor(chain: ChainConfig): string | undefined {
  return process.env[`RPC_URL_${chain.chainId}`] || chain.rpcUrl
}

export function chainOrThrow(chainId: number): ChainConfig {
  const chain = getChain(String(chainId))
  if (chain.chainId !== chainId) throw new Error(`Unknown chain ${chainId}`)
  return chain
}

const verified = new Map<number, Promise<ethers.JsonRpcProvider>>()

/**
 * A provider that has proven it is really talking to the expected chain. The first use asks the node for its
 * chain id and refuses a mismatch, so a wrong or hijacked RPC URL can never make the app act on another network.
 */
export function getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
  const cached = verified.get(chainId)
  if (cached) return cached
  const chain = chainOrThrow(chainId)
  const url = rpcUrlFor(chain)
  if (!url) return Promise.reject(new Error(`${chain.name} has no RPC endpoint configured`))

  const created = (async () => {
    const network = ethers.Network.from(chainId)
    const provider = new ethers.JsonRpcProvider(url, network, { staticNetwork: network, batchMaxCount: 1 })
    const reported = await Promise.race([
      provider.send("eth_chainId", []),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${chain.name} RPC did not answer in time`)), 8000)),
    ])
    if (Number(BigInt(reported)) !== chainId) throw new Error(`${chain.name} RPC reports chain ${Number(BigInt(reported))}, expected ${chainId}`)
    return provider
  })()
  verified.set(chainId, created)
  // Do not cache failures: the next call should try again.
  created.catch(() => verified.delete(chainId))
  return created
}

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
]

export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

/** Health check used by Settings > Network check. */
export async function checkChain(chainId: number): Promise<{ ok: boolean; ms: number; block?: number; error?: string }> {
  const started = Date.now()
  try {
    if (chainOrThrow(chainId).family === "solana") {
      const { getBlockHeight } = await import("@/lib/server/solana/rpc")
      return { ok: true, ms: Date.now() - started, block: await getBlockHeight() }
    }
    const provider = await getProvider(chainId)
    const block = await Promise.race([
      provider.getBlockNumber(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
    ])
    return { ok: true, ms: Date.now() - started, block }
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: (error instanceof Error ? error.message : "failed").slice(0, 120) }
  }
}
