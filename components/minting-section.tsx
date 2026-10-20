"use client"

import { AlertCircle, Loader2, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChecklistItem, SummaryCard, SummaryRow } from "@/components/app/summary-card"
import { StatusBadge } from "@/components/app/status-badge"
import { TransactionHistory } from "@/components/transaction-history"
import { shortAddress, type ChainConfig } from "@/lib/chains"
import type { Transaction } from "@/lib/types"

interface MintingSectionProps {
  chain: ChainConfig
  contractAddress: string
  onContractAddressChange: (address: string) => void
  walletCount: number
  fundedCount: number
  walletConnected: boolean
  isMinting: boolean
  onMint: () => void
  onStop: () => void
  transactions: Transaction[]
}

/** Presentation for the Minting page. All behaviour comes in through props from the dashboard. */
export function MintingSection({
  chain,
  contractAddress,
  onContractAddressChange,
  walletCount,
  fundedCount,
  walletConnected,
  isMinting,
  onMint,
  onStop,
  transactions,
}: MintingSectionProps) {
  const contractShort = contractAddress ? `${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}` : "Not set"

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* Left: contract configuration */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Smart Contract Configuration</CardTitle>
            <CardDescription>Enter your NFT contract addresses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contract-address">Contract Address</Label>
              <Input
                id="contract-address"
                placeholder="0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae"
                value={contractAddress}
                onChange={(e) => onContractAddressChange(e.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">Enter any contract address - no verification needed</p>
            </div>

            <Alert variant="info">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>You can update the contract address at any time before minting</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Right: mint summary */}
        <SummaryCard
          className="lg:col-span-2"
          title="Mint NFTs"
          description="Mint NFTs to all wallets"
          badge={<StatusBadge tone="neutral">{chain.name}</StatusBadge>}
          footer={
            <>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="lg"
                  onClick={onMint}
                  disabled={isMinting || walletCount === 0 || !contractAddress}
                  className="flex-1"
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Minting...
                    </>
                  ) : (
                    "Start Minting All Wallets"
                  )}
                </Button>
                {isMinting && (
                  <Button onClick={onStop} variant="destructive" size="lg">
                    <X aria-hidden="true" />
                    Stop
                  </Button>
                )}
              </div>
            </>
          }
        >
          <SummaryRow label="Total wallets" value={walletCount} />
          <SummaryRow label="Funded wallets" value={fundedCount} />
          <SummaryRow label="Contract" value={contractShort} mono />
          <div className="py-3">
            <p className="mb-1 text-sm font-medium">Before you start</p>
            <ul>
              <ChecklistItem done={Boolean(contractAddress)} label="Contract address set" hint="Add a contract address on the left" />
              <ChecklistItem done={walletCount > 0} label="Wallets generated" hint="Generate wallets first" />
              <ChecklistItem done={walletConnected} label="Wallet connected" hint="Use Connect Wallet in the top bar" />
              <ChecklistItem done={fundedCount > 0} label="Wallets funded" hint="Wallets need gas to mint. Use Auto-Funding" />
            </ul>
          </div>
        </SummaryCard>
      </div>

      <TransactionHistory transactions={transactions} chain={chain} />
    </div>
  )
}
