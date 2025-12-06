"use client"

import { useState, useCallback } from "react"
import { ethers } from "ethers"
import { MINET_ABI, CELO_RPC_URL } from "@/lib/contract-config"

export interface MintResult {
  transactionHash: string
  blockNumber: number
  tokenId: string
}

export function useWeb3Contract() {
  const [isMinting, setIsMinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mintCredential = useCallback(
    async (
      signer: ethers.Signer,
      toAddress: string,
      ipfsUri: string,
      contractAddress?: string,
    ): Promise<MintResult | null> => {
      if (!signer) {
        setError("No signer provided")
        return null
      }

      if (!contractAddress) {
        setError("No contract address provided")
        return null
      }

      setIsMinting(true)
      setError(null)

      try {
        const contract = new ethers.Contract(contractAddress, MINET_ABI, signer)

        console.log("Calling contract.mint() with ABI encoding...")
        console.log("Contract Address:", contractAddress)
        console.log("To:", toAddress)
        console.log("TokenURI:", ipfsUri.substring(0, 50) + "...")

        const tx = await contract.mint(toAddress, ipfsUri)

        console.log("Transaction sent:", tx.hash)

        const receipt = await tx.wait(1)

        if (!receipt) {
          throw new Error("Transaction failed - no receipt")
        }

        console.log("Transaction confirmed at block:", receipt.blockNumber)

        const events = receipt.logs
          .map((log: any) => {
            try {
              return contract.interface.parseLog(log)
            } catch {
              return null
            }
          })
          .filter((e: any) => e && e.name === "CredentialMinted")

        const tokenId = events[0]?.args[1]?.toString() || "unknown"

        console.log("Token ID minted:", tokenId)

        const result: MintResult = {
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          tokenId,
        }

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to mint credential"
        console.error("Mint error:", message)
        setError(message)
        return null
      } finally {
        setIsMinting(false)
      }
    },
    [],
  )

  const getBalance = useCallback(async (walletAddress: string, contractAddress?: string) => {
    if (!contractAddress) {
      console.error("No contract address provided for balance check")
      return 0
    }

    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC_URL)
      const contract = new ethers.Contract(contractAddress, MINET_ABI, provider)

      const balance = await contract.balanceOf(walletAddress)
      return Number(balance)
    } catch (err) {
      console.error("Error getting balance:", err)
      return 0
    }
  }, [])

  return {
    mintCredential,
    getBalance,
    isMinting,
    error,
  }
}
