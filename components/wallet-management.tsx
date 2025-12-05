"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
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
  const totalGasUsed = (wallets.length * 0.1).toFixed(2)

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

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: "bg-muted text-muted-foreground",
      funding: "bg-blue-500/20 text-blue-300",
      scheduled: "bg-yellow-500/20 text-yellow-300",
      minting: "bg-purple-500/20 text-purple-300",
      completed: "bg-green-500/20 text-green-400 border border-green-500/30",
      minted: "bg-green-500/20 text-green-400 border border-green-500/30",
      failed: "bg-red-500/20 text-red-400 border border-red-500/30",
      error: "bg-red-500/20 text-red-400 border border-red-500/30",
    }
    return colors[status] || colors.idle
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle>Wallet Management</CardTitle>
        <CardDescription>Monitor and manage your minting wallets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-secondary/30 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Total Wallets</p>
            <p className="text-xl font-bold">{wallets.length}</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Total Balance</p>
            <p className="text-xl font-bold">{totalBalance.toFixed(2)} CELO</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Total Mints</p>
            <p className="text-xl font-bold">{totalMints}</p>
          </div>
          <div className="bg-secondary/30 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Gas Used</p>
            <p className="text-xl font-bold">{totalGasUsed} CELO</p>
          </div>
        </div>

        {/* Wallets Table */}
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Wallet Address</th>
                <th className="px-4 py-3 text-left font-medium">Balance</th>
                <th className="px-4 py-3 text-left font-medium">Mints</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Next Mint</th>
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
                    <td className="px-4 py-3">{wallet.mintsCompleted || 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusBadgeColor(wallet.status || "idle")}`}
                      >
                        {(wallet.status === "completed" || wallet.status === "minted") && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        {(wallet.status === "failed" || wallet.status === "error") && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        {wallet.status || "idle"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {wallet.nextMintTime ? new Date(wallet.nextMintTime).toLocaleTimeString() : "Not scheduled"}
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

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
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
