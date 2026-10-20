"use client"

import { Info, Layers3 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/app/empty-state"
import { cn } from "@/lib/utils"
import type { BatchInfo } from "@/lib/types"

interface BatchesSectionProps {
  batches: BatchInfo[]
  selectedBatchId: string
  onLoadBatch: (batchId: string) => void
}

/** Every generated batch is saved (encrypted) the moment it is created. Load one to reuse its wallets. */
export function BatchesSection({ batches, selectedBatchId, onLoadBatch }: BatchesSectionProps) {
  return (
    <div className="space-y-6">
      <Alert variant="info">
        <Info aria-hidden="true" />
        <AlertDescription>Wallets are encrypted and saved as soon as you generate them. Nothing is kept in this browser.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saved batches</CardTitle>
          <CardDescription>Pick a batch to work with its wallets on the other pages.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState icon={Layers3} title="No batches yet" description="Generate wallets and they will show up here." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {batch.walletCount} wallets{batch.totalMints ? ` · ${batch.totalMints} mints` : ""}
                      </span>
                      <span className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{new Date(batch.createdAt).toLocaleDateString()}</span>
                        {selected && <span className="font-medium text-foreground">In use</span>}
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
  )
}
