"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle, Clock, Loader2, X } from "lucide-react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { storage } from "@/lib/storage"
import { useWeb3Contract } from "@/lib/use-web3-contract"
import type { Transaction, MintWallet } from "@/lib/types"
import { saveBatchAction, getAllBatchesAction } from "@/app/actions"
import { useRouter } from "next/navigation"
import { WalletManagement } from "./wallet-management"
import { AutoFundingSection } from "./auto-funding-section"
import { PaperNav, type NavSection } from "./paper-nav"

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<NavSection>("wallets")
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
          funded: false,
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
      const updatedWallets = [...wallets]

      for (let i = 0; i < wallets.length; i++) {
        try {
          const tx = await signer.sendTransaction({
            to: wallets[i].address,
            value: amountWei,
          })

          const receipt = await tx.wait()
          if (receipt?.status === 1) {
            successCount++
            updatedWallets[i].funded = true
            updatedWallets[i].fundingStatus = "funded"
            updatedWallets[i].status = "idle"
            updatedWallets[i].balance = gasAmount
          }
        } catch (err) {
          console.error(`Error funding wallet ${i + 1}:`, err)
          updatedWallets[i].fundingStatus = "funding_failed"
        }
      }

      setWallets(updatedWallets)
      storage.saveWallets(updatedWallets as any)

      toast.dismiss(fundingToastId)
      toast.success("Funding complete!", {
        description: `Successfully funded ${successCount}/${wallets.length} wallets with ${gasAmount} CELO each`,
      })
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
        funded: false,
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

  return (
    <div className="min-h-screen bg-background flex">
      <PaperNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        connectedAddress={connectedAddress}
        onConnectWallet={connectWallet}
        onLogout={handleLogout}
        userEmail={userEmail}
      />

      {/* Main content area */}
      <main className="flex-1 min-w-0 p-4 md:p-8 lg:p-10 overflow-x-hidden">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Section header */}
          <div className="mb-6">
            <h2 className="ink-heading text-2xl md:text-3xl">
              {activeSection === "wallets" && "Wallet Management"}
              {activeSection === "funding" && "Automated Funding"}
              {activeSection === "mint" && "NFT Minting"}
              {activeSection === "batches" && "Wallet Batches"}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {activeSection === "wallets" && "Generate and manage bulk minting wallets"}
              {activeSection === "funding" && "Fund wallets automatically via private key"}
              {activeSection === "mint" && "Mint NFT credentials to all generated wallets"}
              {activeSection === "batches" && "Save and load wallet batch configurations"}
            </p>
          </div>

          {/* Wallets section */}
          {activeSection === "wallets" && (
            <div className="space-y-6">
              <Card className="paper-card">
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
                  <Button onClick={generateWallets} disabled={isGenerating} className="w-full ink-btn-terracotta">
                    {isGenerating ? "Generating..." : `Generate ${generatedCount} Wallets`}
                  </Button>
                </CardContent>
              </Card>

              {wallets.length > 0 && <WalletManagement wallets={wallets} onWalletsUpdate={handleUpdateWallets} />}
            </div>
          )}

          {/* Funding section */}
          {activeSection === "funding" && (
            <div className="space-y-6">
              {wallets.length > 0 && <AutoFundingSection wallets={wallets} onWalletsUpdate={handleUpdateWallets} />}
              {wallets.length === 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Generate wallets first before auto-funding</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Minting section */}
          {activeSection === "mint" && (
            <div className="space-y-6">
              <Card className="paper-card">
                <CardHeader>
                  <CardTitle>Smart Contract Configuration</CardTitle>
                  <CardDescription>Enter your NFT contract address</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contract Address</label>
                    <div className="flex flex-col gap-2">
                      <Input
                        placeholder="0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae"
                        value={contractAddress}
                        onChange={(e) => handleContractAddressChange(e.target.value)}
                        className="font-mono text-sm"
                      />
                      <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
                        Enter any contract address — no verification needed
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="paper-card">
                <CardHeader>
                  <CardTitle>Mint NFTs</CardTitle>
                  <CardDescription>Mint NFTs to all wallets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 p-3 rounded-md bg-secondary/50 border border-border/50">
                    <p className="text-sm font-medium">Status:</p>
                    <p className="text-sm">
                      <span className="font-semibold">{wallets.length}</span> wallets total
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold">{fundedWalletCount}</span> funded wallets
                    </p>
                    <p className="text-sm">
                      Contract:{" "}
                      <span className="font-mono text-xs">
                        {contractAddress ? `${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}` : "Not set"}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={handleMint}
                      disabled={isMinting || wallets.length === 0 || !contractAddress}
                      className="flex-1 ink-btn-terracotta"
                    >
                      {isMinting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Minting...
                        </>
                      ) : (
                        "Start Minting All Wallets"
                      )}
                    </Button>
                    {isMinting && (
                      <Button onClick={stopMinting} variant="destructive" className="gap-2">
                        <X className="w-4 h-4" />
                        Stop
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Transaction history */}
              <Card className="paper-card">
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
                          className="p-3 sm:p-4 rounded-md bg-secondary/50 border border-border/50 flex items-start gap-3"
                        >
                          <div className="mt-1 flex-shrink-0">
                            {tx.status === "success" && <CheckCircle className="w-5 h-5 text-accent" />}
                            {tx.status === "pending" && <Clock className="w-5 h-5 text-teal animate-spin" />}
                            {tx.status === "failed" && <AlertCircle className="w-5 h-5 text-destructive" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-mono break-all">{tx.hash}</p>
                            <div className="flex flex-wrap gap-2 mt-1 text-xs">
                              <span className="text-muted-foreground">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                              <span
                                className={
                                  tx.status === "success"
                                    ? "text-accent"
                                    : tx.status === "pending"
                                      ? "text-teal"
                                      : "text-destructive"
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
            </div>
          )}

          {/* Batches section */}
          {activeSection === "batches" && (
            <div className="space-y-6">
              {batches.length > 0 && (
                <Card className="paper-card">
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
                              ? "border-accent bg-accent/5"
                              : "border-border hover:border-accent/50"
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

              {wallets.length > 0 && !selectedBatchId && (
                <Card className="paper-card">
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
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        placeholder="e.g., Marketing Campaign Batch 1"
                      />
                    </div>
                    <Button onClick={saveBatchToDB} disabled={isSavingBatch} className="w-full ink-btn-terracotta">
                      {isSavingBatch ? "Saving..." : "Save Batch"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {batches.length === 0 && wallets.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">No batches yet. Generate wallets to create a batch.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
