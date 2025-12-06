import { ethers } from "ethers"
import type { MintWallet } from "./types"

export async function autoFundWallets(
  signerPrivateKey: string,
  wallets: MintWallet[],
  amountPerWallet: string,
  provider: ethers.BrowserProvider,
  onProgress: (progress: number) => void,
) {
  try {
    const signer = new ethers.Wallet(signerPrivateKey, provider)
    const signerAddress = signer.address
    const amountWei = ethers.parseEther(amountPerWallet)
    const totalAmount = amountWei * BigInt(wallets.length)

    const balance = await provider.getBalance(signerAddress)

    if (balance < totalAmount) {
      throw new Error(
        `Insufficient balance: have ${ethers.formatEther(balance)} CELO, need ${ethers.formatEther(totalAmount)} CELO`,
      )
    }

    const updatedWallets = [...wallets]

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i]

      try {
        updatedWallets[i].status = "funding"
        onProgress((i / wallets.length) * 100)

        const tx = await signer.sendTransaction({
          to: wallet.address,
          value: amountWei,
        })

        const receipt = await tx.wait()

        if (receipt?.status === 1) {
          updatedWallets[i].status = "funded"
          updatedWallets[i].fundingStatus = "funded"
        } else {
          updatedWallets[i].status = "not_funded"
          updatedWallets[i].fundingStatus = "funding_failed"
        }
      } catch (error) {
        updatedWallets[i].status = "not_funded"
        updatedWallets[i].fundingStatus = "error"
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    onProgress(100)
    return updatedWallets
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(errorMsg)
  }
}

export function validatePrivateKey(privateKey: string): boolean {
  try {
    if (!privateKey.startsWith("0x")) {
      return false
    }
    new ethers.Wallet(privateKey)
    return true
  } catch {
    return false
  }
}
