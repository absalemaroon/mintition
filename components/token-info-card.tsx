"use client"

import { AlertCircle, ExternalLink } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { CopyButton } from "@/components/app/copy-button"
import { explorerAddressUrl, shortAddress, type ChainConfig } from "@/lib/chains"
import { cn } from "@/lib/utils"
import type { TokenInfoView } from "@/lib/types"

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 })

export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  if (value === 0) return "$0"
  if (Math.abs(value) < 1) return `$${value.toLocaleString("en", { maximumSignificantDigits: 4 })}`
  return value >= 100_000 ? `$${compact.format(value)}` : `$${value.toLocaleString("en", { maximumFractionDigits: 2 })}`
}

function age(createdAt: number | null): string {
  if (!createdAt) return "-"
  const days = Math.floor((Date.now() - createdAt) / 86_400_000)
  if (days < 1) return `${Math.max(1, Math.floor((Date.now() - createdAt) / 3_600_000))}h`
  return days < 60 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", tone === "up" && "text-success", tone === "down" && "text-danger")}>{value}</p>
    </div>
  )
}

const pct = (v: number | null) => (v === null ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`)
const tone = (v: number | null) => (v === null || v === 0 ? undefined : v > 0 ? ("up" as const) : ("down" as const))

export function TokenInfoCard({ info, chain }: { info: TokenInfoView; chain: ChainConfig }) {
  const m = info.market
  const explorer = explorerAddressUrl(chain, info.address)

  return (
    <Card className="gap-4">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-base font-semibold text-muted-foreground">
            {info.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              (info.symbol || "?").slice(0, 1)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight">
              {info.name || "Unknown token"} {info.symbol && <span className="text-muted-foreground">({info.symbol})</span>}
            </p>
            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              {shortAddress(info.address, 8, 6)}
              <CopyButton value={info.address} label="Token address" />
              {explorer && (
                <a href={explorer} target="_blank" rel="noreferrer" aria-label="Open in block explorer" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </p>
          </div>
          {m?.url && (
            <a href={m.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              DexScreener
            </a>
          )}
        </div>

        {info.warnings.map((w) => (
          <Alert key={w} variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{w}</AlertDescription>
          </Alert>
        ))}

        {info.elsewhere.length > 0 && (
          <p className="text-sm text-muted-foreground">
            This address has trading pairs on <span className="font-medium text-foreground">{info.elsewhere.join(", ")}</span>. Switch the network at the top if that is the one you want.
          </p>
        )}

        {m ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Price" value={usd(m.priceUsd)} />
            <Stat label="24h change" value={pct(m.change24h)} tone={tone(m.change24h)} />
            <Stat label="1h change" value={pct(m.change1h)} tone={tone(m.change1h)} />
            <Stat label="Liquidity" value={usd(m.liquidityUsd)} />
            <Stat label="24h volume" value={usd(m.volume24h)} />
            <Stat label="Market cap" value={usd(m.marketCap)} />
            <Stat label="FDV" value={usd(m.fdv)} />
            <Stat label="24h buys / sells" value={m.buys24h === null && m.sells24h === null ? "-" : `${m.buys24h ?? 0} / ${m.sells24h ?? 0}`} />
            <Stat label="Pool age" value={age(m.createdAt)} />
            <Stat label="Top pool" value={`${m.dex || "dex"} / ${m.quoteSymbol || "?"}`} />
            <Stat label="Decimals" value={info.decimals === null ? "-" : String(info.decimals)} />
            <Stat label="Total supply" value={info.totalSupply === null ? "-" : compact.format(Number(info.totalSupply))} />
          </div>
        ) : (
          info.isContract && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Decimals" value={info.decimals === null ? "-" : String(info.decimals)} />
              <Stat label="Total supply" value={info.totalSupply === null ? "-" : compact.format(Number(info.totalSupply))} />
            </div>
          )
        )}

        {info.pairs.length > 1 && (
          <details className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">All pools ({info.pairs.length})</summary>
            <ul className="divide-y border-t text-sm">
              {info.pairs.map((p) => (
                <li key={p.pairAddress} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 truncate">
                    {p.dex} / {p.quoteSymbol}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {usd(p.liquidityUsd)} liq · {usd(p.volume24h)} vol
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {(info.websites.length > 0 || info.socials.length > 0) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {[...info.websites.map((w) => ({ label: w.label, url: w.url })), ...info.socials.map((s) => ({ label: s.type, url: s.url }))].map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener" className="capitalize text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {l.label}
              </a>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
