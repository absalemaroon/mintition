/**
 * Chain registry (presentation layer only).
 *
 * The UI reads the network name, native token symbol and block-explorer links
 * from here instead of hardcoding "Celo" / "CELO" in components.
 *
 * Only chains with status "live" can be selected. Today the minting / funding
 * logic (lib/contract-config.ts, lib/auto-funding.ts, lib/use-web3-contract.ts,
 * app/api/batch-fund) talks to Celo only, so Celo is the only live chain.
 * To add a chain: add an entry here, set status to "live", then wire its RPC URL
 * and contract address into the logic layer. See MULTICHAIN.md.
 */

export type ChainStatus = "live" | "soon"

export interface ChainConfig {
  /** Decimal chain id as a string. Matches the existing `networkId` state in the dashboard. */
  id: string
  chainId: number
  name: string
  nativeSymbol: string
  /** Base URL of the block explorer, no trailing slash. */
  explorerUrl: string
  status: ChainStatus
  /** Brand colour for the small dot in the selector. */
  color: string
}

export const CHAINS: ChainConfig[] = [
  {
    id: "42220",
    chainId: 42220,
    name: "Celo",
    nativeSymbol: "CELO",
    explorerUrl: "https://celoscan.io",
    status: "live",
    color: "#FCFF52",
  },
  {
    id: "8453",
    chainId: 8453,
    name: "Base",
    nativeSymbol: "ETH",
    explorerUrl: "https://basescan.org",
    status: "soon",
    color: "#0052FF",
  },
  {
    id: "137",
    chainId: 137,
    name: "Polygon",
    nativeSymbol: "POL",
    explorerUrl: "https://polygonscan.com",
    status: "soon",
    color: "#8247E5",
  },
  {
    id: "42161",
    chainId: 42161,
    name: "Arbitrum One",
    nativeSymbol: "ETH",
    explorerUrl: "https://arbiscan.io",
    status: "soon",
    color: "#28A0F0",
  },
  {
    id: "10",
    chainId: 10,
    name: "Optimism",
    nativeSymbol: "ETH",
    explorerUrl: "https://optimistic.etherscan.io",
    status: "soon",
    color: "#FF0420",
  },
]

export const DEFAULT_CHAIN_ID = "42220"

export function getChain(id: string): ChainConfig {
  return CHAINS.find((chain) => chain.id === id) ?? CHAINS[0]
}

export function explorerTxUrl(chain: ChainConfig, hash: string): string | null {
  return /^0x[0-9a-fA-F]{64}$/.test(hash) ? `${chain.explorerUrl}/tx/${hash}` : null
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string {
  return `${chain.explorerUrl}/address/${address}`
}

export function shortAddress(value: string, head = 6, tail = 4): string {
  if (!value) return ""
  return value.length <= head + tail + 3 ? value : `${value.slice(0, head)}...${value.slice(-tail)}`
}
