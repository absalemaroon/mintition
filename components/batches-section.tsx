"use client"

import { Info, Layers3 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/app/empty-state"
import { cn } from "@/lib/utils"

interface BatchesSectionProps {
  batches: any[]
  selectedBatchId: string
  walletCount: number
  batchName: string
  onBatchNameChange: (name: string) => void
  isSavingBatch: boolean
  onSaveBatch: () => void
  onLoadBatch: (batchId: string) => void
}

/** Presentation for the Batches page. Same conditions as before decide what is shown. */
export function BatchesSection({
  batches,
  selectedBatchId,
  walletCount,
  batchName,
  onBatchNameChange,
  isSavingBatch,
  onSaveBatch,
  onLoadBatch,
}: BatchesSectionProps) {
  const canSave = walletCount > 0 && !selectedBatchId

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Load Saved Batch</CardTitle>
            <CardDescription>Reuse previously generated wallet batches</CardDescription>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <EmptyState
                icon={Layers3}
                title="No saved batches yet"
                description="Generate wallets, then save them here to reuse them later."
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {batches.map((batch) => {
                  const selected = selectedBatchId === batch.id
                  return (
                    <li key={batch.id}>
                      <button
                        type="button"
                        onClick={() => onLoadBatch(batch.id)}
                        aria-pressed={selected}
                        className={cn(
                          "w-full rounded-xl border p-4 text-left transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                          selected ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/60",
                        )}
                      >
                        <span className="block truncate font-medium">{batch.name}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{batch.walletCount} wallets</span>
                        <span className="mt-3 block text-xs text-muted-foreground">
                          {new Date(batch.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        {canSave ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Save Current Batch</CardTitle>
              <CardDescription>Store these {walletCount} wallets so you can load them again.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="batch-name">Batch Name</Label>
                <Input
                  id="batch-name"
                  type="text"
                  value={batchName}
                  onChange={(e) => onBatchNameChange(e.target.value)}
                  placeholder="e.g., Marketing Campaign Batch 1"
                />
              </div>
              <Button onClick={onSaveBatch} disabled={isSavingBatch} className="w-full">
                {isSavingBatch ? "Saving..." : "Save Batch"}
              </Button>
            </CardContent>
          </Card>
        ) : walletCount === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Layers3}
                title="Nothing to save yet"
                description="Generate wallets first, then come back to save them as a batch."
              />
            </CardContent>
          </Card>
        ) : (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>These wallets come from a saved batch, so there is nothing new to save.</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
