"use client"

import { useEffect, useMemo, useState } from "react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { AlertCircle, ArrowLeftRight, Loader2, Search } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/app/native-select"
import { StatusBadge } from "@/components/app/status-badge"
import { SummaryCard, SummaryRow } from "@/components/app/summary-card"
import { JobsList } from "@/components/jobs-list"
import { defaultStart } from "@/components/scheduler-section"
import { TokenInfoCard } from "@/components/token-info-card"
import { api } from "@/lib/api-client"
import { shortAddress, type ChainConfig } from "@/lib/chains"
import { cn } from "@/lib/utils"
import type { BalanceRow, BatchInfo, JobView, MintWallet, QuotePreview, TokenInfoView } from "@/lib/types"

type Tab = "buy" | "sell" | "transfer"

interface TradeSectionProps {
  chain: ChainConfig
  batches: BatchInfo[]
  selectedBatchId: string
  wallets: MintWallet[]
  onCreate: (payload: Record<string, unknown>) => Promise<boolean>
  jobs: JobView[]
  onCancel: (jobId: string) => void
  cancellingId?: string
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-10 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
            value === v ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))

export function TradeSection({ chain, batches, selectedBatchId, wallets, onCreate, jobs, onCancel, cancellingId }: TradeSectionProps) {
  // token
  const [tokenInput, setTokenInput] = useState("")
  const [info, setInfo] = useState<TokenInfoView | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [infoError, setInfoError] = useState("")

  // action
  const [tab, setTab] = useState<Tab>("buy")
  const [buyAmount, setBuyAmount] = useState("0.01")
  const [sellPercent, setSellPercent] = useState(100)
  const [asset, setAsset] = useState<"native" | "token">("native")
  const [mode, setMode] = useState<"fixed" | "all">("all")
  const [amount, setAmount] = useState("")
  const [destType, setDestType] = useState<"address" | "batch">("address")
  const [destAddress, setDestAddress] = useState("")
  const [destBatchId, setDestBatchId] = useState("")
  const [pairing, setPairing] = useState<"sequential" | "random">("sequential")

  // safety + timing
  const [slippage, setSlippage] = useState("3")
  const [maxImpact, setMaxImpact] = useState("10")
  const [concurrency, setConcurrency] = useState(5)
  const [startMode, setStartMode] = useState<"now" | "later">("now")
  const [startAt, setStartAt] = useState(defaultStart)

  // checks
  const [balances, setBalances] = useState<BalanceRow[] | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [quote, setQuote] = useState<QuotePreview | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const batch = batches.find((b) => b.id === selectedBatchId)
  const walletCount = batch?.walletCount ?? wallets.length
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const needsToken = tab !== "transfer" || asset === "token"
  const decimals = info?.decimals ?? 18
  const symbol = info?.symbol || "token"

  // A different network or token invalidates everything that was looked up.
  useEffect(() => {
    setInfo(null)
    setInfoError("")
    setBalances(null)
    setQuote(null)
    setConfirming(false)
  }, [chain.id])
  useEffect(() => {
    setQuote(null)
    setQuoteError("")
    setConfirming(false)
  }, [tab, buyAmount, sellPercent, slippage, asset, mode, amount, destType, destAddress, destBatchId, pairing, startMode, startAt])

  const lookup = async () => {
    setLoadingInfo(true)
    setInfoError("")
    setInfo(null)
    setBalances(null)
    try {
      setInfo(await api<TokenInfoView>(`/api/token/info?chainId=${chain.chainId}&address=${encodeURIComponent(tokenInput.trim())}`))
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : "Could not read this token")
    } finally {
      setLoadingInfo(false)
    }
  }

  const loadBalances = async (): Promise<BalanceRow[] | null> => {
    if (!selectedBatchId) return null
    setLoadingBalances(true)
    try {
      const data = await api<{ rows: BalanceRow[] }>("/api/trade/balances", { method: "POST", json: { chainId: chain.chainId, batchId: selectedBatchId, token: info?.address } })
      setBalances(data.rows)
      return data.rows
    } catch (e) {
      toast.error("Could not read balances", { description: e instanceof Error ? e.message : undefined })
      return null
    } finally {
      setLoadingBalances(false)
    }
  }

  const previewQuote = async () => {
    if (!info) return
    setQuoting(true)
    setQuoteError("")
    setQuote(null)
    try {
      let walletId = wallets[0]?.id
      if (tab === "sell") {
        const rows = balances ?? (await loadBalances())
        const best = rows && [...rows].filter((r) => Number(r.token) > 0).sort((a, b) => Number(b.token) - Number(a.token))[0]
        if (!best) throw new Error("None of the wallets in this batch hold this token yet")
        walletId = best.walletId
      }
      if (!walletId) throw new Error("Select a batch with wallets first")
      setQuote(
        await api<QuotePreview>("/api/trade/quote", {
          method: "POST",
          json: { chainId: chain.chainId, side: tab, token: info.address, amount: tab === "buy" ? buyAmount : undefined, percent: tab === "sell" ? sellPercent : undefined, slippage: num(slippage) ?? 3, walletId },
        }),
      )
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : "No quote")
    } finally {
      setQuoting(false)
    }
  }

  // ---- validation + payload
  const amountNum = num(tab === "buy" ? buyAmount : amount)
  const slip = num(slippage)
  const impact = num(maxImpact)
  const startDate = startMode === "later" ? new Date(startAt) : null
  const startInvalid = startMode === "later" && (!startAt || Number.isNaN(startDate!.getTime()))

  let problem = ""
  if (!selectedBatchId || walletCount === 0) problem = "Select a batch with wallets first (Batches page)"
  else if (needsToken && !info) problem = "Look up a token first"
  else if (needsToken && info && !info.isContract) problem = "There is no contract at that address on this network"
  else if (tab === "buy" && !(amountNum && amountNum > 0)) problem = "Enter an amount to spend per wallet"
  else if (tab === "transfer" && mode === "fixed" && !(amountNum && amountNum > 0)) problem = "Enter an amount per wallet"
  else if (tab === "transfer" && destType === "address" && !ethers.isAddress(destAddress.trim())) problem = "Enter a valid destination address"
  else if (tab === "transfer" && destType === "batch" && !destBatchId) problem = "Choose a destination batch"
  else if (tab !== "transfer" && (slip === null || slip < 0.1 || slip > 30)) problem = "Slippage must be between 0.1% and 30%"
  else if (tab !== "transfer" && (impact === null || impact < 0.5 || impact > 50)) problem = "Max price impact must be between 0.5% and 50%"
  else if (startInvalid) problem = "Pick a start time"

  const buildPayload = (): Record<string, unknown> => {
    const base = { batchId: selectedBatchId, chainId: chain.chainId, runAt: startMode === "later" ? startDate!.toISOString() : null, concurrency }
    if (tab === "buy") {
      return { ...base, kind: "buy", token: info!.address, amountWei: ethers.parseUnits(buyAmount, 18).toString(), amountDisplay: buyAmount, slippage: slip, maxImpact: impact, symbol: info!.symbol ?? undefined }
    }
    if (tab === "sell") return { ...base, kind: "sell", token: info!.address, percent: sellPercent, slippage: slip, maxImpact: impact, symbol: info!.symbol ?? undefined }
    const unitDecimals = asset === "native" ? 18 : decimals
    return {
      ...base,
      kind: "transfer",
      asset,
      token: asset === "token" ? info!.address : undefined,
      mode,
      amountWei: mode === "fixed" ? ethers.parseUnits(amount, unitDecimals).toString() : undefined,
      amountDisplay: mode === "fixed" ? amount : undefined,
      symbol: asset === "token" ? info!.symbol ?? undefined : undefined,
      destination: destType === "address" ? { type: "address", address: destAddress.trim() } : { type: "batch", batchId: destBatchId, pairing },
    }
  }

  const submit = async () => {
    setSubmitting(true)
    let payload: Record<string, unknown>
    try {
      payload = buildPayload()
    } catch {
      toast.error("Check the amount", { description: "That amount has too many decimals or is not a number" })
      setSubmitting(false)
      return
    }
    const ok = await onCreate(payload)
    setSubmitting(false)
    if (ok) {
      setConfirming(false)
      setQuote(null)
    }
  }

  const totalSpend = tab === "buy" && amountNum ? amountNum * walletCount : null
  const tradeJobs = jobs.filter((j) => j.kind !== "mint")
  const actionLabel = tab === "buy" ? "Buy" : tab === "sell" ? "Sell" : "Transfer"

  return (
    <div className="space-y-6">
      {/* Token lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Token</CardTitle>
          <CardDescription>
            Paste a token contract address on {chain.name}. Change the network at the top if it lives elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tokenInput.trim() && !loadingInfo && lookup()}
              placeholder="0x..."
              aria-label="Token contract address"
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <Button onClick={lookup} disabled={loadingInfo || !tokenInput.trim()}>
              {loadingInfo ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              Look up
            </Button>
          </div>
          {infoError && (
            <Alert variant="destructive" className="bg-danger-soft border-danger/30">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{infoError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {info && <TokenInfoCard info={info} chain={chain} />}

      {/* Action */}
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">What to do</CardTitle>
            <CardDescription>Every wallet in the selected batch takes part.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Segmented<Tab>
              label="Action"
              value={tab}
              onChange={setTab}
              options={[
                ["buy", "Buy"],
                ["sell", "Sell"],
                ["transfer", "Transfer"],
              ]}
            />

            {tab === "buy" && (
              <div className="space-y-2">
                <Label htmlFor="buy-amount">Spend per wallet ({chain.nativeSymbol})</Label>
                <Input id="buy-amount" inputMode="decimal" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="tabular-nums" />
                <p className="text-xs text-muted-foreground">Each wallet also needs a little extra {chain.nativeSymbol} for gas.</p>
              </div>
            )}

            {tab === "sell" && (
              <div className="space-y-2">
                <Label htmlFor="sell-percent">Sell per wallet (% of its balance)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={sellPercent === p}
                      onClick={() => setSellPercent(p)}
                      className={cn(
                        "h-10 min-w-14 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                        sellPercent === p ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                  <Input
                    id="sell-percent"
                    type="number"
                    min={1}
                    max={100}
                    value={sellPercent}
                    onChange={(e) => setSellPercent(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-24 tabular-nums"
                  />
                </div>
              </div>
            )}

            {tab === "transfer" && (
              <>
                <div className="space-y-2">
                  <Label>What to send</Label>
                  <Segmented<"native" | "token"> label="Asset" value={asset} onChange={setAsset} options={[["native", chain.nativeSymbol], ["token", info?.symbol ? `${info.symbol} (token above)` : "The token above"]]} />
                </div>
                <div className="space-y-2">
                  <Label>How much, per wallet</Label>
                  <Segmented<"all" | "fixed"> label="Amount mode" value={mode} onChange={setMode} options={[["all", "Everything"], ["fixed", "A set amount"]]} />
                  {mode === "fixed" && <Input inputMode="decimal" aria-label="Amount per wallet" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" className="tabular-nums" />}
                  {mode === "all" && asset === "native" && <p className="text-xs text-muted-foreground">Sends the whole balance minus a small amount kept for the network fee.</p>}
                </div>
                <div className="space-y-2">
                  <Label>Send to</Label>
                  <Segmented<"address" | "batch"> label="Destination" value={destType} onChange={setDestType} options={[["address", "One address"], ["batch", "Wallets in a batch"]]} />
                  {destType === "address" ? (
                    <Input value={destAddress} onChange={(e) => setDestAddress(e.target.value)} placeholder="0x... (every wallet sends here)" className="font-mono text-sm" aria-label="Destination address" autoComplete="off" spellCheck={false} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NativeSelect value={destBatchId} onChange={(e) => setDestBatchId(e.target.value)} aria-label="Destination batch">
                        <option value="">Choose a batch</option>
                        {batches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.walletCount}){b.id === selectedBatchId ? " - same batch" : ""}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect value={pairing} onChange={(e) => setPairing(e.target.value as "sequential" | "random")} aria-label="Pairing">
                        <option value="sequential">In order (1st to 1st, 2nd to 2nd...)</option>
                        <option value="random">Shuffled</option>
                      </NativeSelect>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab !== "transfer" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slippage">Slippage (%)</Label>
                  <Input id="slippage" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} className="tabular-nums" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="impact">Stop if price impact is above (%)</Label>
                  <Input id="impact" inputMode="decimal" value={maxImpact} onChange={(e) => setMaxImpact(e.target.value)} className="tabular-nums" />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trade-concurrency">Wallets acting at the same time</Label>
                <Input id="trade-concurrency" type="number" min={1} max={50} value={concurrency} onChange={(e) => setConcurrency(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} className="tabular-nums" />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm leading-none font-medium">Start</legend>
                <Segmented<"now" | "later"> label="Start" value={startMode} onChange={setStartMode} options={[["now", "Now"], ["later", "At a time"]]} />
              </fieldset>
            </div>
            {startMode === "later" && (
              <div className="space-y-1.5">
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Start date and time" />
                <p className="text-xs text-muted-foreground">Your device&apos;s time zone: {timeZone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <SummaryCard
          className="lg:col-span-2"
          title="Summary"
          description="Check this before you start."
          badge={<StatusBadge tone="neutral">{chain.name}</StatusBadge>}
          footer={
            <>
              {tab !== "transfer" && (
                <Button variant="outline" className="w-full" onClick={previewQuote} disabled={!info || quoting || !!problem}>
                  {quoting && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Preview a quote (spends nothing)
                </Button>
              )}
              {quote && (
                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p>
                    {quote.amountIn} {quote.inSymbol} gets about <span className="font-semibold">{Number(quote.expectedOut).toLocaleString("en", { maximumSignificantDigits: 6 })} {quote.outSymbol}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    At least {Number(quote.minOut).toLocaleString("en", { maximumSignificantDigits: 6 })} after slippage
                    {quote.priceImpactPct !== null && ` · price impact ${quote.priceImpactPct.toFixed(2)}%`} · router {shortAddress(quote.router, 6, 4)}
                  </p>
                </div>
              )}
              {quoteError && <p className="text-sm text-danger">{quoteError}</p>}
              {problem && <p className="text-xs text-muted-foreground">{problem}</p>}

              {confirming ? (
                <div className="space-y-2">
                  <Alert variant="warning">
                    <AlertCircle aria-hidden="true" />
                    <AlertDescription>
                      {tab === "buy" && totalSpend !== null
                        ? `This spends about ${totalSpend.toLocaleString("en", { maximumSignificantDigits: 8 })} ${chain.nativeSymbol} across ${walletCount} wallets, plus gas. Trades cannot be undone.`
                        : `This sends real transactions from ${walletCount} wallets. They cannot be undone.`}
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button size="lg" className="flex-1" onClick={submit} disabled={submitting}>
                      {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {startMode === "now" ? "Confirm and start" : "Confirm and schedule"}
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setConfirming(true)} disabled={!!problem}>
                  <ArrowLeftRight aria-hidden="true" />
                  Review {actionLabel.toLowerCase()}
                </Button>
              )}
            </>
          }
        >
          <SummaryRow label="Batch" value={batch ? batch.name : "None"} />
          <SummaryRow label="Wallets" value={walletCount} />
          <SummaryRow label="Action" value={actionLabel} />
          {needsToken && <SummaryRow label="Token" value={info?.symbol ? `${info.symbol} ${shortAddress(info.address, 4, 4)}` : "Not looked up"} />}
          {tab === "buy" && <SummaryRow label="Per wallet" value={`${buyAmount || "0"} ${chain.nativeSymbol}`} />}
          {tab === "buy" && <SummaryRow label="Total to spend" value={totalSpend !== null ? `${totalSpend.toLocaleString("en", { maximumSignificantDigits: 8 })} ${chain.nativeSymbol}` : "-"} strong />}
          {tab === "sell" && <SummaryRow label="Per wallet" value={`${sellPercent}% of balance`} />}
          {tab === "transfer" && <SummaryRow label="Per wallet" value={mode === "all" ? "Everything" : `${amount || "0"} ${asset === "native" ? chain.nativeSymbol : symbol}`} />}
          {tab === "transfer" && <SummaryRow label="To" value={destType === "address" ? (ethers.isAddress(destAddress.trim()) ? shortAddress(destAddress.trim(), 6, 4) : "-") : batches.find((b) => b.id === destBatchId)?.name || "-"} mono={destType === "address"} />}
          {tab !== "transfer" && <SummaryRow label="Slippage" value={`${slippage || "?"}%`} />}
          <SummaryRow label="Starts" value={startMode === "now" ? "Immediately" : startInvalid ? "Pick a time" : startDate!.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} />
        </SummaryCard>
      </div>

      {/* Balances */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-5">
          <div className="space-y-1.5">
            <CardTitle>Wallet balances</CardTitle>
            <CardDescription>{info ? `${chain.nativeSymbol} and ${info.symbol || "token"} in each wallet.` : `${chain.nativeSymbol} in each wallet.`}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadBalances} disabled={loadingBalances || !selectedBatchId}>
            {loadingBalances && <Loader2 className="animate-spin" aria-hidden="true" />}
            {balances ? "Refresh" : "Check balances"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!balances ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Press Check balances to read them from {chain.name}.</p>
          ) : (
            <ul className="max-h-80 divide-y overflow-auto">
              {balances.map((r) => (
                <li key={r.walletId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="font-mono text-xs">{shortAddress(r.address, 8, 6)}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {r.error ? "could not read" : `${Number(r.native).toLocaleString("en", { maximumSignificantDigits: 5 })} ${chain.nativeSymbol}`}
                    {r.token !== null && !r.error && ` · ${Number(r.token).toLocaleString("en", { maximumSignificantDigits: 6 })} ${symbol}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Jobs */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-5">
          <CardTitle>Trade jobs</CardTitle>
          <CardDescription>Live progress. They keep running on the server if you close the app.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <JobsList jobs={tradeJobs} onCancel={onCancel} cancellingId={cancellingId} emptyHint="Buys, sells and transfers you start appear here." />
        </CardContent>
      </Card>
    </div>
  )
}
