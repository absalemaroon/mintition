"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Check, X, Clock } from "lucide-react"
import type { MintWallet } from "@/lib/types"
import { storage } from "@/lib/storage"

interface WalletManagementProps {
  wallets: MintWallet[]
  onWalletsUpdate: (wallets: MintWallet[]) => void
  isGenerating?: boolean
}

export function WalletManagement({ wallets, onWalletsUpdate, isGenerating }: WalletManagementProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const totalPages = Math.ceil(wallets.length / itemsPerPage)
  const paginatedWallets = wallets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const totalBalance = wallets.reduce((sum, w) => sum + Number.parseFloat(w.balance || "0"), 0)
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)
  const fundedCount = wallets.filter((w) => w.fundingStatus === "funded").length

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

  const getStatusIcon = (fundingStatus: string) => {
    switch (fundingStatus) {
      case "funded":
        return <Check className="w-4 h-4 text-accent" />
      case "not_funded":
        return <X className="w-4 h-4 text-destructive" />
      case "funding":
        return <Clock className="w-4 h-4 text-teal" />
      default:
        return null
    }
  }

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: "bg-muted text-muted-foreground",
      funding: "bg-teal/15 text-teal",
      scheduled: "bg-accent/15 text-accent",
      minting: "bg-accent/15 text-accent",
      completed: "bg-accent/15 text-accent border border-accent/30",
      minted: "bg-accent/15 text-accent border border-accent/30",
      failed: "bg-destructive/15 text-destructive border border-destructive/30",
      error: "bg-destructive/15 text-destructive border border-destructive/30",
    }
    return colors[status] || colors.idle
  }

  return (
    <Card className="paper-card">
      <CardHeader>
        <CardTitle>Wallet Management</CardTitle>
        <CardDescription>Monitor and manage your minting wallets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats grid — responsive */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-secondary/30 p-3 rounded-md border border-border/30">
            <p className="text-xs text-muted-foreground">Total Wallets</p>
            <p className="text-lg sm:text-xl font-bold">{wallets.length}</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-md border border-border/30">
            <p className="text-xs text-muted-foreground">Funded</p>
            <p className="text-lg sm:text-xl font-bold">{fundedCount}</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-md border border-border/30">
            <p className="text-xs text-muted-foreground">Total Mints</p>
            <p className="text-lg sm:text-xl font-bold">{totalMints}</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-md border border-border/30">
            <p className="text-xs text-muted-foreground">Total Balance</p>
            <p className="text-lg sm:text-xl font-bold">{totalBalance.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">CELO</span></p>
          </div>
        </div>

        {/* Wallets table — scrollable on mobile */}
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Wallet Address</th>
                <th className="px-4 py-3 text-left font-medium">Balance</th>
                <th className="px-4 py-3 text-left font-medium">Funded</th>
                <th className="px-4 py-3 text-left font-medium">Mints</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedWallets.length > 0 ? (
                paginatedWallets.map((wallet) => (
                  <tr key={wallet.address} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-4 py-3 font-mono text-xs">
                      {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                    </td>
                    <td className="px-4 py-3">{wallet.balance} CELO</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      {getStatusIcon(wallet.fundingStatus || "not_funded")}
                      <span className="text-xs capitalize">{wallet.fundingStatus || "not_funded"}</span>
                    </td>
                    <td className="px-4 py-3">{wallet.mintsCompleted || 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusBadgeColor(wallet.status || "idle")}`}
                      >
                        {wallet.status || "idle"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No wallets generated yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={exportCSV}
            disabled={wallets.length === 0}
            variant="outline"
            className="flex-1 bg-transparent"
          >
            Export as CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
