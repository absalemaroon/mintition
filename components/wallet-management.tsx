"use client"

import { useState } from "react"
import { toast } from "sonner"
import { AlertCircle, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AnimatedNumber } from "@/components/app/animated-number"
import { ChainLogo } from "@/components/app/chain-logo"
import { CopyButton } from "@/components/app/copy-button"
import { Skeleton } from "@/components/app/skeleton"
import { StatusBadge, labelForStatus, toneForStatus } from "@/components/app/status-badge"
import { shortAddress, type ChainConfig } from "@/lib/chains"
import type { BalanceRow, MintWallet } from "@/lib/types"

interface WalletManagementProps {
  wallets: MintWallet[]
  chain: ChainConfig
  /** Live balances by wallet id, for the active network. */
  balances: Record<string, BalanceRow> | null
  nativePriceUsd: number | null
  loadingBalances: boolean
  onRefresh: () => void
  onOpen: (wallet: MintWallet) => void
  loading?: boolean
  /** Batch to export. Empty exports every wallet in the vault. */
  batchId?: string
}

const fmtAmount = (v: string | undefined) => (v === undefined ? "--" : Number(v).toLocaleString("en", { maximumSignificantDigits: 5 }))
const fmtUsd = (v: number | null) => (v === null ? "--" : v < 0.01 && v > 0 ? "<$0.01" : `$${v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

function Funding({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    funded: { text: "Funded", cls: "text-success" },
    funding: { text: "Funding", cls: "text-warning" },
    funding_failed: { text: "Failed", cls: "text-danger" },
    not_funded: { text: "Empty", cls: "text-muted-foreground" },
  }
  const m = map[status] ?? map.not_funded
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${m.cls}`}>
      <span className="led" aria-hidden="true" />
      {m.text}
    </span>
  )
}

