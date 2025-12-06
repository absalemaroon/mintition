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

        const tx = await contract.mint(toAddress, ipfsUri)

        const receipt = await tx.wait(1)

        if (!receipt) {
          throw new Error("Transaction failed - no receipt")
        }

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

        const result: MintResult = {
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          tokenId,
        }

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to mint credential"
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
      return 0
    }

    try {
      const provider = new ethers.JsonRpcProvider(CELO_RPC_URL)
      const contract = new ethers.Contract(contractAddress, MINET_ABI, provider)

      const balance = await contract.balanceOf(walletAddress)
      return Number(balance)
    } catch (err) {
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

export async function mintCredential(
  signer: ethers.Signer,
  toAddress: string,
  ipfsUri: string,
  contractAddress: string,
): Promise<MintResult | null> {
  try {
    const contract = new ethers.Contract(contractAddress, MINET_ABI, signer)
    const tx = await contract.mint(toAddress, ipfsUri)
    const receipt = await tx.wait(1)

    if (!receipt) {
      throw new Error("Transaction failed - no receipt")
    }

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

    return {
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      tokenId,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mint credential"
    throw new Error(message)
  }
}
