"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ethers } from "ethers"
import { toast } from "sonner"
import { ArrowLeftRight, ArrowRight, CircleDollarSign, Fuel, KeyRound, Loader2, Minus, Plus, ShieldAlert, Sparkles, WalletCards, CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { api } from "@/lib/api-client"
import { CHAINS, DEFAULT_CHAIN_ID, getChain } from "@/lib/chains"
import { CONTRACT_CONFIG } from "@/lib/contract-config"
import { clearLegacyStorage, readLegacyWallets } from "@/lib/legacy-storage"
import type { BalanceRow, BatchInfo, Branding, JobView, LegacyWallet, MintWallet, Transaction, WalletFamily } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppShell } from "@/components/app/app-shell"
import { ChainPicker } from "@/components/app/chain-picker"
import { ConnectWalletButton } from "@/components/app/connect-wallet-button"
import { EmptyState } from "@/components/app/empty-state"
import { getNavItem, type ViewId } from "@/components/app/nav"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { LiveConsole } from "@/components/app/live-console"
import { Ticker } from "@/components/app/ticker"
import { WalletDrawer } from "./wallet-drawer"
import { AutoFundingSection } from "./auto-funding-section"
import { BatchesSection } from "./batches-section"
import { MintingSection } from "./minting-section"
import { SchedulerSection, type NewJobInput } from "./scheduler-section"
import { SettingsSection } from "./settings-section"
import { TradeSection } from "./trade-section"
import { TransactionHistory } from "./transaction-history"
import { WalletManagement } from "./wallet-management"

interface ApiWallet {
  id: string
  family?: WalletFamily
  batchId: string | null
  address: string
  fundingStatus: MintWallet["fundingStatus"]
  status: string
  mintsCompleted: number
  balance: string
}

const toMintWallet = (w: ApiWallet): MintWallet => ({
  id: w.id,
  family: w.family ?? "evm",
  batchId: w.batchId,
  address: w.address,
  funded: w.fundingStatus === "funded",
  fundingStatus: w.fundingStatus,
  mintsCompleted: w.mintsCompleted,
  balance: w.balance,
  status: w.status,
})

declare global {
  interface Window {
    ethereum?: any
  }
}

