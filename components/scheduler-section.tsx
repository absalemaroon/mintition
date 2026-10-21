"use client"

import { useMemo, useState } from "react"
import { CalendarClock, Info, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/app/native-select"
import { StatusBadge } from "@/components/app/status-badge"
import { SummaryCard, SummaryRow } from "@/components/app/summary-card"
import { JobsList } from "@/components/jobs-list"
import { cn } from "@/lib/utils"
import type { ChainConfig } from "@/lib/chains"
import type { BatchInfo, JobView } from "@/lib/types"

export interface NewJobInput {
  name: string
  contractAddress: string
  batchId: string
  runAt: string | null
  concurrency: number
  mintsPerWallet: number
}

interface SchedulerSectionProps {
  chain: ChainConfig
  batches: BatchInfo[]
  selectedBatchId: string
  contractAddress: string
  onContractAddressChange: (address: string) => void
  onCreate: (input: NewJobInput) => Promise<boolean>
  jobs: JobView[]
  onCancel: (jobId: string) => void
  cancellingId?: string
}

/** A value for <input type="datetime-local"> ten minutes from now, in the device's time zone. */
export function defaultStart(): string {
  const d = new Date(Date.now() + 10 * 60_000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SchedulerSection({
  chain,
  batches,
  selectedBatchId,
  contractAddress,
  onContractAddressChange,
  onCreate,
  jobs,
  onCancel,
  cancellingId,
}: SchedulerSectionProps) {
  const [name, setName] = useState("")
  const [batchId, setBatchId] = useState(selectedBatchId)
  const [startMode, setStartMode] = useState<"now" | "later">("later")
  const [startAt, setStartAt] = useState(defaultStart)
  const [concurrency, setConcurrency] = useState(10)
  const [mintsPerWallet, setMintsPerWallet] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const effectiveBatchId = batchId || selectedBatchId || batches[0]?.id || ""
  const batch = batches.find((b) => b.id === effectiveBatchId)
  const totalMints = (batch?.walletCount ?? 0) * mintsPerWallet
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const startDate = startMode === "later" ? new Date(startAt) : null
  const startInvalid = startMode === "later" && (!startAt || Number.isNaN(startDate!.getTime()))
  const canSubmit = Boolean(effectiveBatchId && contractAddress && !startInvalid && !submitting)

  const submit = async () => {
    setSubmitting(true)
    const ok = await onCreate({
      name,
      contractAddress,
      batchId: effectiveBatchId,
      runAt: startMode === "later" ? startDate!.toISOString() : null,
      concurrency,
      mintsPerWallet,
    })
    setSubmitting(false)
    if (ok) {
      setName("")
      setStartAt(defaultStart())
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">New minting run</CardTitle>
            <CardDescription>Pick a batch, a contract and a start time. The server does the rest.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="job-name">Name (optional)</Label>
              <Input id="job-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday drop" maxLength={80} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-batch">Wallet batch</Label>
              <NativeSelect id="job-batch" value={effectiveBatchId} onChange={(e) => setBatchId(e.target.value)} disabled={batches.length === 0}>
                {batches.length === 0 && <option value="">No batches yet</option>}
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.walletCount} wallets)
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-contract">Contract address</Label>
              <Input
                id="job-contract"
                value={contractAddress}
                onChange={(e) => onContractAddressChange(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm leading-none font-medium">Start</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Start">
                {(
                  [
                    ["now", "Right now"],
                    ["later", "At a set time"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={startMode === value}
                    onClick={() => setStartMode(value)}
                    className={cn(
                      "h-10 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                      startMode === value ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {startMode === "later" && (
                <div className="space-y-1.5">
                  <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Start date and time" />
                  <p className="text-xs text-muted-foreground">Your device&apos;s time zone: {timeZone}</p>
                </div>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="job-concurrency">At the same time</Label>
                <Input
                  id="job-concurrency"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-mints">Mints per wallet</Label>
                <Input
                  id="job-mints"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={mintsPerWallet}
                  onChange={(e) => setMintsPerWallet(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  className="tabular-nums"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <SummaryCard
          className="lg:col-span-2"
          title="Run summary"
          description="What will happen."
          badge={<StatusBadge tone="neutral">{chain.name}</StatusBadge>}
          footer={
            <>
              <Button size="lg" className="w-full" onClick={submit} disabled={!canSubmit}>
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
                {startMode === "now" ? "Start now" : "Schedule minting"}
              </Button>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Runs on the server. Close the app, lock your phone, it still happens.
              </p>
            </>
          }
        >
          <SummaryRow label="Batch" value={batch ? batch.name : "None"} />
          <SummaryRow label="Wallets" value={batch?.walletCount ?? 0} />
          <SummaryRow label="Mints per wallet" value={mintsPerWallet} />
          <SummaryRow label="Total mints" value={totalMints} strong />
          <SummaryRow label="Starts" value={startMode === "now" ? "Immediately" : startInvalid ? "Pick a time" : startDate!.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} />
        </SummaryCard>
      </div>

      <Alert variant="warning">
        <Info aria-hidden="true" />
        <AlertDescription>Wallets need gas before their mints run. Fund them first on the Auto-Funding page, otherwise those mints will fail.</AlertDescription>
      </Alert>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-5">
          <CardTitle>Jobs</CardTitle>
          <CardDescription>Scheduled, running and finished runs.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <JobsList jobs={jobs} onCancel={onCancel} cancellingId={cancellingId} />
        </CardContent>
      </Card>
    </div>
  )
}
