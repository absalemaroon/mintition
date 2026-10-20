"use client"

import { AlertCircle, Info, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChecklistItem, SummaryCard, SummaryRow } from "@/components/app/summary-card"
import { StatusBadge } from "@/components/app/status-badge"
import { JobsList } from "@/components/jobs-list"
import { TransactionHistory } from "@/components/transaction-history"
import { cn } from "@/lib/utils"
import type { ChainConfig } from "@/lib/chains"
import type { JobView, Transaction } from "@/lib/types"

const SPEEDS = [5, 10, 25, 50]

interface MintingSectionProps {
  chain: ChainConfig
  contractAddress: string
  onContractAddressChange: (address: string) => void
  walletCount: number
  fundedCount: number
  concurrency: number
  onConcurrencyChange: (value: number) => void
  isStarting: boolean
  onMint: () => void
  jobs: JobView[]
  onCancel: (jobId: string) => void
  cancellingId?: string
  transactions: Transaction[]
}

/** Presentation for the Minting page. Minting runs on the server, so closing the app never stops it. */
export function MintingSection({
  chain,
  contractAddress,
  onContractAddressChange,
  walletCount,
  fundedCount,
  concurrency,
  onConcurrencyChange,
  isStarting,
  onMint,
  jobs,
  onCancel,
  cancellingId,
  transactions,
}: MintingSectionProps) {
  const contractShort = contractAddress ? `${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}` : "Not set"
  const activeJobs = jobs.filter((job) => job.status === "running" || job.status === "scheduled")

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Smart Contract Configuration</CardTitle>
            <CardDescription>Enter your NFT contract addresses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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

            <div className="space-y-2">
              <Label id="speed-label">Wallets minting at the same time</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="speed-label">
                {SPEEDS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onConcurrencyChange(n)}
                    aria-pressed={concurrency === n}
                    className={cn(
                      "h-10 min-w-14 rounded-lg border px-4 text-sm font-medium tabular-nums transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                      concurrency === n ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Higher is faster. If your RPC starts rate-limiting, pick a lower number.</p>
            </div>

            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertDescription>
                Minting runs on the server, in parallel. You can close this page and it keeps going. Check progress here any time.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <SummaryCard
          className="lg:col-span-2"
          title="Mint NFTs"
          description="Mint NFTs to all wallets"
          badge={<StatusBadge tone="neutral">{chain.name}</StatusBadge>}
          footer={
            <Button variant="gradient" size="lg" onClick={onMint} disabled={isStarting || walletCount === 0 || !contractAddress} className="w-full">
              {isStarting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Starting...
                </>
              ) : (
                "Start Minting All Wallets"
              )}
            </Button>
          }
        >
          <SummaryRow label="Total wallets" value={walletCount} />
          <SummaryRow label="Funded wallets" value={fundedCount} />
          <SummaryRow label="Contract" value={contractShort} mono />
          <SummaryRow label="At the same time" value={concurrency} />
          <div className="py-3">
            <p className="mb-1 text-sm font-medium">Before you start</p>
            <ul>
              <ChecklistItem done={Boolean(contractAddress)} label="Contract address set" hint="Add a contract address on the left" />
              <ChecklistItem done={walletCount > 0} label="Wallets selected" hint="Generate wallets or load a batch first" />
              <ChecklistItem done={fundedCount > 0} label="Wallets funded" hint="Wallets need gas to mint. Use Auto-Funding" />
            </ul>
          </div>
        </SummaryCard>
      </div>

      {activeJobs.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-5 py-5">
            <CardTitle>In progress</CardTitle>
            <CardDescription>Live from the server.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <JobsList jobs={activeJobs} onCancel={onCancel} cancellingId={cancellingId} />
          </CardContent>
        </Card>
      )}

      <TransactionHistory transactions={transactions} chain={chain} limit={10} />
    </div>
  )
}
