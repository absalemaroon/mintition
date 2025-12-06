"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, CheckCircle, Clock, Loader, LogOut } from "lucide-react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { storage } from "@/lib/storage"
import { useWeb3Contract } from "@/lib/use-web3-contract"
import type { Transaction, MintWallet } from "@/lib/types"
import { saveBatchAction, getAllBatchesAction } from "@/app/actions"
import { useRouter } from "next/navigation"
import { WalletManagement } from "./wallet-management"
import { AutoFundingSection } from "./auto-funding-section"

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
    if (!isContractValid) {
      toast.error("Contract not verified", {
        description: "Please verify your smart contract address first",
      })
      return
    }

    if (!signer) {
      toast.error("Wallet not connected", {
        description: "Please connect your wallet first",
      })
      return
    }

    const fundedWallets = wallets.filter((w) => w.fundingStatus === "funded")
    if (fundedWallets.length === 0) {
      toast.error("No funded wallets", {
        description: "Auto-fund wallets using your private key first",
      })
      return
    }

    const controller = new AbortController()
    setMintAbortController(controller)
    setIsMinting(true)

    const mintingToastId = toast.loading("Minting started...", {
      description: `Minting NFTs with ${fundedWallets.length} wallets`,
    })
    console.log("Starting minting process with funded wallets...")

    let successCount = 0
    let failureCount = 0

    // Iterate over all wallets, but only mint if funded
    for (let i = 0; i < wallets.length; i++) {
      if (controller.signal.aborted) {
        console.log("Minting stopped by user")
        break
      }

      const wallet = wallets[i]

      if (wallet.fundingStatus !== "funded") {
        console.log(`Skipping unfunded wallet ${i + 1}`)
        continue
      }

      try {
        console.log(`Minting with wallet ${i + 1}: ${wallet.address}`)

        // Use the wallet's private key to create a signer
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

    // Ensure we're exporting the correct format, possibly from storage directly if it's the source of truth
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

  const validateContractAddress = async () => {
    if (!ethers.isAddress(contractAddress)) {
      toast.error("Invalid contract address", {
        description: "Please enter a valid Ethereum address",
      })
      setIsContractValid(false)
      return
    }

    try {
      if (!provider) {
        toast.error("Provider not initialized", {
          description: "Please connect your wallet first",
        })
        return
      }

      const code = await provider.getCode(contractAddress)
      if (code === "0x") {
        toast.error("No contract found", {
          description: "This address does not contain a smart contract on the current network",
        })
        setIsContractValid(false)
      } else {
        toast.success("Contract verified!", {
          description: "Smart contract found at this address",
        })
        setIsContractValid(true)
        storage.saveContractAddress(contractAddress)
      }
    } catch (error) {
      console.error("Contract validation error:", error)
      toast.error("Validation failed", {
        description: "Could not verify contract address",
      })
      setIsContractValid(false)
    }
  }

  const handleUpdateWallets = (updatedWallets: MintWallet[]) => {
    setWallets(updatedWallets)
    storage.saveWallets(updatedWallets as any)
  }

  const fundedWalletCount = wallets.filter((w) => w.fundingStatus === "funded").length
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Mintition</h1>
            <p className="text-muted-foreground">{userEmail}</p>
          </div>
          <Button onClick={handleLogout} variant="outline">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="wallets" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="wallets">Wallets</TabsTrigger>
            <TabsTrigger value="funding">Auto-Funding</TabsTrigger>
            <TabsTrigger value="mint">Minting</TabsTrigger>
          </TabsList>

          <TabsContent value="wallets" className="space-y-6">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Generate Wallets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Number of Wallets</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={generatedCount}
                    onChange={(e) => setGeneratedCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                    disabled={isGenerating}
                  />
                </div>
                <Button onClick={generateWallets} disabled={isGenerating} className="w-full">
                  {isGenerating ? "Generating..." : `Generate ${generatedCount} Wallets`}
                </Button>
              </CardContent>
            </Card>

            {wallets.length > 0 && <WalletManagement wallets={wallets} onWalletsUpdate={handleUpdateWallets} />}
          </TabsContent>

          <TabsContent value="funding" className="space-y-6">
            {wallets.length > 0 && <AutoFundingSection wallets={wallets} onWalletsUpdate={handleUpdateWallets} />}
            {wallets.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Generate wallets first before auto-funding</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="mint" className="space-y-6">
            <Card className="glass border-purple-500/20">
              <CardHeader>
                <CardTitle>Smart Contract Configuration</CardTitle>
                <CardDescription>Enter and verify your NFT contract address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contract Address</label>
                  <div className="flex flex-col gap-2">
                    <Input
                      placeholder="0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae"
                      value={contractAddress}
                      onChange={(e) => {
                        setContractAddress(e.target.value)
                        setIsContractValid(false)
                      }}
                      className="font-mono text-sm"
                    />
                    <Button
                      onClick={validateContractAddress}
                      variant="outline"
                      className="w-full bg-transparent"
                      disabled={!ethers.isAddress(contractAddress) || !provider}
                    >
                      {isContractValid ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                          Contract Verified
                        </>
                      ) : (
                        "Verify Contract"
                      )}
                    </Button>
                  </div>
                </div>

                <Alert
                  className={
                    isContractValid ? "border-green-500/50 bg-green-500/10" : "border-yellow-500/50 bg-yellow-500/10"
                  }
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {isContractValid
                      ? "✓ Smart contract verified and ready for minting"
                      : "⚠ Please verify your contract address before minting"}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Mint Section */}
            <Card className="glass">
              <CardHeader>
                <CardTitle>Mint NFTs</CardTitle>
                <CardDescription>Mint NFTs using funded wallets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 p-3 rounded bg-secondary/50 border border-border/50">
                  <p className="text-sm font-medium">Status:</p>
                  <p className="text-sm">
                    <span className="font-semibold">{wallets.filter((w) => w.fundingStatus === "funded").length}</span>{" "}
                    funded wallets
                  </p>
                  <p className="text-sm">
                    Contract:{" "}
                    <span className="font-mono text-xs">
                      {contractAddress.slice(0, 10)}...{contractAddress.slice(-8)}
                    </span>
                  </p>
                </div>

                <Button
                  onClick={handleMint}
                  disabled={
                    isMinting ||
                    !signer ||
                    !isContractValid ||
                    wallets.filter((w) => w.fundingStatus === "funded").length === 0
                  }
                  className="w-full"
                  size="lg"
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
                  <Button onClick={stopMinting} variant="destructive" className="w-full">
                    Stop Minting
                  </Button>
                )}
              </CardContent>
            </Card>
            {/* Transaction history section - existing code ... */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction History ({transactions.length})</CardTitle>
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

        {/* Batch Management Section - Kept for now, could be refactored */}
        <section className="space-y-4 mt-8">
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
      </div>
    </div>
  )
}
