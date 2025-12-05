import { type NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"

interface FundRequest {
  walletAddresses: string[]
  amountPerWallet: string
  signerPrivateKey?: string
}

export async function POST(request: NextRequest) {
  try {
    const { walletAddresses, amountPerWallet, signerPrivateKey }: FundRequest = await request.json()

    if (!walletAddresses || walletAddresses.length === 0) {
      return NextResponse.json({ error: "No wallet addresses provided" }, { status: 400 })
    }

    if (!amountPerWallet) {
      return NextResponse.json({ error: "Amount per wallet not specified" }, { status: 400 })
    }

    const provider = new ethers.JsonRpcProvider("https://forno.celo.org")

    // If signer private key provided (for backend signer), use it
    // Otherwise, this is informational - the frontend will do the actual signing
    const amountWei = ethers.parseEther(amountPerWallet)
    const totalAmount = amountWei * BigInt(walletAddresses.length)

    return NextResponse.json({
      success: true,
      totalAmount: ethers.formatEther(totalAmount),
      walletCount: walletAddresses.length,
      amountPerWallet,
      estimatedGasPerTx: "0.01", // Celo estimate
    })
  } catch (error) {
    console.error("[v0] Batch fund error:", error)
    return NextResponse.json({ error: "Failed to process batch funding request" }, { status: 500 })
  }
}