export default function Dashboard() {
  const router = useRouter()

  // Data. Wallets are stored encrypted on the server; the browser only ever sees addresses.
  const [wallets, setWallets] = useState<MintWallet[]>([])
  const [batches, setBatches] = useState<BatchInfo[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState("")
  const [jobs, setJobs] = useState<JobView[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [brand, setBrand] = useState<Branding>({ name: "Mintition", hasLogo: false, logoVersion: 0 })

  // Inputs
  const [generatedCount, setGeneratedCount] = useState(5)
  const [batchName, setBatchName] = useState("")
  const [contractAddress, setContractAddress] = useState<string>(CONTRACT_CONFIG.address)
  const [networkId, setNetworkId] = useState(DEFAULT_CHAIN_ID)
  const [concurrency, setConcurrency] = useState(10)

  // Status
  const [hydrated, setHydrated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isStartingMint, setIsStartingMint] = useState(false)
  const [cancellingId, setCancellingId] = useState("")
  const [connectedAddress, setConnectedAddress] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [activeView, setActiveView] = useState<ViewId>("dashboard")
  const [legacyLocal, setLegacyLocal] = useState<LegacyWallet[]>([])
  const [legacyServerBatches, setLegacyServerBatches] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [balances, setBalances] = useState<Record<string, BalanceRow> | null>(null)
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [drawerWallet, setDrawerWallet] = useState<MintWallet | null>(null)
  const [importText, setImportText] = useState("")
  const [isImportingKeys, setIsImportingKeys] = useState(false)

  const activeChain = getChain(networkId)

  const walletsRef = useRef(wallets)
  walletsRef.current = wallets

  // ---------- loaders ----------
  const loadWallets = useCallback(async (batchId: string) => {
    const data = await api<{ wallets: ApiWallet[] }>(`/api/wallets?batchId=${encodeURIComponent(batchId)}`)
    setWallets(data.wallets.map(toMintWallet))
  }, [])

  const refreshBatches = useCallback(async () => {
    const data = await api<{ batches: BatchInfo[] }>("/api/batches")
    setBatches(data.batches)
    return data.batches
  }, [])

  const refreshJobs = useCallback(async () => {
    const data = await api<{ jobs: JobView[] }>("/api/jobs")
    setJobs(data.jobs)
    return data.jobs
  }, [])

  const refreshTransactions = useCallback(async () => {
    const data = await api<{ transactions: Transaction[] }>("/api/transactions")
    setTransactions(data.transactions)
  }, [])

  useEffect(() => {
    setLegacyLocal(readLegacyWallets())
    createClient()
      .auth.getUser()
      .then(({ data }) => data.user?.email && setUserEmail(data.user.email))

    ;(async () => {
      try {
        const [loadedBatches] = await Promise.all([refreshBatches(), refreshJobs(), refreshTransactions(), api<Branding>("/api/branding").then(setBrand)])
        if (loadedBatches[0]) {
          setSelectedBatchId(loadedBatches[0].id)
          await loadWallets(loadedBatches[0].id)
        }
        api<{ database: { legacyPlaintextBatches: number } }>("/api/security/status")
          .then((s) => setLegacyServerBatches(s.database.legacyPlaintextBatches))
          .catch(() => undefined)
      } catch (error) {
        toast.error("Could not load your data", { description: error instanceof Error ? error.message : undefined })
      } finally {
        setHydrated(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live progress: poll while a job is running (fast) or waiting for its start time (slow).
  const hasRunning = jobs.some((j) => j.status === "running")
  const hasScheduled = jobs.some((j) => j.status === "scheduled")
  useEffect(() => {
    if (!hasRunning && !hasScheduled) return
    const tick = async () => {
      try {
        await Promise.all([refreshJobs(), refreshTransactions(), selectedBatchId ? loadWallets(selectedBatchId) : Promise.resolve()])
      } catch {
        /* try again on the next tick */
      }
    }
    const timer = setInterval(tick, hasRunning ? 4000 : 20000)
    return () => clearInterval(timer)
  }, [hasRunning, hasScheduled, selectedBatchId, refreshJobs, refreshTransactions, loadWallets])

  // Opening a page that shows jobs or transactions: refresh them once.
  useEffect(() => {
    if (!hydrated) return
    if (activeView === "mint" || activeView === "schedule" || activeView === "transactions" || activeView === "dashboard") {
      refreshJobs().catch(() => undefined)
      refreshTransactions().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

  // The active batch must hold the same kind of wallet as the active network (EVM or Solana).
  useEffect(() => {
    if (!hydrated) return
    const current = batches.find((b) => b.id === selectedBatchId)
    if (current && current.family === activeChain.family) return
    const next = batches.find((b) => b.family === activeChain.family)
    if (next) {
      setSelectedBatchId(next.id)
      loadWallets(next.id).catch(() => undefined)
    } else {
      setSelectedBatchId("")
      setWallets([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain.family, batches, hydrated])

  // Live balances for the active batch on the active network.
  const loadBalances = useCallback(async () => {
    if (!selectedBatchId || wallets.length === 0 || wallets[0]?.family !== activeChain.family) return
    setLoadingBalances(true)
    try {
      const data = await api<{ rows: BalanceRow[]; nativePriceUsd: number | null }>("/api/trade/balances", {
        method: "POST",
        json: { chainId: activeChain.chainId, batchId: selectedBatchId },
      })
      setBalances(Object.fromEntries(data.rows.map((r) => [r.walletId, r])))
      setNativePriceUsd(data.nativePriceUsd)
    } catch (error) {
      toast.error("Could not read balances", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setLoadingBalances(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId, wallets.length, activeChain.chainId, activeChain.family])

  useEffect(() => {
    setBalances(null)
  }, [selectedBatchId, activeChain.chainId])

  useEffect(() => {
    if (!hydrated || (activeView !== "wallets" && activeView !== "dashboard")) return
    loadBalances()
    const timer = setInterval(loadBalances, 45_000)
    return () => clearInterval(timer)
  }, [hydrated, activeView, loadBalances])

  const importKeys = async () => {
    const keys = importText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (keys.length === 0) return
    setIsImportingKeys(true)
    try {
      const result = await api<{ batchId: string; imported: number }>("/api/wallets/import", {
        method: "POST",
        json: { family: activeChain.family, name: "Imported wallets", wallets: keys.map((privateKey) => ({ address: "", privateKey })) },
      })
      setImportText("")
      await refreshBatches()
      setSelectedBatchId(result.batchId)
      await loadWallets(result.batchId)
      toast.success("Wallets imported", { description: `${result.imported} encrypted and saved.` })
    } catch (error) {
      toast.error("Import failed", { description: error instanceof Error ? error.message : "Check the keys" })
    } finally {
      setIsImportingKeys(false)
    }
  }

  // ---------- account ----------
  const handleLogout = async () => {
    try {
      await createClient().auth.signOut()
      toast.success("Logged out successfully")
      router.push("/auth/login")
      router.refresh()
    } catch (error) {
      toast.error("Failed to logout", { description: error instanceof Error ? error.message : "Unknown error" })
    }
  }

  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      toast.error("MetaMask not installed", { description: "Please install MetaMask from https://metamask.io" })
      return
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" })
      setConnectedAddress(accounts[0])
      toast.success("Wallet connected", { description: `Connected to ${accounts[0].slice(0, 10)}...` })
    } catch (error: any) {
      if (error.code === -32002) toast.error("MetaMask request pending", { description: "Check your MetaMask popup" })
      else if (error.code === 4001) toast.error("Connection rejected", { description: "You rejected the connection request" })
      else toast.error("Connection failed", { description: error.message || "Failed to connect wallet" })
    }
  }

  // ---------- wallets ----------
  const generateWallets = async () => {
    setIsGenerating(true)
    try {
      const data = await api<{ batchId: string; wallets: ApiWallet[] }>("/api/wallets", {
        method: "POST",
        json: { count: generatedCount, name: batchName.trim() || undefined, family: activeChain.family },
      })
      setWallets(data.wallets.map(toMintWallet))
      setSelectedBatchId(data.batchId)
      setBatchName("")
      await refreshBatches()
      toast.success(`Generated ${generatedCount} ${activeChain.family === "solana" ? "Solana" : "EVM"} wallets`, { description: "Encrypted and saved. You can reuse them any time." })
    } catch (error) {
      toast.error("Generation failed", { description: error instanceof Error ? error.message : "Failed to generate wallets" })
    } finally {
      setIsGenerating(false)
    }
  }

  const loadBatch = async (batchId: string) => {
    try {
      await loadWallets(batchId)
      setSelectedBatchId(batchId)
      toast.success("Batch loaded", { description: "Its wallets are now in use on the other pages" })
    } catch (error) {
      toast.error("Failed to load batch", { description: error instanceof Error ? error.message : "Could not load wallets" })
    }
  }

  /** Called by auto-funding. Keeps the screen in sync and saves final funding results to the vault. */
  const handleUpdateWallets = (updated: MintWallet[]) => {
    const before = new Map<string, MintWallet>(walletsRef.current.map((w) => [w.id, w] as [string, MintWallet]))
    setWallets(updated)
    const changes = updated
      .filter((w) => {
        const b = before.get(w.id)
        return b && w.fundingStatus !== "funding" && (b.fundingStatus !== w.fundingStatus || b.balance !== w.balance)
      })
      .map((w) => ({ id: w.id, fundingStatus: w.fundingStatus, balance: w.balance }))
    if (changes.length) {
      api("/api/wallets/funding", { method: "POST", json: { updates: changes } }).catch(() =>
        toast.error("Could not save funding status", { description: "The funds were sent, but the status was not saved." }),
      )
    }
  }

  const importLegacyWallets = async () => {
    setIsImporting(true)
    try {
      const result = await api<{ batchId: string; imported: number }>("/api/wallets/import", {
        method: "POST",
        json: { name: "Imported from this browser", wallets: legacyLocal },
      })
      clearLegacyStorage()
      setLegacyLocal([])
      await refreshBatches()
      setSelectedBatchId(result.batchId)
      await loadWallets(result.batchId)
      toast.success("Wallets secured", { description: `${result.imported} wallets are now encrypted, and the unencrypted copy was removed from this browser.` })
    } catch (error) {
      toast.error("Could not move the wallets", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setIsImporting(false)
    }
  }

  // ---------- minting (runs on the server) ----------

  const submitJob = async (input: NewJobInput): Promise<boolean> => {
    if (!ethers.isAddress(input.contractAddress)) {
      toast.error("Contract address required", { description: "Enter a valid contract address" })
      return false
    }
    try {
      await api("/api/jobs", { method: "POST", json: { ...input, chainId: Number(activeChain.id) } })
      await Promise.all([refreshJobs(), refreshTransactions()])
      toast.success(input.runAt ? "Minting scheduled" : "Minting started", { description: "It runs on the server. You can close this page." })
      return true
    } catch (error) {
      toast.error("Could not start minting", { description: error instanceof Error ? error.message : undefined })
      return false
    }
  }

  /** Buy / sell / transfer jobs from the Trade page (the payload is built and checked there). */
  const submitTradeJob = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      await api("/api/jobs", { method: "POST", json: payload })
      await Promise.all([refreshJobs(), refreshTransactions()])
      toast.success(payload.runAt ? "Scheduled" : "Started", { description: "It runs on the server. You can close this page." })
      return true
    } catch (error) {
      toast.error("Could not start", { description: error instanceof Error ? error.message : undefined })
      return false
    }
  }

  const startMinting = async () => {
    if (!selectedBatchId) {
      toast.error("No wallets selected", { description: "Generate wallets or load a batch first" })
      return
    }
    setIsStartingMint(true)
    await submitJob({ name: "", contractAddress, batchId: selectedBatchId, runAt: null, concurrency, mintsPerWallet: 1 })
    setIsStartingMint(false)
  }

  const cancelJob = async (jobId: string) => {
    setCancellingId(jobId)
    try {
      await api(`/api/jobs/${jobId}/cancel`, { method: "POST" })
      await refreshJobs()
      toast.info("Minting cancelled", { description: "Transactions already sent will still finish on chain." })
    } catch (error) {
      toast.error("Could not cancel", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setCancellingId("")
    }
  }

  // ---------- derived ----------
  const fundedWalletCount = wallets.filter((w) => w.fundingStatus === "funded").length
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)
  const liveNative: number | null = balances ? (Object.values(balances) as BalanceRow[]).reduce((sum: number, b: BalanceRow) => sum + Number(b.native || 0), 0) : null
  const liveUsd: number | null = liveNative !== null && nativePriceUsd !== null ? liveNative * Number(nativePriceUsd) : null
  const page = getNavItem(activeView)
  const brandProps = { name: brand.name, logoUrl: brand.hasLogo ? `/api/branding/logo?v=${brand.logoVersion}` : null }

  const statCards = (
    <>
      <StatCard icon={WalletCards} label="Wallets" value={wallets.length} numeric={{ value: wallets.length }} helper={`${activeChain.family === "solana" ? "Solana" : "EVM"} batch in use`} loading={!hydrated} />
      <StatCard icon={CheckCircle2} label="Funded" value={fundedWalletCount} numeric={{ value: fundedWalletCount }} helper="Ready to act" loading={!hydrated} />
      <StatCard icon={Sparkles} label="Mints" value={totalMints} numeric={{ value: totalMints }} helper="Completed" loading={!hydrated} />
      <StatCard
        icon={CircleDollarSign}
        label="Portfolio"
        value={liveUsd === null ? "--" : ""}
        numeric={liveUsd === null ? undefined : { value: liveUsd, decimals: 2, prefix: "$" }}
        helper={liveNative !== null ? `${liveNative.toLocaleString("en", { maximumSignificantDigits: 6 })} ${activeChain.nativeSymbol} live` : "Reading balances..."}
        loading={!hydrated}
      />
    </>
  )

  const quickActions: { view: ViewId; icon: typeof Plus; title: string; description: string }[] = [
    { view: "wallets", icon: Plus, title: "Generate wallets", description: "Create a fresh batch" },
    { view: "funding", icon: Fuel, title: "Fund wallets", description: "Send gas to every wallet" },
    { view: "mint", icon: Sparkles, title: "Mint NFTs", description: "Mint from every wallet, in parallel" },
    { view: "trade", icon: ArrowLeftRight, title: "Buy, sell or transfer", description: "Trade any token with your wallets" },
  ]

  const legacyBanners = (
    <>
      {legacyLocal.length > 0 && (
        <Alert variant="warning">
          <ShieldAlert aria-hidden="true" />
          <AlertDescription className="space-y-3">
            <span className="block">
              {legacyLocal.length} wallets are saved unencrypted in this browser, private keys included. Move them into the encrypted vault, and the browser copy is erased.
            </span>
            <Button size="sm" onClick={importLegacyWallets} disabled={isImporting}>
              {isImporting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Move to the encrypted vault
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {legacyServerBatches > 0 && (
        <Alert variant="warning">
          <ShieldAlert aria-hidden="true" />
          <AlertDescription className="space-y-3">
            <span className="block">{legacyServerBatches} older batch(es) in your database still hold unencrypted private keys.</span>
            <Button size="sm" variant="outline" onClick={() => setActiveView("settings")}>
              Fix in Settings
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  )

  return (
    <AppShell
      brand={brandProps}
      activeView={activeView}
      onNavigate={setActiveView}
      userEmail={userEmail}
      onLogout={handleLogout}
      chainSelector={<ChainPicker chains={CHAINS} value={activeChain.id} onChange={setNetworkId} />}
      walletButton={<ConnectWalletButton connectedAddress={connectedAddress} onConnect={connectWallet} />}
      statusBar={<Ticker chain={activeChain} runningJobs={jobs.filter((j) => j.status === "running").length} scheduledJobs={jobs.filter((j) => j.status === "scheduled").length} />}
    >
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={activeView === "dashboard" ? "Welcome back" : page.title}
          subtitle={page.subtitle}
          actions={
            activeView === "dashboard" ? (
              <Button onClick={() => setActiveView("wallets")}>
                <Plus aria-hidden="true" />
                Generate wallets
              </Button>
            ) : undefined
          }
        />

        {(activeView === "dashboard" || activeView === "wallets") && legacyBanners}

        {/* Dashboard */}
        {activeView === "dashboard" && (
          <div className="space-y-6">
            <section aria-label="Overview" className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {statCards}
            </section>

            <LiveConsole transactions={transactions} jobs={jobs} chain={activeChain} />

            <div className="grid items-start gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <TransactionHistory transactions={transactions} chain={activeChain} limit={5} title="Recent Transactions" />
              </div>
              <Card className="gap-0 py-0 lg:col-span-2">
                <CardHeader className="border-b px-5 py-5">
                  <CardTitle>Quick actions</CardTitle>
                  <CardDescription>Jump to the next step.</CardDescription>
                </CardHeader>
                <CardContent className="p-2">
                  <ul>
                    {quickActions.map(({ view, icon: Icon, title, description }) => (
                      <li key={view}>
                        <button
                          type="button"
                          onClick={() => setActiveView(view)}
                          className="group flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-card">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{title}</span>
                            <span className="block text-xs text-muted-foreground">{description}</span>
                          </span>
                          <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Wallets */}
        {activeView === "wallets" && (
          <div className="space-y-6">
            <div className="grid items-start gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Generate Wallets</CardTitle>
                  <CardDescription>New {activeChain.family === "solana" ? "Solana" : "EVM"} wallets are encrypted and saved straight away.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wallet-count">Number of Wallets</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Fewer wallets"
                        onClick={() => setGeneratedCount(Math.min(100, Math.max(1, generatedCount - 1)))}
                        disabled={isGenerating || generatedCount <= 1}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                      <Input
                        id="wallet-count"
                        type="number"
                        min="1"
                        max="100"
                        value={generatedCount}
                        onChange={(e) => setGeneratedCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                        disabled={isGenerating}
                        className="text-center tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="More wallets"
                        onClick={() => setGeneratedCount(Math.min(100, Math.max(1, generatedCount + 1)))}
                        disabled={isGenerating || generatedCount >= 100}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Between 1 and 100 wallets.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batch-name">Batch name (optional)</Label>
                    <Input id="batch-name" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Friday drop" maxLength={80} disabled={isGenerating} />
                  </div>
                  <Button onClick={generateWallets} disabled={isGenerating} className="w-full">
                    {isGenerating ? "Generating..." : `Generate ${generatedCount} Wallets`}
                  </Button>
                </CardContent>
              </Card>

              <section aria-label="Wallet stats" className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
                {statCards}
              </section>
            </div>

            {!hydrated ? (
              <WalletManagement wallets={[]} chain={activeChain} balances={null} nativePriceUsd={null} loadingBalances={false} onRefresh={() => undefined} onOpen={() => undefined} loading />
            ) : wallets.length > 0 ? (
              <WalletManagement wallets={wallets} chain={activeChain} balances={balances} nativePriceUsd={nativePriceUsd} loadingBalances={loadingBalances} onRefresh={loadBalances} onOpen={setDrawerWallet} batchId={selectedBatchId} />
            ) : (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={WalletCards}
                    title="No wallets yet"
                    description={`No ${activeChain.family === "solana" ? "Solana" : "EVM"} batch yet. Generate wallets for ${activeChain.name}, or import ones you already have. They are encrypted and saved.`}
                  />
                </CardContent>
              </Card>
            )}

            <details className="rounded-lg border bg-card/90">
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 font-mono text-[13px] font-semibold tracking-wide uppercase">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                Import wallets you already have
              </summary>
              <div className="space-y-3 border-t px-5 py-4">
                <p className="text-sm text-muted-foreground">
                  One {activeChain.family === "solana" ? "Solana secret key (base58, as Phantom exports it)" : "private key (0x...)"} per line. They are sent over HTTPS, encrypted on the server, and never shown again.
                  Use this for a funded wallet you want to spread gas from (Trade, then Transfer, then Distribute).
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Private keys, one per line"
                  className="w-full rounded-lg border border-border bg-muted p-3 font-mono text-xs outline-none focus-visible:border-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/15"
                />
                <Button onClick={importKeys} disabled={isImportingKeys || !importText.trim()}>
                  {isImportingKeys && <Loader2 className="animate-spin" aria-hidden="true" />}
                  Import and encrypt
                </Button>
              </div>
            </details>
          </div>
        )}

        {/* Auto-Funding */}
        {activeView === "funding" && activeChain.id !== "42220" && (
          <Card>
            <CardContent>
              <EmptyState
                icon={Fuel}
                title={`Auto-Funding from your browser works on Celo only`}
                description={`For ${activeChain.name}: import a funded wallet (Wallets page), then use Trade > Transfer > Wallets in a batch > "Distribute" to send gas to every wallet.`}
                action={
                  <Button variant="outline" onClick={() => setActiveView("trade")}>
                    Open Trade
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}
        {activeView === "funding" && activeChain.id === "42220" &&
          (wallets.length > 0 ? (
            <AutoFundingSection wallets={wallets} onWalletsUpdate={handleUpdateWallets} nativeSymbol={activeChain.nativeSymbol} chainName={activeChain.name} />
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Fuel}
                  title="Generate wallets first before auto-funding"
                  description="Auto-funding sends gas to every wallet in your batch."
                  action={
                    <Button variant="outline" onClick={() => setActiveView("wallets")}>
                      Go to Wallets
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ))}

        {/* Minting */}
        {activeView === "mint" && activeChain.family === "solana" && (
          <Card>
            <CardContent>
              <EmptyState icon={Sparkles} title="NFT minting is not available on Solana yet" description="Minting uses an EVM contract. Switch to an EVM network, or use Trade for Solana tokens." />
            </CardContent>
          </Card>
        )}
        {activeView === "mint" && activeChain.family !== "solana" && (
          <MintingSection
            chain={activeChain}
            contractAddress={contractAddress}
            onContractAddressChange={setContractAddress}
            walletCount={wallets.length}
            fundedCount={fundedWalletCount}
            concurrency={concurrency}
            onConcurrencyChange={setConcurrency}
            isStarting={isStartingMint}
            onMint={startMinting}
            jobs={jobs.filter((j) => j.kind === "mint")}
            onCancel={cancelJob}
            cancellingId={cancellingId}
            transactions={transactions}
          />
        )}

        {/* Trade */}
        {activeView === "trade" && (
          <TradeSection
            chain={activeChain}
            batches={batches}
            selectedBatchId={selectedBatchId}
            wallets={wallets}
            onCreate={submitTradeJob}
            jobs={jobs}
            onCancel={cancelJob}
            cancellingId={cancellingId}
          />
        )}

        {/* Scheduler */}
        {activeView === "schedule" && activeChain.family !== "solana" && (
          <SchedulerSection
            chain={activeChain}
            batches={batches}
            selectedBatchId={selectedBatchId}
            contractAddress={contractAddress}
            onContractAddressChange={setContractAddress}
            onCreate={submitJob}
            jobs={jobs}
            onCancel={cancelJob}
            cancellingId={cancellingId}
          />
        )}

        {/* Transactions */}
        {activeView === "transactions" && <TransactionHistory transactions={transactions} chain={activeChain} />}

        {/* Batches */}
        {activeView === "batches" && <BatchesSection batches={batches} selectedBatchId={selectedBatchId} onLoadBatch={loadBatch} />}

        {/* Settings */}
        {activeView === "settings" && (
          <SettingsSection
            brand={brand}
            onBrandChange={setBrand}
            onVaultChanged={() => {
              refreshBatches()
                .then((b) => b[0] && !selectedBatchId && loadBatch(b[0].id))
                .catch(() => undefined)
              setLegacyServerBatches(0)
            }}
          />
        )}
      </div>
      <WalletDrawer wallet={drawerWallet} chain={activeChain} onClose={() => setDrawerWallet(null)} />
    </AppShell>
  )
}
