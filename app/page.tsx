"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, AlertCircle, CheckCircle, Clock, Loader } from "lucide-react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { storage } from "@/lib/storage"
import { useWeb3Contract } from "@/lib/use-web3-contract"
import type { Transaction } from "@/lib/types"
import { saveBatchAction, getAllBatchesAction } from "@/app/actions"

export default function Dashboard() {
  const [wallets, setWallets] = useState<any[]>([])
  const [generatedCount, setGeneratedCount] = useState(5)
  const [contractAddress, setContractAddress] = useState("")
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

  const { mintCredential, getBalance } = useWeb3Contract()

  // Load wallets from storage on mount
  useEffect(() => {
    const savedWallets = storage.getWallets()
    if (savedWallets.length > 0) {
      setWallets(savedWallets)
      toast.success("Loaded saved wallets", {
        description: `Loaded ${savedWallets.length} wallets from storage`,
      })
    }
  }, [])

  useEffect(() => {
    const loadBatches = async () => {
      const allBatches = await getAllBatchesAction()
      setBatches(allBatches)
    }
    loadBatches()
  }, [])

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
      const newWallets: any[] = []

      for (let i = 0; i < generatedCount; i++) {
        const wallet = ethers.Wallet.createRandom()
        newWallets.push({
          address: wallet.address,
          privateKey: wallet.privateKey,
          funded: false,
          mintsCompleted: 0,
          status: "idle",
          balance: "0",
        })
      }

      setWallets(newWallets)
      storage.saveWallets(newWallets)
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
      for (let i = 0; i < wallets.length; i++) {
        try {
          const tx = await signer.sendTransaction({
            to: wallets[i].address,
            value: amountWei,
          })

          const receipt = await tx.wait()
          if (receipt?.status === 1) {
            successCount++
            const updatedWallets = [...wallets]
            updatedWallets[i].funded = true
            updatedWallets[i].status = "idle"
            updatedWallets[i].balance = gasAmount
            setWallets(updatedWallets)
            storage.saveWallets(updatedWallets)
          }
        } catch (err) {
          console.error(`Error funding wallet ${i + 1}:`, err)
        }
      }

      toast.dismiss(fundingToastId)
      toast.success("Funding complete!", {
        description: `Successfully funded ${successCount}/${wallets.length} wallets with ${gasAmount} CELO each`,
      })

      if (selectedBatchId) {
        await updateBatchAfterFunding(selectedBatchId, String(successCount * Number(gasAmount)))
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
    if (!signer) {
      toast.error("Wallet not connected", {
        description: "Please connect your wallet first",
      })
      return
    }

    const fundedWallets = wallets.filter((w) => w.funded)
    if (fundedWallets.length === 0) {
      toast.error("No funded wallets", {
        description: "Fund wallets before minting",
      })
      return
    }

    const controller = new AbortController()
    setMintAbortController(controller)
    setIsMinting(true)

    const mintingToastId = toast.loading("Minting started...", {
      description: `Minting NFTs with ${fundedWallets.length} wallets`,
    })
    console.log("Starting minting process with proper contract.mint() calls...")

    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < wallets.length; i++) {
      if (controller.signal.aborted) {
        console.log("Minting stopped by user")
        break
      }

      const wallet = wallets[i]

      if (!wallet.funded) {
        console.log(`Skipping unfunded wallet ${i + 1}`)
        continue
      }

      try {
        console.log(`Minting with wallet ${i + 1}: ${wallet.address}`)

        const walletInstance = new ethers.Wallet(wallet.privateKey, provider)

        const ipfsUri = `data:application/json;base64,${btoa(
          JSON.stringify({
            name: `Celo Credential #${i + 1}`,
            description: "Verifiable credential NFT on Celo",
            image: "https://via.placeholder.com/256",
            attributes: [{ trait_type: "Index", value: `${i + 1}` }],
          }),
        )}`

        console.log(`Generated tokenURI for wallet ${i + 1}`)

        const result = await mintCredential(walletInstance, wallet.address, ipfsUri)

        if (result) {
          addTransaction({
            hash: result.transactionHash,
            timestamp: Date.now(),
            status: "success",
            wallet: wallet.address,
          })

          successCount++

          const updatedWallets = [...wallets]
          updatedWallets[i].minted = true
          updatedWallets[i].status = "minted"
          updatedWallets[i].tokenId = result.tokenId
          updatedWallets[i].mintsCompleted = (updatedWallets[i].mintsCompleted || 0) + 1
          setWallets(updatedWallets)
          storage.saveWallets(updatedWallets)

          console.log(`Mint successful for wallet ${i + 1}, tokenId: ${result.tokenId}`)

          toast.success(`NFT Minted #${i + 1}`, {
            description: `TokenId: ${result.tokenId}`,
          })
        } else {
          addTransaction({
            hash: "failed",
            timestamp: Date.now(),
            status: "failed",
            wallet: wallet.address,
          })
          failureCount++
          console.log(`Mint failed for wallet ${i + 1}`)

          toast.error(`Mint failed #${i + 1}`, {
            description: "Transaction reverted on chain",
          })
        }
      } catch (error) {
        console.error(`Error minting with wallet ${i + 1}:`, error)
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
      description: `${successCount} succeeded, ${failureCount} failed`,
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

      const loadedWallets: any[] = walletDataArray.map((w: any) => ({
        ...w,
        funded: false,
        mintsCompleted: 0,
        status: "idle",
        balance: "0",
      }))

      setWallets(loadedWallets)
      storage.saveWallets(loadedWallets)
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

  const updateBatchAfterFunding = async (batchId: string, totalFundedAmount: string) => {
    // Placeholder for batch update logic
  }

  const fundedWalletCount = wallets.filter((w) => w.funded).length
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/50 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary">Mintition</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Automated NFT minting platform for Celo blockchain
              </p>
            </div>
            {connectedAddress && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/20 border border-green-900/30 w-fit">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <p className="text-xs sm:text-sm font-mono text-green-400">
                  {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Tabs defaultValue="setup" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
            <TabsTrigger value="setup" className="text-xs sm:text-sm">
              Setup
            </TabsTrigger>
            <TabsTrigger value="wallets" className="text-xs sm:text-sm">
              Wallets
            </TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs sm:text-sm">
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* SETUP TAB */}
          <TabsContent value="setup" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Connect Wallet */}
              <Card className="sm:col-span-1 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-primary flex items-center gap-2">
                    <span className="text-sm bg-primary/10 px-2 py-1 rounded">1</span>
                    Wallet
                  </CardTitle>
                  <CardDescription className="text-xs">Connect MetaMask</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={connectWallet}
                    className="w-full bg-primary hover:bg-primary/90 text-sm sm:text-base"
                    size="sm"
                    disabled={!!connectedAddress}
                  >
                    {connectedAddress ? "✓ Connected" : "Connect MetaMask"}
                  </Button>
                  {!connectedAddress && (
                    <p className="text-xs text-muted-foreground">
                      Need MetaMask?{" "}
                      <a
                        href="https://metamask.io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Install
                      </a>
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Configuration */}
              <Card className="sm:col-span-1 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-primary flex items-center gap-2">
                    <span className="text-sm bg-primary/10 px-2 py-1 rounded">2</span>
                    Settings
                  </CardTitle>
                  <CardDescription className="text-xs">Configure minting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs sm:text-sm text-muted-foreground font-medium">Contract Address</label>
                    <Input
                      placeholder="0x..."
                      value={contractAddress}
                      onChange={(e) => setContractAddress(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-muted-foreground font-medium">CELO per Wallet</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={gasAmount}
                      onChange={(e) => setGasAmount(e.target.value)}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm text-muted-foreground">Network</span>
                    <span className="text-xs sm:text-sm font-semibold text-primary">Celo Mainnet</span>
                  </div>
                </CardContent>
              </Card>

              {/* Generate Wallets */}
              <Card className="sm:col-span-1 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-primary flex items-center gap-2">
                    <span className="text-sm bg-primary/10 px-2 py-1 rounded">3</span>
                    Generate
                  </CardTitle>
                  <CardDescription className="text-xs">Create wallets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs sm:text-sm text-muted-foreground font-medium">Count</label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={generatedCount}
                      onChange={(e) => setGeneratedCount(Math.min(50, Math.max(1, Number(e.target.value))))}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <Button
                    onClick={generateWallets}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-sm sm:text-base"
                    size="sm"
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      `Generate ${generatedCount}`
                    )}
                  </Button>
                  {wallets.length > 0 && (
                    <>
                      <p className="text-xs text-green-400 font-medium">✓ {wallets.length} ready</p>
                      <Button
                        onClick={exportWalletsAsCSV}
                        variant="outline"
                        className="w-full text-xs sm:text-sm bg-transparent"
                        size="sm"
                      >
                        Download CSV
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Send CELO */}
              <Card className="sm:col-span-1 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-primary flex items-center gap-2">
                    <span className="text-sm bg-primary/10 px-2 py-1 rounded">4</span>
                    Fund
                  </CardTitle>
                  <CardDescription className="text-xs">Send CELO</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {wallets.length > 0
                      ? `Send ${gasAmount} CELO to ${wallets.length} wallets`
                      : "No wallets generated"}
                  </p>
                  <Button
                    onClick={sendCeloToWallets}
                    disabled={!connectedAddress || !wallets.length || isFunding}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-muted text-sm sm:text-base"
                    size="sm"
                  >
                    {isFunding ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Funding...
                      </>
                    ) : (
                      `Fund ${(Number(gasAmount) * wallets.length).toFixed(2)} CELO`
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Start Minting */}
              <Card className="sm:col-span-2 lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg text-primary flex items-center gap-2">
                    <span className="text-sm bg-primary/10 px-2 py-1 rounded">5</span>
                    Mint
                  </CardTitle>
                  <CardDescription className="text-xs">Execute minting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handleMint}
                      disabled={isMinting || fundedWalletCount === 0}
                      className="w-full sm:w-auto sm:flex-1 flex-shrink-0 min-w-[140px] bg-primary hover:bg-primary/90 disabled:bg-muted text-sm sm:text-base whitespace-nowrap"
                      size="sm"
                    >
                      {isMinting ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Minting...
                        </>
                      ) : (
                        "Start Minting"
                      )}
                    </Button>
                    {isMinting && (
                      <Button
                        onClick={stopMinting}
                        className="w-full sm:w-auto flex-shrink-0 min-w-[100px] bg-red-600 hover:bg-red-700 text-sm sm:text-base"
                        size="sm"
                      >
                        Stop
                      </Button>
                    )}
                  </div>
                  {fundedWalletCount === 0 && !isMinting && (
                    <Alert className="bg-destructive/10 border-destructive/30">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <AlertDescription className="text-xs">Fund wallets first</AlertDescription>
                    </Alert>
                  )}
                  {fundedWalletCount > 0 && (
                    <p className="text-xs text-green-400 font-medium">✓ {fundedWalletCount} funded</p>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              {wallets.length > 0 && (
                <Card className="sm:col-span-2 lg:col-span-1">
                  <CardHeader>
                    <CardTitle className="text-lg sm:text-xl">Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Wallets:</span>
                      <span className="font-medium">{wallets.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Funded:</span>
                      <span className="font-medium text-green-400">{fundedWalletCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Mints:</span>
                      <span className="font-medium text-blue-400">{totalMints}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* WALLETS TAB */}
          <TabsContent value="wallets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Generated Wallets ({wallets.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {wallets.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">Generate wallets first</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {wallets.map((wallet, i) => (
                      <div
                        key={i}
                        className={`p-3 sm:p-4 rounded border transition-colors ${
                          wallet.funded
                            ? "border-green-900/30 bg-green-900/10"
                            : "border-border bg-secondary/50 hover:bg-secondary/75"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground font-medium">Wallet {i + 1}</p>
                            <p className="text-xs sm:text-sm font-mono break-all text-foreground">{wallet.address}</p>
                          </div>
                          <Button
                            onClick={() => copyToClipboard(wallet.address, "Address")}
                            size="sm"
                            variant="ghost"
                            className="w-full sm:w-auto text-xs"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground break-all mb-2">
                          Key: {wallet.privateKey.slice(0, 20)}...
                        </p>
                        <div className="flex flex-wrap gap-2 gap-y-1 text-xs">
                          <span
                            className={wallet.funded ? "text-green-400 font-medium" : "text-yellow-400 font-medium"}
                          >
                            {wallet.funded ? "✓ Funded" : "○ Pending"}
                          </span>
                          <span className="text-muted-foreground">Mints: {wallet.mintsCompleted || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Button
              onClick={clearAllWallets}
              className="w-full bg-red-600 hover:bg-red-700 text-sm sm:text-base"
              size="sm"
            >
              Clear All Wallets
            </Button>
          </TabsContent>

          {/* TRANSACTIONS TAB */}
          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Transaction History ({transactions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {transactions.map((tx, i) => (
                      <div
                        key={i}
                        className="p-3 sm:p-4 rounded bg-secondary/50 border border-border/50 flex items-start gap-3 hover:bg-secondary/75 transition-colors"
                      >
                        <div className="mt-1 flex-shrink-0">
                          {tx.status === "success" && <CheckCircle className="w-5 h-5 text-green-500" />}
                          {tx.status === "pending" && <Clock className="w-5 h-5 text-yellow-500 animate-spin" />}
                          {tx.status === "failed" && <AlertCircle className="w-5 h-5 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-mono break-all text-foreground">{tx.hash}</p>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs">
                            <span className="text-muted-foreground">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                            <span
                              className={
                                tx.status === "success"
                                  ? "text-green-400"
                                  : tx.status === "pending"
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }
                            >
                              {tx.status.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground mt-1 break-all">
                            {tx.wallet.slice(0, 10)}...{tx.wallet.slice(-8)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Batch Management Section */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Wallet Batches</h2>

          {/* Load Existing Batch */}
          {batches.length > 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Load Saved Batch</CardTitle>
                <CardDescription>Reuse previously generated wallet batches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className={`p-4 border rounded-lg cursor-pointer transition ${
                        selectedBatchId === batch.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => loadBatchFromDB(batch.id)}
                    >
                      <h3 className="font-semibold">{batch.name}</h3>
                      <p className="text-sm text-muted-foreground">{batch.walletCount} wallets</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save Batch */}
          {wallets.length > 0 && !selectedBatchId && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Save Current Batch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Batch Name</label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-background"
                    placeholder="e.g., Marketing Campaign Batch 1"
                  />
                </div>
                <Button onClick={saveBatchToDB} disabled={isSavingBatch} className="w-full">
                  {isSavingBatch ? "Saving..." : "Save Batch"}
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}
