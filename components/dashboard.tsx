"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Fuel, Minus, Plus, Sparkles, WalletCards, CheckCircle2 } from "lucide-react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { storage } from "@/lib/storage"
import { useWeb3Contract } from "@/lib/use-web3-contract"
import type { Transaction, MintWallet } from "@/lib/types"
import { saveBatchAction, getAllBatchesAction } from "@/app/actions"
import { useRouter } from "next/navigation"
import { CHAINS, getChain } from "@/lib/chains"
import { WalletManagement } from "./wallet-management"
import { AutoFundingSection } from "./auto-funding-section"
import { MintingSection } from "./minting-section"
import { BatchesSection } from "./batches-section"
import { TransactionHistory } from "./transaction-history"
import { AppShell } from "@/components/app/app-shell"
import { ChainSelector } from "@/components/app/chain-selector"
import { ConnectWalletButton } from "@/components/app/connect-wallet-button"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { getNavItem, type ViewId } from "@/components/app/nav"

export default function Dashboard() {
  const [wallets, setWallets] = useState<MintWallet[]>([])
  const [generatedCount, setGeneratedCount] = useState(5)
  const [contractAddress, setContractAddress] = useState("0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae")
  const [isContractValid, setIsContractValid] = useState(false)
  const [gasAmount, setGasAmount] = useState("0.1")
  const [networkId, setNetworkId] = useState("42220")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isMinting, setIsMinting] = useState(false)
  const [isFunding, setIsFunding] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [mintAbortController, setMintAbortController] = useState<AbortController | null>(null)
  const [connectedAddress, setConnectedAddress] = useState<string>("")
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
  const [batches, setBatches] = useState<any[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>("")
  const [batchName, setBatchName] = useState(`Batch ${Date.now()}`)
  const [isSavingBatch, setIsSavingBatch] = useState(false)
  const [userEmail, setUserEmail] = useState<string>("")
  const [activeView, setActiveView] = useState<ViewId>("dashboard")
  // True once the browser has loaded saved wallets, so we show skeletons instead of a false "empty" screen.
  const [hydrated, setHydrated] = useState(false)

  const { mintCredential, getBalance } = useWeb3Contract()
  const router = useRouter()

  useEffect(() => {
    const getUserEmail = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    getUserEmail()

    const savedWallets = storage.getWallets()
    if (savedWallets.length > 0) {
      const walletsWithStatus = savedWallets.map((w) => ({
        ...w,
        fundingStatus: w.funded ? "funded" : "not_funded",
      }))
      setWallets(walletsWithStatus)
      toast.success("Loaded saved wallets", {
        description: `Loaded ${savedWallets.length} wallets from storage`,
      })
    }
  }, [])

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const loadBatches = async () => {
      const allBatches = await getAllBatchesAction()
      setBatches(allBatches)
    }
    loadBatches()
  }, [])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      toast.success("Logged out successfully")
      router.push("/auth/login")
      router.refresh()
    } catch (error) {
      toast.error("Failed to logout", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  const connectWallet = async () => {
    if (typeof window === "undefined") {
      toast.error("Browser environment required", {
        description: "This feature requires a browser environment",
      })
      return
    }

    if (!window.ethereum) {
      toast.error("MetaMask not installed", {
        description: "Please install MetaMask from https://metamask.io",
      })
      return
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })
      setConnectedAddress(accounts[0])

      const provider = new ethers.BrowserProvider(window.ethereum)
      setProvider(provider)

      const signer = await provider.getSigner()
      setSigner(signer)

      toast.success("Wallet connected", {
        description: `Connected to ${accounts[0].slice(0, 10)}...`,
      })
      console.log("Connected to:", accounts[0])
    } catch (error: any) {
      if (error.code === -32002) {
        toast.error("MetaMask request pending", {
          description: "Check your MetaMask popup",
        })
      } else if (error.code === 4001) {
        toast.error("Connection rejected", {
          description: "You rejected the connection request",
        })
      } else {
        toast.error("Connection failed", {
          description: error.message || "Failed to connect wallet",
        })
      }
      console.error("Failed to connect wallet:", error)
    }
  }

  const generateWallets = () => {
    setIsGenerating(true)
    try {
      const newWallets: MintWallet[] = []

      for (let i = 0; i < generatedCount; i++) {
        const wallet = ethers.Wallet.createRandom()
        newWallets.push({
          address: wallet.address,
          privateKey: wallet.privateKey,
          funded: false, // This will be updated by fundingStatus
          fundingStatus: "not_funded",
          mintsCompleted: 0,
          status: "idle",
          balance: "0",
        })
      }

      setWallets(newWallets)
      storage.saveWallets(newWallets as any)
      toast.success(`Generated ${generatedCount} wallets`, {
        description: "Wallets saved for future use",
      })
    } catch (error) {
      toast.error("Generation failed", {
        description: "Failed to generate wallets",
      })
      console.error("Error generating wallets:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const sendCeloToWallets = async () => {
    if (!signer) {
      toast.error("Wallet not connected", {
        description: "Connect MetaMask first",
      })
      return
    }

    if (!wallets.length) {
      toast.error("No wallets to fund", {
        description: "Generate wallets first",
      })
      return
    }

    setIsFunding(true)

    const fundingToastId = toast.loading("Funding wallets...", {
      description: `Sending ${gasAmount} CELO to ${wallets.length} wallets`,
    })

    try {
      const amountWei = ethers.parseEther(gasAmount)
      const totalAmount = amountWei * BigInt(wallets.length)

      const balance = await provider!.getBalance(connectedAddress)
      if (balance < totalAmount) {
        toast.dismiss(fundingToastId)
        toast.error("Insufficient balance", {
          description: `Need ${ethers.formatEther(totalAmount)} CELO but have ${ethers.formatEther(balance)}`,
        })
        setIsFunding(false)
        return
      }

      console.log(`Starting batch funding of ${wallets.length} wallets with ${gasAmount} CELO each`)

      let successCount = 0
      const updatedWallets = [...wallets] // Create a mutable copy

      for (let i = 0; i < wallets.length; i++) {
        try {
          const tx = await signer.sendTransaction({
            to: wallets[i].address,
            value: amountWei,
          })

          const receipt = await tx.wait()
          if (receipt?.status === 1) {
            successCount++
            updatedWallets[i].funded = true // This might be redundant if fundingStatus is used
            updatedWallets[i].fundingStatus = "funded"
            updatedWallets[i].status = "idle" // Reset status after funding
            updatedWallets[i].balance = gasAmount // Update balance, though this might be better fetched
          }
        } catch (err) {
          console.error(`Error funding wallet ${i + 1}:`, err)
          // Optionally mark this wallet as failed to fund
          updatedWallets[i].fundingStatus = "funding_failed"
        }
      }

      setWallets(updatedWallets) // Update state once
      storage.saveWallets(updatedWallets as any)

      toast.dismiss(fundingToastId)
      toast.success("Funding complete!", {
        description: `Successfully funded ${successCount}/${wallets.length} wallets with ${gasAmount} CELO each`,
      })

      if (selectedBatchId) {
        // This function needs to be implemented if batch updates are required after funding
        // await updateBatchAfterFunding(selectedBatchId, String(successCount * Number(gasAmount)));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      toast.dismiss(fundingToastId)
      toast.error("Funding failed", {
        description: errorMsg,
      })
      console.error("Error in batch funding:", error)
    } finally {
      setIsFunding(false)
    }
  }

  const handleMint = async () => {
    if (!contractAddress || contractAddress.trim() === "") {
      toast.error("Contract address required", {
        description: "Please enter a smart contract address",
      })
      return
    }

    if (!signer) {
      toast.error("Wallet not connected", {
        description: "Please connect your wallet first",
      })
      return
    }

    if (wallets.length === 0) {
      toast.error("No wallets generated", {
        description: "Generate wallets first before minting",
      })
      return
    }

    const controller = new AbortController()
    setMintAbortController(controller)
    setIsMinting(true)

    const mintingToastId = toast.loading("Minting started...", {
      description: `Minting NFTs with ${wallets.length} wallets`,
    })
    console.log("[v0] Starting minting process with all wallets...")

    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < wallets.length; i++) {
      if (controller.signal.aborted) {
        console.log("[v0] Minting stopped by user")
        break
      }

      const wallet = wallets[i]

      try {
        console.log(`[v0] Minting with wallet ${i + 1}: ${wallet.address}`)

        const walletInstance = new ethers.Wallet(wallet.privateKey, provider)

        const ipfsUri = `data:application/json;base64,${btoa(
          JSON.stringify({
            name: `Celo Credential #${i + 1}`,
            description: "Verifiable credential NFT on Celo",
            image: "https://via.placeholder.com/256",
            attributes: [{ trait_type: "Index", value: `${i + 1}` }],
          }),
        )}`

        console.log(`[v0] Generated tokenURI for wallet ${i + 1}`)

        const result = await mintCredential(walletInstance, wallet.address, ipfsUri, contractAddress)

        if (result) {
          addTransaction({
            hash: result.transactionHash,
            timestamp: Date.now(),
            status: "success",
            wallet: wallet.address,
          })

          successCount++

          const updatedWallets = [...wallets]
          updatedWallets[i].status = "minted"
          updatedWallets[i].mintsCompleted = (updatedWallets[i].mintsCompleted || 0) + 1
          setWallets(updatedWallets)
          storage.saveWallets(updatedWallets as any)

          console.log(`[v0] Mint successful for wallet ${i + 1}, tokenId: ${result.tokenId}`)

          toast.success(`NFT Minted #${i + 1}`, {
            description: `Tx: ${result.transactionHash.slice(0, 10)}...`,
          })
        } else {
          addTransaction({
            hash: "failed",
            timestamp: Date.now(),
            status: "failed",
            wallet: wallet.address,
          })
          failureCount++
          console.log(`[v0] Mint failed for wallet ${i + 1}`)

          toast.error(`Mint failed #${i + 1}`, {
            description: "Transaction reverted on chain",
          })
        }
      } catch (error) {
        console.error(`[v0] Error minting with wallet ${i + 1}:`, error)
        addTransaction({
          hash: "error",
          timestamp: Date.now(),
          status: "failed",
          wallet: wallet.address,
        })
        failureCount++

        toast.error(`Mint error #${i + 1}`, {
          description: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    setIsMinting(false)
    setMintAbortController(null)

    toast.dismiss(mintingToastId)
    toast.success("Minting completed", {
      description: `Success: ${successCount}, Failed: ${failureCount}`,
    })
  }

  const addTransaction = (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev])
  }

  const stopMinting = () => {
    if (mintAbortController) {
      mintAbortController.abort()
      setMintAbortController(null)
    }
    setIsMinting(false)
    toast.info("Minting stopped", {
      description: "Stopped by user",
    })
  }

  const copyToClipboard = (text: string, label = "Address") => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard", {
      description: `${label} copied`,
    })
  }

  const exportWalletsAsCSV = () => {
    if (wallets.length === 0) {
      toast.error("No wallets to export", {
        description: "Generate wallets first",
      })
      return
    }

    const csv = storage.exportWalletsAsCSV()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `celo-wallets-${Date.now()}.csv`)
    link.style.visibility = "hidden"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.success("CSV exported", {
      description: `Downloaded ${wallets.length} wallets`,
    })
  }

  const clearAllWallets = () => {
    toast.warning("Clear all wallets?", {
      description: "This will delete all saved wallets permanently.",
      action: {
        label: "Delete",
        onClick: () => {
          setWallets([])
          storage.clearWallets()
          toast.success("Wallets cleared", {
            description: "All wallets have been deleted",
          })
        },
      },
    })
  }

  const loadBatchFromDB = async (batchId: string) => {
    try {
      const response = await fetch(`/api/batch/${batchId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const batch = await response.json()

      const walletDataArray = Array.isArray(batch.walletData) ? batch.walletData : []

      const loadedWallets: MintWallet[] = walletDataArray.map((w: any) => ({
        ...w,
        funded: false, // Default to false, will be updated by funding
        fundingStatus: "not_funded",
        mintsCompleted: 0,
        status: "idle",
        balance: "0",
      }))

      setWallets(loadedWallets)
      storage.saveWallets(loadedWallets as any)
      setSelectedBatchId(batchId)

      toast.success("Batch loaded", {
        description: `Loaded ${loadedWallets.length} wallets from batch`,
      })
    } catch (error) {
      console.error("[v0] Error loading batch:", error)
      toast.error("Failed to load batch", {
        description: error instanceof Error ? error.message : "Could not load wallets from database",
      })
    }
  }

  const saveBatchToDB = async () => {
    if (!wallets.length) {
      toast.error("No wallets to save", {
        description: "Generate wallets first",
      })
      return
    }

    setIsSavingBatch(true)
    try {
      const batch = await saveBatchAction(
        batchName,
        wallets.map((w) => ({
          address: w.address,
          privateKey: w.privateKey,
        })),
        `Generated ${wallets.length} wallets`,
      )

      if (batch) {
        setBatches([...batches, batch])
        setSelectedBatchId(batch.id)
        toast.success("Batch saved successfully", {
          description: `Batch ${batch.name} saved to database`,
        })
        setBatchName(`Batch ${Date.now()}`)
      }
    } catch (error) {
      toast.error("Failed to save batch", {
        description: "Could not save batch to database",
      })
      console.error("Error saving batch:", error)
    } finally {
      setIsSavingBatch(false)
    }
  }

  const handleContractAddressChange = (address: string) => {
    setContractAddress(address)
    storage.saveContractAddress(address)
  }

  const handleUpdateWallets = (updatedWallets: MintWallet[]) => {
    setWallets(updatedWallets)
    storage.saveWallets(updatedWallets as any)
  }

  const fundedWalletCount = wallets.filter((w) => w.fundingStatus === "funded").length
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)

  // Presentation-only values
  const activeChain = getChain(networkId)
  const totalBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0).toFixed(2)
  const page = getNavItem(activeView)

  const statCards = (
    <>
      <StatCard icon={WalletCards} label="Total Wallets" value={wallets.length} helper="Wallets generated" loading={!hydrated} />
      <StatCard icon={CheckCircle2} label="Funded Wallets" value={fundedWalletCount} helper="Ready to mint" loading={!hydrated} />
      <StatCard icon={Sparkles} label="Total Mints" value={totalMints} helper="Across all wallets" loading={!hydrated} />
      <StatCard icon={Fuel} label="Total Balance" value={`${totalBalance} ${activeChain.nativeSymbol}`} helper="Held by your wallets" loading={!hydrated} />
    </>
  )

  const quickActions: { view: ViewId; icon: typeof Plus; title: string; description: string }[] = [
    { view: "wallets", icon: Plus, title: "Generate wallets", description: "Create a fresh batch" },
    { view: "funding", icon: Fuel, title: "Fund wallets", description: "Send gas to every wallet" },
    { view: "mint", icon: Sparkles, title: "Mint NFTs", description: "Mint from every wallet" },
  ]

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      userEmail={userEmail}
      onLogout={handleLogout}
      chainSelector={<ChainSelector chains={CHAINS} value={activeChain.id} onChange={setNetworkId} />}
      walletButton={<ConnectWalletButton connectedAddress={connectedAddress} onConnect={connectWallet} />}
    >
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={page.title}
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

        {/* Dashboard */}
        {activeView === "dashboard" && (
          <div className="space-y-6">
            <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {statCards}
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <TransactionHistory
                  transactions={transactions}
                  chain={activeChain}
                  limit={5}
                  title="Recent Transactions"
                />
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
                  <CardDescription>Create a fresh batch of wallets.</CardDescription>
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
              <WalletManagement wallets={[]} onWalletsUpdate={handleUpdateWallets} loading nativeSymbol={activeChain.nativeSymbol} />
            ) : wallets.length > 0 ? (
              <WalletManagement
                wallets={wallets}
                onWalletsUpdate={handleUpdateWallets}
                nativeSymbol={activeChain.nativeSymbol}
              />
            ) : (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={WalletCards}
                    title="No wallets yet"
                    description="Choose how many wallets you need, then generate them. They are saved in this browser."
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Auto-Funding */}
        {activeView === "funding" &&
          (wallets.length > 0 ? (
            <AutoFundingSection
              wallets={wallets}
              onWalletsUpdate={handleUpdateWallets}
              nativeSymbol={activeChain.nativeSymbol}
              chainName={activeChain.name}
            />
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
        {activeView === "mint" && (
          <MintingSection
            chain={activeChain}
            contractAddress={contractAddress}
            onContractAddressChange={handleContractAddressChange}
            walletCount={wallets.length}
            fundedCount={fundedWalletCount}
            walletConnected={Boolean(signer)}
            isMinting={isMinting}
            onMint={handleMint}
            onStop={stopMinting}
            transactions={transactions}
          />
        )}

        {/* Transactions */}
        {activeView === "transactions" && <TransactionHistory transactions={transactions} chain={activeChain} />}

        {/* Batches */}
        {activeView === "batches" && (
          <BatchesSection
            batches={batches}
            selectedBatchId={selectedBatchId}
            walletCount={wallets.length}
            batchName={batchName}
            onBatchNameChange={setBatchName}
            isSavingBatch={isSavingBatch}
            onSaveBatch={saveBatchToDB}
            onLoadBatch={loadBatchFromDB}
          />
        )}
      </div>
    </AppShell>
  )
}
