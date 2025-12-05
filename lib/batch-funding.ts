import { ethers } from "ethers"
import type { MintWallet } from "./types"

export async function createBatchFundingTx(signer: ethers.Signer, wallets: MintWallet[], amountPerWallet: string) {
  const amountWei = ethers.parseEther(amountPerWallet)
  const provider = signer.provider

  if (!provider) throw new Error("No provider available")

  const txs = wallets.map((wallet) => ({
    to: wallet.address,
    value: amountWei,
    data: "0x",
  }))

  const totalAmount = amountWei * BigInt(wallets.length)
  const signerAddress = await signer.getAddress()
  const balance = await provider.getBalance(signerAddress)

  if (balance < totalAmount) {
    throw new Error(
      `Insufficient balance: have ${ethers.formatEther(balance)} CELO, need ${ethers.formatEther(totalAmount)} CELO`,
    )
  }

  return {
    totalAmount,
    amountPerWallet: amountWei,
    walletCount: wallets.length,
    transactions: txs,
  }
}

export async function executeBatchFunding(
  signer: ethers.Signer,
  wallets: MintWallet[],
  amountPerWallet: string,
  onProgress: (progress: { current: number; total: number; txHash: string }) => void,
) {
  const amountWei = ethers.parseEther(amountPerWallet)
  const results: Array<{ wallet: string; txHash: string; success: boolean }> = []

  for (let i = 0; i < wallets.length; i++) {
    try {
      const tx = await signer.sendTransaction({
        to: wallets[i].address,
        value: amountWei,
      })

      results.push({
        wallet: wallets[i].address,
        txHash: tx.hash,
        success: true,
      })

      onProgress({
        current: i + 1,
        total: wallets.length,
        txHash: tx.hash,
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      results.push({
        wallet: wallets[i].address,
        txHash: "",
        success: false,
      })
      console.error(`Failed to fund wallet ${i + 1}:`, error)
    }
  }

  return results
}
