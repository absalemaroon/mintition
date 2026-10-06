"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AlertCircle, Lock, Send } from "lucide-react"
import { autoFundWallets, validatePrivateKey } from "@/lib/auto-funding"
import type { MintWallet } from "@/lib/types"

interface AutoFundingSectionProps {
  wallets: MintWallet[]
  onWalletsUpdate: (wallets: MintWallet[]) => void
}

export function AutoFundingSection({ wallets, onWalletsUpdate }: AutoFundingSectionProps) {
  const [privateKey, setPrivateKey] = useState("")
  const [amount, setAmount] = useState("0.1")
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [showPrivateKey, setShowPrivateKey] = useState(false)

  const handleAutoFund = async () => {
    if (!privateKey.trim()) {
      toast.error("Private key required", {
        description: "Enter your wallet private key to fund wallets",
      })
      return
    }

    if (!validatePrivateKey(privateKey)) {
      toast.error("Invalid private key", {
        description: "Private key must start with 0x and be a valid Ethereum/Celo private key",
      })
      return
    }

    if (wallets.length === 0) {
      toast.error("No wallets to fund", {
        description: "Generate wallets first",
      })
      return
    }

    setIsLoading(true)
    const fundingToastId = toast.loading("Auto-funding started...", {
      description: `Funding ${wallets.length} wallets with ${amount} CELO each`,
    })

    try {
      const updatingWallets = wallets.map((w) => ({
        ...w,
        fundingStatus: "funding" as const,
      }))
      onWalletsUpdate(updatingWallets)

      const results = await autoFundWallets(privateKey, wallets, amount, (progressData) => {
        setProgress({ current: progressData.current, total: progressData.total })
      })

      const fundedWallets = wallets.map((wallet) => {
        const result = results.find((r) => r.wallet.address === wallet.address)
        return {
          ...wallet,
          fundingStatus: result?.success ? "funded" : "not_funded",
          transactionHash: result?.txHash,
          balance: result?.success ? amount : wallet.balance,
        }
      })

      onWalletsUpdate(fundedWallets)

      const successCount = results.filter((r) => r.success).length
      toast.dismiss(fundingToastId)
      toast.success("Auto-funding complete!", {
        description: `Successfully funded ${successCount}/${wallets.length} wallets`,
      })

      setPrivateKey("")
    } catch (error) {
      toast.dismiss(fundingToastId)
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      toast.error("Auto-funding failed", {
        description: errorMsg,
      })
      console.error("Auto-funding error:", error)

      const revertedWallets = wallets.map((w) => ({
        ...w,
        fundingStatus: "not_funded" as const,
      }))
      onWalletsUpdate(revertedWallets)
    } finally {
      setIsLoading(false)
      setProgress(null)
    }
  }

  return (
    <Card className="paper-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-accent" />
          Automated Wallet Funding
        </CardTitle>
        <CardDescription>Use your private key to automatically fund all wallets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-accent/30 bg-accent/5">
          <AlertCircle className="h-4 w-4 text-accent" />
          <AlertDescription className="text-foreground/70">
            Your private key is never stored or sent to any server. It&apos;s used only locally to sign transactions.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="private-key">Your Wallet Private Key</Label>
          <div className="relative">
            <Input
              id="private-key"
              type={showPrivateKey ? "text" : "password"}
              placeholder="0x..."
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              disabled={isLoading}
              className="pr-16 font-mono"
            />
            <button
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              disabled={isLoading}
            >
              {showPrivateKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount per Wallet (CELO)</Label>
          <Input
            id="amount"
            type="number"
            placeholder="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading}
            step="0.01"
            min="0.01"
          />
        </div>

        {progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Funding Progress</span>
              <span className="text-muted-foreground">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-accent h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <Button
          onClick={handleAutoFund}
          disabled={isLoading || !privateKey.trim() || wallets.length === 0}
          className="w-full ink-btn-terracotta"
        >
          <Send className="w-4 h-4 mr-2" />
          {isLoading ? "Funding in Progress..." : `Auto-Fund ${wallets.length} Wallets`}
        </Button>
      </CardContent>
    </Card>
  )
}
