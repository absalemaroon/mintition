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

export interface JobView {
  id: string
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
