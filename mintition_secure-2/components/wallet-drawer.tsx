"use client"

import { useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { AlertCircle, ArrowUpRight, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AnimatedNumber } from "@/components/app/animated-number"
import { ChainLogo } from "@/components/app/chain-logo"
import { CopyButton } from "@/components/app/copy-button"
import { Skeleton } from "@/components/app/skeleton"
import { StatusBadge, labelForStatus, toneForStatus } from "@/components/app/status-badge"
import { TokenLogo } from "@/components/app/token-logo"
import { api } from "@/lib/api-client"
import { explorerAddressUrl, explorerTxUrl, shortAddress, type ChainConfig } from "@/lib/chains"
import type { MintWallet } from "@/lib/types"

interface Holding {
  address: string
  symbol: string
  name: string | null
  logo: string | null
  amount: string
  priceUsd: number | null
  valueUsd: number | null
}

interface Portfolio {
  address: string
  native: { symbol: string; amount: string; priceUsd: number | null; valueUsd: number | null }
  holdings: Holding[]
  totalUsd: number | null
  transactions: { id: string; kind: string; status: string; hash: string; detail?: string; error?: string; timestamp: number }[]
}

const usd = (v: number | null) => (v === null ? "--" : `$${v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const amt = (v: string) => Number(v).toLocaleString("en", { maximumSignificantDigits: 6 })

/** Right-hand sheet with one wallet's holdings (with USD values) and its transaction history. */
export function WalletDrawer({ wallet, chain, token, onClose }: { wallet: MintWallet | null; chain: ChainConfig; token?: string; onClose: () => void }) {
  const [data, setData] = useState<Portfolio | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!wallet) return
    let alive = true
    setData(null)
    setError("")
    api<Portfolio>(`/api/wallets/${wallet.id}?chainId=${chain.chainId}${token ? `&token=${encodeURIComponent(token)}` : ""}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not read this wallet"))
    return () => {
      alive = false
    }
  }, [wallet, chain.chainId, token])

  const explorer = wallet ? explorerAddressUrl(chain, wallet.address) : null

  return (
    <Dialog.Root open={Boolean(wallet)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-mono text-[13px] font-semibold tracking-wide uppercase">
                <span className="mr-2 text-primary">//</span>Wallet
              </Dialog.Title>
              <Dialog.Description className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                {wallet ? shortAddress(wallet.address, 10, 8) : ""}
                {wallet && <CopyButton value={wallet.address} />}
                {explorer && (
                  <a href={explorer} target="_blank" rel="noreferrer" aria-label="Open in block explorer" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted hover:text-foreground">
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {error && (
              <Alert variant="destructive" className="bg-danger-soft border-danger/30">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!data && !error && (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {data && (
              <>
                <section aria-label="Total value">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Total value on {chain.name}</p>
                  <p className="text-glow mt-1 font-mono text-4xl font-semibold tracking-tight text-primary tabular-nums">
                    {data.totalUsd === null ? "--" : <AnimatedNumber value={data.totalUsd} decimals={2} prefix="$" />}
                  </p>
                </section>

                <section aria-label="Holdings">
                  <h3 className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Holdings</h3>
                  <ul className="divide-y rounded-lg border">
                    <li className="flex items-center gap-3 px-3.5 py-3">
                      <ChainLogo chain={chain} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{data.native.symbol}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{data.native.priceUsd !== null ? `$${data.native.priceUsd.toLocaleString("en", { maximumSignificantDigits: 6 })}` : "no price"}</span>
                      </span>
                      <span className="text-right font-mono text-sm tabular-nums">
                        <span className="block">{amt(data.native.amount)}</span>
                        <span className="block text-xs text-primary">{usd(data.native.valueUsd)}</span>
                      </span>
                    </li>
                    {data.holdings.map((h) => (
                      <li key={h.address} className="flex items-center gap-3 px-3.5 py-3">
                        <TokenLogo src={h.logo} symbol={h.symbol} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{h.symbol}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{h.priceUsd !== null ? `$${h.priceUsd.toLocaleString("en", { maximumSignificantDigits: 4 })}` : shortAddress(h.address, 6, 4)}</span>
                        </span>
                        <span className="text-right font-mono text-sm tabular-nums">
                          <span className="block">{amt(h.amount)}</span>
                          <span className="block text-xs text-primary">{usd(h.valueUsd)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">Shows {chain.nativeSymbol} and every token this wallet has traded through the app.</p>
                </section>

                <section aria-label="Transaction history">
                  <h3 className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">History ({data.transactions.length})</h3>
                  {data.transactions.length === 0 ? (
                    <p className="rounded-lg border px-3.5 py-6 text-center text-sm text-muted-foreground">No transactions from the app yet.</p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {data.transactions.map((t) => {
                        const link = explorerTxUrl(chain, t.hash)
                        return (
                          <li key={t.id} className="space-y-1 px-3.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 font-mono text-xs uppercase">
                                <StatusBadge tone={toneForStatus(t.status)}>{labelForStatus(t.status)}</StatusBadge>
                                {t.kind}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{new Date(t.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                            </div>
                            {(t.detail || t.error) && <p className="text-sm">{t.detail ?? t.error}</p>}
                            {link && (
                              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary">
                                {shortAddress(t.hash, 8, 6)} <ArrowUpRight className="size-3" aria-hidden="true" />
                              </a>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
