"use client"

import { useEffect, useRef } from "react"
import { explorerTxUrl, shortAddress, type ChainConfig } from "@/lib/chains"
import { cn } from "@/lib/utils"
import type { JobView, Transaction } from "@/lib/types"

interface LiveConsoleProps {
  transactions: Transaction[]
  jobs: JobView[]
  chain: ChainConfig
  className?: string
  /** Lines to keep. */
  limit?: number
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false })

/** A terminal-style event stream built from your jobs and transactions. New lines slide in; a cursor blinks at the end. */
export function LiveConsole({ transactions, jobs, chain, className, limit = 40 }: LiveConsoleProps) {
  const box = useRef<HTMLDivElement>(null)
  const lines = [
    ...transactions.map((t) => ({ at: t.timestamp, key: `t${t.id ?? t.hash}${t.status}`, kind: "tx" as const, tx: t })),
    ...jobs.map((j) => ({ at: Date.parse(j.createdAt), key: `j${j.id}${j.status}${j.success}${j.failed}`, kind: "job" as const, job: j })),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(-limit)

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [lines.length])

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-[color-mix(in_oklab,var(--background)_70%,black)] font-mono text-xs", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-danger/70" />
          <span className="size-2 rounded-full bg-warning/70" />
          <span className="size-2 rounded-full bg-success/70" />
        </span>
        <span className="ml-1">mintition@{chain.name.toLowerCase().replace(/\s+/g, "-")} ~ live</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-success">
          <span className="led led-pulse" aria-hidden="true" />
          streaming
        </span>
      </div>
      <div ref={box} className="h-56 space-y-1 overflow-y-auto px-3 py-2.5" role="log" aria-live="polite" aria-label="Activity log">
        {lines.length === 0 && <p className="text-muted-foreground">$ waiting for activity... start a mint, trade or transfer.</p>}
        {lines.map((l) =>
          l.kind === "tx" ? (
            <p key={l.key} className="animate-line-in break-all">
              <span className="text-muted-foreground">[{time(l.at)}]</span>{" "}
              <span className={l.tx.status === "success" ? "text-success" : l.tx.status === "failed" ? "text-danger" : "text-warning"}>{l.tx.status === "success" ? "OK  " : l.tx.status === "failed" ? "FAIL" : "PEND"}</span>{" "}
              <span className="text-info uppercase">{l.tx.kind ?? "mint"}</span> <span className="text-muted-foreground">{shortAddress(l.tx.wallet, 6, 4)}</span>{" "}
              {l.tx.detail ?? l.tx.error ?? ""}{" "}
              {explorerTxUrl(chain, l.tx.hash) ? (
                <a href={explorerTxUrl(chain, l.tx.hash)!} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
                  {shortAddress(l.tx.hash, 6, 4)}
                </a>
              ) : null}
            </p>
          ) : (
            <p key={l.key} className="animate-line-in text-muted-foreground">
              [{time(l.at)}] <span className="text-primary">JOB </span>
              {l.job.detail} - {l.job.status}
              {l.job.total > 0 && ` (${l.job.success + l.job.failed}/${l.job.total}${l.job.failed ? `, ${l.job.failed} failed` : ""})`}
            </p>
          ),
        )}
        <p className="text-primary">
          $ <span className="animate-blink">▌</span>
        </p>
      </div>
    </div>
  )
}
