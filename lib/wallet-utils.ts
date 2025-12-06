import { ethers } from "ethers"
import type { Wallet } from "./types"

export function generateRandomDelay(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function generateWallets(count: number): Wallet[] {
  const wallets: Wallet[] = []

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom()
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      funded: false,
      mintsCompleted: 0,
      balance: "0",
      status: "idle",
    })
  }

  return wallets
}
