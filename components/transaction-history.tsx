"use client"

import { ArrowUpRight, Receipt } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/app/copy-button"
import { EmptyState } from "@/components/app/empty-state"
import { StatusBadge, labelForStatus, toneForStatus } from "@/components/app/status-badge"
import { explorerTxUrl, shortAddress, type ChainConfig } from "@/lib/chains"
import type { Transaction } from "@/lib/types"

interface TransactionHistoryProps {
  transactions: Transaction[]
  chain: ChainConfig
  /** Show only the newest N rows (used on the overview). */
  limit?: number
  title?: string
  description?: string
}

function HashCell({ hash, chain }: { hash: string; chain: ChainConfig }) {
  const url = explorerTxUrl(chain, hash)
  const isHash = url !== null
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs" title={hash}>
        {isHash ? shortAddress(hash, 10, 8) : hash}
      </span>
      {isHash && <CopyButton value={hash} label="Hash" />}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="View on block explorer"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </span>
  )
}

export function TransactionHistory({
  transactions,
  chain,
  limit,
  title = "Transaction History",
  description,
}: TransactionHistoryProps) {
  const rows = typeof limit === "number" ? transactions.slice(0, limit) : transactions

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-5">
        <CardTitle>
          {title} ({transactions.length})
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      {rows.length === 0 ? (
        <CardContent className="px-5">
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Mints appear here as soon as they are sent."
          />
        </CardContent>
      ) : (
        <>
          {/* Table from tablet up */}
          <div className="hidden max-h-96 overflow-auto md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Hash</th>
                  <th scope="col" className="px-5 py-3 font-medium">Wallet</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx, i) => (
                  <tr key={i} className="border-t transition-colors duration-150 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <HashCell hash={tx.hash} chain={chain} />
                      {tx.detail && <span className="mt-0.5 block max-w-72 truncate text-xs text-muted-foreground" title={tx.detail}>{tx.detail}</span>}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{shortAddress(tx.wallet, 10, 8)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={toneForStatus(tx.status)}>{labelForStatus(tx.status)}</StatusBadge>
                      {tx.error && <span className="mt-1 block max-w-64 truncate text-xs text-muted-foreground" title={tx.error}>{tx.error}</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stacked cards on phones */}
          <ul className="max-h-[28rem] divide-y overflow-auto md:hidden">
            {rows.map((tx, i) => (
              <li key={i} className="space-y-2 px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge tone={toneForStatus(tx.status)}>{labelForStatus(tx.status)}</StatusBadge>
                  <span className="text-xs text-muted-foreground tabular-nums">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                </div>
                <HashCell hash={tx.hash} chain={chain} />
                {tx.detail && <p className="text-xs text-muted-foreground">{tx.detail}</p>}
                <p className="font-mono text-xs text-muted-foreground">{shortAddress(tx.wallet, 10, 8)}</p>
                {tx.error && <p className="text-xs text-muted-foreground">{tx.error}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