export function WalletManagement({ wallets, chain, balances, nativePriceUsd, loadingBalances, onRefresh, onOpen, loading, batchId }: WalletManagementProps) {
  const [page, setPage] = useState(1)
  const perPage = 10
  const totalPages = Math.max(1, Math.ceil(wallets.length / perPage))
  const current = Math.min(page, totalPages)
  const rows = wallets.slice((current - 1) * perPage, current * perPage)

  const totalNative = balances ? Object.values(balances).reduce((s: number, b: BalanceRow) => s + Number(b.native || 0), 0) : null
  const totalUsd = totalNative !== null && nativePriceUsd !== null ? totalNative * nativePriceUsd : null

  // Private keys live only on the server. Exporting them needs the account password again.
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPassword, setExportPassword] = useState("")
  const [exporting, setExporting] = useState(false)
  const exportCSV = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/wallets/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: exportPassword, batchId: batchId || undefined }), cache: "no-store" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Export failed")
      const url = window.URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `wallets-${Date.now()}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      setExportOpen(false)
      setExportPassword("")
      toast.success("CSV exported", { description: "Contains private keys. Store it somewhere safe and delete it when done." })
    } catch (error) {
      toast.error("Export failed", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  const balanceCell = (w: MintWallet) => {
    const b = balances?.[w.id]
    if (!balances) return <span className="text-muted-foreground">--</span>
    if (b?.error) return <span className="text-danger">error</span>
    return (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <ChainLogo chain={chain} size={14} />
        {fmtAmount(b?.native)} <span className="text-muted-foreground">{chain.nativeSymbol}</span>
      </span>
    )
  }
  const usdCell = (w: MintWallet) => {
    const b = balances?.[w.id]
    return <span className="tabular-nums">{b && nativePriceUsd !== null ? fmtUsd(Number(b.native) * nativePriceUsd) : "--"}</span>
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-5">
        <div className="space-y-1.5">
          <CardTitle>Wallets</CardTitle>
          <CardDescription>
            Live balances on {chain.name}. Tap a wallet for its holdings and history.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={onRefresh} disabled={loadingBalances || wallets.length === 0} variant="outline" size="sm" aria-label="Refresh balances">
            <RefreshCw className={loadingBalances ? "animate-spin" : ""} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => setExportOpen((o) => !o)} disabled={wallets.length === 0} variant="outline" size="sm" aria-expanded={exportOpen}>
            <Download aria-hidden="true" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </CardHeader>

      {balances && (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 border-b bg-muted/30 px-5 py-3 font-mono text-xs text-muted-foreground">
          <span>
            Total balance <span className="text-sm font-semibold text-foreground">{totalNative !== null && <AnimatedNumber value={totalNative} decimals={4} suffix={` ${chain.nativeSymbol}`} />}</span>
          </span>
          <span>
            Value <span className="text-sm font-semibold text-primary">{totalUsd !== null ? <AnimatedNumber value={totalUsd} decimals={2} prefix="$" /> : "--"}</span>
          </span>
          {nativePriceUsd !== null && (
            <span>
              1 {chain.nativeSymbol} = <span className="text-foreground">${nativePriceUsd.toLocaleString("en", { maximumSignificantDigits: 6 })}</span>
            </span>
          )}
        </div>
      )}

      {exportOpen && (
        <div className="space-y-3 border-b bg-muted/40 px-5 py-4">
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>The file contains private keys in plain text. Enter your account password to continue.</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="export-password">Account password</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="export-password" type="password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && exportPassword && !exporting && exportCSV()} />
              <Button onClick={exportCSV} disabled={!exportPassword || exporting}>
                {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                Download
              </Button>
              <Button variant="outline" onClick={() => { setExportOpen(false); setExportPassword("") }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading wallets">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No wallets generated yet</p>
        ) : (
          <>
            <div className="hidden max-h-[600px] overflow-auto md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                  <tr className="text-left">
                    <th scope="col" className="px-5 py-3 font-medium">#</th>
                    <th scope="col" className="px-3 py-3 font-medium">Address</th>
                    <th scope="col" className="px-3 py-3 font-medium">Balance</th>
                    <th scope="col" className="px-3 py-3 font-medium">Value</th>
                    <th scope="col" className="px-3 py-3 font-medium">Funds</th>
                    <th scope="col" className="px-3 py-3 font-medium">Mints</th>
                    <th scope="col" className="px-3 py-3 font-medium">Status</th>
                    <th scope="col" className="w-8 px-3 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[13px]">
                  {rows.map((w, i) => (
                    <tr key={w.id} onClick={() => onOpen(w)} className="group cursor-pointer border-t transition-colors duration-150 hover:bg-accent/60 animate-line-in" style={{ animationDelay: `${i * 25}ms` }}>
                      <td className="px-5 py-3 text-muted-foreground">{(current - 1) * perPage + i + 1}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <span title={w.address}>{shortAddress(w.address, 8, 6)}</span>
                          <CopyButton value={w.address} />
                        </span>
                      </td>
                      <td className="px-3 py-3">{balanceCell(w)}</td>
                      <td className="px-3 py-3 text-primary">{usdCell(w)}</td>
                      <td className="px-3 py-3"><Funding status={w.fundingStatus} /></td>
                      <td className="px-3 py-3 tabular-nums">{w.mintsCompleted || 0}</td>
                      <td className="px-3 py-3"><StatusBadge tone={toneForStatus(w.status)}>{labelForStatus(w.status)}</StatusBadge></td>
                      <td className="px-3 py-3 text-muted-foreground group-hover:text-primary"><ChevronRight className="size-4" aria-hidden="true" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y md:hidden">
              {rows.map((w, i) => (
                <li key={w.id}>
                  <button type="button" onClick={() => onOpen(w)} className="animate-line-in flex w-full flex-col gap-2.5 px-4 py-4 text-left active:bg-accent/60" style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="flex items-center justify-between gap-2 font-mono text-sm">
                      <span>{shortAddress(w.address, 8, 6)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <span className="flex items-center justify-between font-mono text-sm">
                      {balanceCell(w)}
                      <span className="text-primary">{usdCell(w)}</span>
                    </span>
                    <span className="flex items-center justify-between text-xs">
                      <Funding status={w.fundingStatus} />
                      <StatusBadge tone={toneForStatus(w.status)}>{labelForStatus(w.status)}</StatusBadge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-5 py-4">
          <p className="font-mono text-xs text-muted-foreground">
            Page {current} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, current - 1))} disabled={current === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, current + 1))} disabled={current === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
