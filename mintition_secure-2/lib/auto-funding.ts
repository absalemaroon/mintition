import { ethers } from "ethers"
import type { MintWallet } from "./types"
import { CELO_RPC_URL } from "./contract-config"

export async function autoFundWallets(
  signerPrivateKey: string,
  wallets: MintWallet[],
  amountPerWallet: string,
  onProgress: (progress: { current: number; total: number; wallet: string; status: string }) => void,
) {
  try {
    console.log("[v0] Auto-funding starting with private key")

    // Create provider and signer from private key
    const provider = new ethers.JsonRpcProvider(CELO_RPC_URL)
    const signer = new ethers.Wallet(signerPrivateKey, provider)

    const signerAddress = signer.address
    const amountWei = ethers.parseEther(amountPerWallet)
    const totalAmount = amountWei * BigInt(wallets.length)

    // Check signer balance
    const balance = await provider.getBalance(signerAddress)
    console.log("[v0] Signer balance:", ethers.formatEther(balance), "CELO")
    console.log("[v0] Total needed:", ethers.formatEther(totalAmount), "CELO")

    if (balance < totalAmount) {
      throw new Error(
        `Insufficient balance: have ${ethers.formatEther(balance)} CELO, need ${ethers.formatEther(totalAmount)} CELO`,
      )
    }

    const results: Array<{
      wallet: MintWallet
      success: boolean
      txHash?: string
      error?: string
    }> = []

    // Fund each wallet
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i]

      try {
        onProgress({
          current: i,
          total: wallets.length,
          wallet: wallet.address,
          status: "funding",
        })

        console.log(`[v0] Funding wallet ${i + 1}/${wallets.length}: ${wallet.address}`)

        // Send transaction
        const tx = await signer.sendTransaction({
          to: wallet.address,
          value: amountWei,
        })

        console.log(`[v0] Transaction sent: ${tx.hash}`)

        // Wait for receipt
        const receipt = await tx.wait()

        if (receipt?.status === 1) {
          console.log(`[v0] Wallet ${i + 1} funded successfully`)
          results.push({
            wallet,
            success: true,
            txHash: tx.hash,
          })
        } else {
          console.log(`[v0] Transaction failed for wallet ${i + 1}`)
          results.push({
            wallet,
            success: false,
            error: "Transaction reverted",
          })
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        console.error(`[v0] Error funding wallet ${i + 1}:`, errorMsg)
        results.push({
          wallet,
          success: false,
          error: errorMsg,
        })
      }

      // Small delay between transactions
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    onProgress({
      current: wallets.length,
      total: wallets.length,
      wallet: "",
      status: "completed",
    })

    return results
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Auto-funding error:", errorMsg)
    throw error
  }
}

export function validatePrivateKey(privateKey: string): boolean {
  try {
    // Check if it's a valid private key format
    if (!privateKey.startsWith("0x")) {
      return false
    }
    // Try to create a wallet from it
    new ethers.Wallet(privateKey)
    return true
  } catch {
    return false
  }
}
