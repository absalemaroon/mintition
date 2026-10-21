export type FundingStatus = "not_funded" | "funding" | "funded" | "funding_failed"

/** A wallet as the browser sees it. The private key never leaves the server vault. */
export interface MintWallet {
  id: string
  batchId?: string | null
  address: string
  funded: boolean
  fundingStatus: FundingStatus
  mintsCompleted: number
  balance?: string
  status?: string
  nextMintTime?: number
  transactionHash?: string
}

export interface Transaction {
  id?: string
  hash: string
  timestamp: number
  status: "pending" | "success" | "failed"
  wallet: string
  chainId?: number
  kind?: JobKind
  detail?: string
  tokenId?: string
  error?: string
  jobId?: string | null
}

export interface BatchInfo {
  id: string
  name: string
  description: string
  walletCount: number
  totalMints: number
  createdAt: string
}

export type JobKind = "mint" | "buy" | "sell" | "transfer"

export interface JobView {
  id: string
  kind: JobKind
  detail: string
  name: string
  chainId: number
  contract: string
  status: "scheduled" | "running" | "completed" | "cancelled" | "failed"
  runAt: string
  concurrency: number
  mintsPerWallet: number
  total: number
  success: number
  failed: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface Branding {
  name: string
  hasLogo: boolean
  logoVersion: number
}

/** Old browser-storage shape, only used to move legacy wallets into the vault once. */
export interface LegacyWallet {
  address: string
  privateKey: string
}

export interface NFTMetadata {
  name: string
  description: string
  image: string
  attributes?: Array<{
    trait_type: string
    value: string
  }>
}

export interface PairView {
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

export interface TokenInfoView {
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
  market: PairView | null
  pairs: PairView[]
  elsewhere: string[]
  warnings: string[]
}

export interface BalanceRow {
  walletId: string
  address: string
  native: string
  token: string | null
  error?: boolean
}

export interface QuotePreview {
  side: "buy" | "sell"
  router: string
  symbol: string
  amountIn: string
  expectedOut: string
  minOut: string
  priceImpactPct: number | null
  inSymbol: string
  outSymbol: string
}
