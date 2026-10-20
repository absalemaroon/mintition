"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { AlertCircle, Check, CheckCircle2, Clock, Download, Loader2, X } from "lucide-react"
import type { MintWallet } from "@/lib/types"
import { storage } from "@/lib/storage"
import { shortAddress } from "@/lib/chains"
import { CopyButton } from "@/components/app/copy-button"
import { StatusBadge, labelForStatus, toneForStatus } from "@/components/app/status-badge"
import { Skeleton } from "@/components/app/skeleton"

interface WalletManagementProps {
  wallets: MintWallet[]
  onWalletsUpdate: (wallets: MintWallet[]) => void
  isGenerating?: boolean
  /** Native token shown next to balances. Pass the active chain's symbol. */
  nativeSymbol?: string
  loading?: boolean
}

export function WalletManagement({ wallets, onWalletsUpdate, isGenerating, nativeSymbol = "CELO", loading }: WalletManagementProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const totalPages = Math.ceil(wallets.length / itemsPerPage)
  // If the list shrinks (e.g. a smaller batch is generated) never sit on a page that no longer exists.
  const page = Math.min(currentPage, Math.max(totalPages, 1))
  const paginatedWallets = wallets.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const exportCSV = () => {
    const csv = storage.exportWalletsAsCSV()
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `wallets-${Date.now()}.csv`
    a.click()

    toast.success("CSV exported", {
      description: `Downloaded ${wallets.length} wallets`,
    })
  }

  const fundedIndicator = (fundingStatus: string) => {
    switch (fundingStatus) {
      case "funded":
        return (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Check className="size-4" aria-hidden="true" />
            Funded
          </span>
        )
      case "funding":
        return (
          <span className="inline-flex items-center gap-1.5 text-warning">
            <Clock className="size-4" aria-hidden="true" />
            Funding
          </span>
        )
      case "funding_failed":
        return (
          <span className="inline-flex items-center gap-1.5 text-danger">
            <AlertCircle className="size-4" aria-hidden="true" />
            Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <X className="size-4" aria-hidden="true" />
            Not funded
          </span>
        )
    }
  }

  const statusBadge = (status: string | undefined) => {
    const value = status || "idle"
    return (
      <StatusBadge tone={toneForStatus(value)}>
        {(value === "completed" || value === "minted") && <CheckCircle2 className="size-3" aria-hidden="true" />}
        {(value === "failed" || value === "error") && <AlertCircle className="size-3" aria-hidden="true" />}
        {value === "minting" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
        {labelForStatus(value)}
      </StatusBadge>
    )
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-5">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Wallet Management</CardTitle>
          <CardDescription>Monitor and manage your minting wallets</CardDescription>
        </div>
        <Button onClick={exportCSV} disabled={wallets.length === 0} variant="outline" size="sm" className="shrink-0">
          <Download aria-hidden="true" />
          Export as CSV
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading wallets">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : paginatedWallets.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No wallets generated yet</p>
        ) : (
          <>
            {/* Table from tablet up */}
            <div className="hidden max-h-[560px] overflow-auto md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Wallet Address</th>
                    <th scope="col" className="px-5 py-3 font-medium">Balance</th>
                    <th scope="col" className="px-5 py-3 font-medium">Funded</th>
                    <th scope="col" className="px-5 py-3 font-medium">Mints</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedWallets.map((wallet) => (
                    <tr key={wallet.address} className="border-t transition-colors duration-150 hover:bg-muted/50">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-mono text-xs" title={wallet.address}>
                            {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                          </span>
                          <CopyButton value={wallet.address} />
                        </span>
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {wallet.balance ?? "0"} {nativeSymbol}
                      </td>
                      <td className="px-5 py-3">{fundedIndicator(wallet.fundingStatus || "not_funded")}</td>
                      <td className="px-5 py-3 tabular-nums">{wallet.mintsCompleted || 0}</td>
                      <td className="px-5 py-3">{statusBadge(wallet.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stacked cards on phones */}
            <ul className="divide-y md:hidden">
              {paginatedWallets.map((wallet) => (
                <li key={wallet.address} className="space-y-3 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-xs">{shortAddress(wallet.address, 10, 8)}</span>
                      <CopyButton value={wallet.address} />
                    </span>
                    {statusBadge(wallet.status)}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Balance</dt>
                      <dd className="tabular-nums">
                        {wallet.balance ?? "0"} {nativeSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Funded</dt>
                      <dd>{fundedIndicator(wallet.fundingStatus || "not_funded")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Mints</dt>
                      <dd className="tabular-nums">{wallet.mintsCompleted || 0}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.max(1, page - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
