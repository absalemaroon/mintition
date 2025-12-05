export interface Wallet {
  address: string
  privateKey: string
  funded: boolean
  mintsCompleted: number
  balance?: string
  status?: string
  nextMintTime?: number
}

export interface Transaction {
  hash: string
  timestamp: number
  status: "pending" | "success" | "failed"
  wallet: string
}

export interface MintWallet {
  address: string
  privateKey: string
  funded: boolean
  mintsCompleted: number
  balance?: string
  status?: "idle" | "funding" | "scheduled" | "minting" | "completed" | "failed"
  nextMintTime?: number
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
