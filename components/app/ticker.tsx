"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api-client"
import { ChainLogo } from "@/components/app/chain-logo"
import { AnimatedNumber } from "@/components/app/animated-number"
import type { ChainConfig } from "@/lib/chains"

interface TickerProps {
  chain: ChainConfig
  runningJobs: number
  scheduledJobs: number
}

/** Thin status strip: network, native price, clock and job activity. */
export function Ticker({ chain, runningJobs, scheduledJobs }: TickerProps) {
  const [price, setPrice] = useState<number | null>(null)
  const [now, setNow] = useState<string>("")

  useEffect(() => {
    let alive = true
    const load = () =>
      api<{ prices: Record<string, number | null> }>("/api/prices")
        .then((r) => alive && setPrice(r.prices[chain.id] ?? null))
        .catch(() => undefined)
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [chain.id])

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString().slice(11, 19) + " UTC")
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="hidden items-center gap-5 border-b bg-[color-mix(in_oklab,var(--background)_85%,black)] px-6 py-1.5 font-mono text-[11px] text-muted-foreground md:flex" role="status" aria-label="Status bar">
      <span className="inline-flex items-center gap-2 text-foreground">
        <ChainLogo chain={chain} size={14} />
        {chain.name}
      </span>
      <span>
        {chain.nativeSymbol}{" "}
        <span className="text-foreground">{price === null ? "--" : <AnimatedNumber value={price} decimals={price < 1 ? 4 : 2} prefix="$" />}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className={runningJobs > 0 ? "led led-pulse text-success" : "led text-muted-foreground/50"} aria-hidden="true" />
        {runningJobs > 0 ? `${runningJobs} job${runningJobs > 1 ? "s" : ""} running` : "idle"}
        {scheduledJobs > 0 && <span> · {scheduledJobs} scheduled</span>}
      </span>
      <span className="ml-auto tabular-nums">{now}</span>
    </div>
  )
}
