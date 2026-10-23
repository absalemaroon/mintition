"use client"

import { Loader2, X, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/empty-state"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { shortAddress } from "@/lib/chains"
import type { JobView } from "@/lib/types"

const TONES: Record<JobView["status"], Tone> = {
  scheduled: "warning",
  running: "info",
  completed: "success",
  cancelled: "neutral",
  failed: "danger",
}

function when(job: JobView): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
  if (job.status === "scheduled") return `Starts ${fmt(job.runAt)}`
  if (job.status === "running") return `Started ${fmt(job.startedAt || job.runAt)}`
  return `Finished ${fmt(job.finishedAt || job.createdAt)}`
}

interface JobsListProps {
  jobs: JobView[]
  onCancel: (jobId: string) => void
  cancellingId?: string
  emptyHint?: string
}

export function JobsList({ jobs, onCancel, cancellingId, emptyHint }: JobsListProps) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No minting jobs yet"
        description={emptyHint || "Jobs you start or schedule appear here with live progress."}
      />
    )
  }

  return (
    <ul className="divide-y">
      {jobs.map((job) => {
        const done = job.success + job.failed
        const pct = job.total ? Math.round((done / job.total) * 100) : 0
        const open = job.status === "scheduled" || job.status === "running"
        return (
          <li key={job.id} className="space-y-3 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{job.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {job.detail} · {when(job)}
                  {job.contract && job.contract !== "native" && (
                    <>
                      {" · "}
                      <span className="font-mono">{shortAddress(job.contract, 8, 6)}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone={TONES[job.status]}>
                  {job.status === "running" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </StatusBadge>
                {open && (
                  <Button variant="outline" size="sm" onClick={() => onCancel(job.id)} disabled={cancellingId === job.id} aria-label={`Cancel ${job.name}`}>
                    <X aria-hidden="true" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={job.total}
                aria-valuenow={done}
                aria-label={`${job.name} progress`}
              >
                <div className="h-2 rounded-full bg-foreground transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {job.success} minted
                {job.failed > 0 && <span className="text-danger"> · {job.failed} failed</span>}
                {" · "}
                {job.total} total · {job.concurrency} at a time
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
