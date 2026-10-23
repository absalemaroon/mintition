"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Send } from "lucide-react"
import { autoFundWallets, validatePrivateKey } from "@/lib/auto-funding"
import type { MintWallet } from "@/lib/types"
import { SummaryCard, SummaryRow } from "@/components/app/summary-card"
import { StatusBadge } from "@/components/app/status-badge"

interface AutoFundingSectionProps {
  wallets: MintWallet[]
  onWalletsUpdate: (wallets: MintWallet[]) => void
  /** Native token symbol of the active chain, e.g. "CELO". */
  nativeSymbol?: string
  /** Display name of the active chain, e.g. "Celo". */
  chainName?: string
}

export function AutoFundingSection({ wallets, onWalletsUpdate, nativeSymbol = "CELO", chainName = "Celo" }: AutoFundingSectionProps) {
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
        description: "Private key must start with 0x and be a valid Ethereum-compatible private key",
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
      description: `Funding ${wallets.length} wallets with ${amount} ${nativeSymbol} each`,
    })

    try {
      // Mark wallets as funding
      const updatingWallets = wallets.map((w) => ({
        ...w,
        fundingStatus: "funding" as const,
      }))
      onWalletsUpdate(updatingWallets)

      const results = await autoFundWallets(privateKey, wallets, amount, (progressData) => {
        setProgress({ current: progressData.current, total: progressData.total })
      })

      // Update wallet funding status based on results
      const fundedWallets = wallets.map((wallet) => {
        const result = results.find((r) => r.wallet.address === wallet.address)
        return {
          ...wallet,
          fundingStatus: result?.success ? ("funded" as const) : ("not_funded" as const),
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

      // Clear private key after successful funding
      setPrivateKey("")
    } catch (error) {
      toast.dismiss(fundingToastId)
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      toast.error("Auto-funding failed", {
        description: errorMsg,
      })
      console.error("Auto-funding error:", error)

      // Mark wallets back to not funded
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

  // Display-only maths for the summary card. Nothing here is sent anywhere.
  const amountNumber = Number(amount)
  const totalRequired =
    amount.trim() !== "" && Number.isFinite(amountNumber) && amountNumber >= 0
      ? (amountNumber * wallets.length).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : null

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      {/* Left: the form */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5" aria-hidden="true" />
            Automated Wallet Funding
          </CardTitle>
          <CardDescription>Use your private key to automatically fund all wallets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
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
                className="pr-11 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                disabled={isLoading}
                aria-label={showPrivateKey ? "Hide private key" : "Show private key"}
                aria-pressed={showPrivateKey}
                className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-card hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none disabled:opacity-50"
              >
                {showPrivateKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount per Wallet ({nativeSymbol})</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                placeholder="0.1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                step="0.01"
                min="0.01"
                className="pr-16"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {nativeSymbol}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right: live summary, styled like an invoice preview */}
      <SummaryCard
        className="lg:sticky lg:top-6 lg:col-span-2"
        title="Funding summary"
        description="What will be sent when you start."
        badge={<StatusBadge tone="neutral">{chainName}</StatusBadge>}
        footer={
          <>
            {progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Funding Progress</span>
                  <span className="text-muted-foreground tabular-nums">
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div
                  className="h-2 w-full rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.current}
                >
                  <div
                    className="h-2 rounded-full bg-foreground transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <Button
              onClick={handleAutoFund}
              disabled={isLoading || !privateKey.trim() || wallets.length === 0}
              size="lg"
              className="w-full disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            >
              {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              {isLoading ? "Funding in Progress..." : `Auto-Fund ${wallets.length} Wallets`}
            </Button>
          </>
        }
      >
        <SummaryRow label="Network" value={chainName} />
        <SummaryRow label="Wallets to fund" value={wallets.length} />
        <SummaryRow label="Amount per wallet" value={`${amount || "0"} ${nativeSymbol}`} />
        <SummaryRow label="Total required" value={totalRequired ? `${totalRequired} ${nativeSymbol}` : "-"} strong />
        <SummaryRow
          label="Status"
          value={
            isLoading ? (
              <StatusBadge tone="warning">Funding</StatusBadge>
            ) : privateKey.trim() ? (
              <StatusBadge tone="success">Ready</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Waiting for private key</StatusBadge>
            )
          }
        />
      </SummaryCard>
    </div>
  )
}
