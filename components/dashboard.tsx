"use client"

import { useRouter } from "next/navigation"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogOut, Loader2, X, WalletIcon, Zap, Coins } from "lucide-react"
import { ethers } from "ethers"
import { toast } from "sonner"
import { storage } from "@/lib/storage"
import { generateWallets } from "@/lib/wallet-utils"
import { autoFundWallets } from "@/lib/auto-funding"
import { mintCredential } from "@/lib/use-web3-contract"
import { Progress } from "@/components/ui/progress"
import { getAllBatchesAction, saveBatchToDB, loadBatchFromDB } from "@/lib/batch-utils" // Importing missing functions

interface WalletData {
  address: string
  privateKey: string
  status?: "funded" | "not_funded" | "funding" | "minted"
  mintsCompleted?: number
  fundingStatus?: string // Keeping for broader compatibility if needed, though status seems primary
  balance?: string // Keeping for broader compatibility if needed
}

interface MintTransaction {
  hash: string
  timestamp: number
  status: "success" | "failed" | "pending" // Added pending status
  wallet: string
}

export default function Dashboard() {
  const router = useRouter()
  const [wallets, setWallets] = useState<WalletData[]>([])
  const [generatedCount, setGeneratedCount] = useState(5)
  const [contractAddress, setContractAddress] = useState("0x97161a87229d3A8E0Bd2Fbcd408eE6c9f65823ae")
  const [isContractValid, setIsContractValid] = useState(false)
  const [gasAmount, setGasAmount] = useState("0.1")
  const [networkId, setNetworkId] = useState("42220")
  const [transactions, setTransactions] = useState<MintTransaction[]>([])
  const [isMinting, setIsMinting] = useState(false)
  const [isFunding, setIsFunding] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [mintAbortController, setMintAbortController] = useState<AbortController | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [batches, setBatches] = useState<any[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>("")
  const [batchName, setBatchName] = useState(`Batch ${Date.now()}`)
  const [isSavingBatch, setIsSavingBatch] = useState(false)
  const [userEmail, setUserEmail] = useState<string>("")
  const [fundingProgress, setFundingProgress] = useState(0)
  const [connectedAddress, setConnectedAddress] = useState<string>("") // Declaring setConnectedAddress

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
      const walletsWithStatus = savedWallets.map((w: any) => ({
        ...w,
        status: w.funded ? "funded" : w.status || "not_funded",
        fundingStatus: w.funded ? "funded" : w.fundingStatus || "not_funded",
        mintsCompleted: w.mintsCompleted || 0,
      }))
      setWallets(walletsWithStatus)
      toast.success("Loaded saved wallets", {
        description: `Loaded ${savedWallets.length} wallets from storage`,
      })
    }

    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const web3Provider = new ethers.BrowserProvider(window.ethereum)
        setProvider(web3Provider)
        window.ethereum
          .request({ method: "eth_accounts" })
          .then((accounts: string[]) => {
            if (accounts.length > 0) {
              setConnectedAddress(accounts[0])
            }
          })
          .catch(console.error)
      } catch (error) {
        console.error("Error initializing Web3 provider:", error)
        toast.error("Web3 Provider Error", { description: "Could not initialize wallet connection." })
      }
    } else {
      toast.warning("MetaMask not detected", { description: "Please install MetaMask for wallet features." })
    }
  }, [])

  useEffect(() => {
    const loadBatches = async () => {
      try {
        const allBatches = await getAllBatchesAction()
        setBatches(allBatches)
      } catch (error) {
        console.error("Error loading batches:", error)
        toast.error("Failed to load batches", { description: "Could not fetch saved batches." })
      }
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

  const handleGenerateWallets = (count: number) => {
    setIsGenerating(true)
    try {
      const newWallets = generateWallets(count)
      const withStatus = newWallets.map((w) => ({
        ...w,
        status: "not_funded" as const,
        fundingStatus: "not_funded" as const,
        mintsCompleted: 0,
        balance: "0",
      }))
      setWallets(withStatus)
      storage.saveWallets(withStatus)
      toast.success(`Generated ${count} wallets`, {
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

  const handleAutoFund = async (privateKey: string, amountPerWallet: string) => {
    if (!wallets.length) {
      toast.error("No wallets to fund", {
        description: "Generate wallets first",
      })
      return
    }

    if (!provider) {
      toast.error("Provider not available", {
        description: "Browser Web3 provider is required. Please connect your wallet.",
      })
      return
    }

    setIsFunding(true)
    setFundingProgress(0)

    try {
      const updatedWallets = await autoFundWallets(wallets, privateKey, amountPerWallet, provider, (progress) => {
        setFundingProgress(progress)
      })

      setWallets(updatedWallets)
      storage.saveWallets(updatedWallets)
      toast.success("Funding complete!", {
        description: `Successfully funded ${updatedWallets.filter((w) => w.status === "funded").length}/${wallets.length} wallets.`,
      })
      setFundingProgress(0)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      toast.error("Funding failed", {
        description: errorMsg,
      })
      console.error("Error in batch funding:", error)
      setWallets((prevWallets) =>
        prevWallets.map((w) => ({
          ...w,
          status: w.status === "funding" ? "not_funded" : w.status,
          fundingStatus: w.status === "funding" ? "funding_failed" : w.fundingStatus,
        })),
      )
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

    if (wallets.length === 0) {
      toast.error("No wallets generated", {
        description: "Generate wallets first before minting",
      })
      return
    }

    if (!provider) {
      toast.error("Provider unavailable", {
        description: "Web3 provider is required. Please ensure MetaMask is available.",
      })
      return
    }

    const controller = new AbortController()
    setMintAbortController(controller)
    setIsMinting(true)

    const mintingToastId = toast.loading("Minting started...", {
      description: `Minting NFTs with ${wallets.length} wallets`,
    })

    let successCount = 0
    let failureCount = 0

    for (let i = 0; i < wallets.length; i++) {
      if (controller.signal.aborted) {
        break
      }

      const wallet = wallets[i]

      try {
        const walletInstance = new ethers.Wallet(wallet.privateKey, provider)

        const ipfsUri = `data:application/json;base64,${btoa(
          JSON.stringify({
            name: `Credential #${i + 1}`,
            description: "Minted credential NFT",
            image: "https://via.placeholder.com/256",
            attributes: [{ trait_type: "Index", value: `${i + 1}` }],
          }),
        )}`

        const result = await mintCredential(walletInstance, wallet.address, ipfsUri, contractAddress)

        if (result && result.transactionHash) {
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

  const addTransaction = (tx: MintTransaction) => {
    setTransactions((prev) => [tx, ...prev])
  }

  const stopMinting = () => {
    if (mintAbortController) {
      mintAbortController.abort()
      setMintAbortController(null)
      toast.info("Minting stopped", {
        description: "Stopped by user",
      })
    }
  }

  const handleContractAddressChange = (value: string) => {
    setContractAddress(value)
  } // Declaring handleContractAddressChange

  const AutoFundingSection = ({
    onFund,
    isFunding,
    fundingProgress,
  }: {
    onFund: (privateKey: string, amountPerWallet: string) => void
    isFunding: boolean
    fundingProgress: number
  }) => {
    const [privateKey, setPrivateKey] = useState("")
    const [amountPerWallet, setAmountPerWallet] = useState("0.1")

    const handleSubmit = () => {
      if (!privateKey) {
        toast.error("Private key required", { description: "Please enter your private key to fund wallets." })
        return
      }
      onFund(privateKey, amountPerWallet)
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Your Private Key</label>
          <Input
            type="password"
            placeholder="0x..."
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            disabled={isFunding}
            className="bg-slate-700 border-slate-600 text-white"
          />
          <p className="text-xs text-slate-400 mt-1">
            Your private key is only used to sign transactions and is never stored.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Amount per Wallet (CELO)</label>
          <Input
            type="number"
            placeholder="0.1"
            value={amountPerWallet}
            onChange={(e) => setAmountPerWallet(e.target.value)}
            disabled={isFunding}
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        {isFunding && (
          <div className="space-y-2">
            <Progress value={fundingProgress} className="w-full" />
            <p className="text-sm text-slate-400">{Math.round(fundingProgress)}% complete</p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isFunding || !privateKey}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          {isFunding ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Funding...
            </>
          ) : (
            "Auto-Fund Wallets"
          )}
        </Button>
      </div>
    )
  }

  const fundedWalletCount = wallets.filter((w) => w.status === "funded").length
  const totalMints = wallets.reduce((sum, w) => sum + (w.mintsCompleted || 0), 0)

  const fundedCount = wallets.filter((w) => w.status === "funded").length
  const notFundedCount = wallets.filter((w) => w.status === "not_funded").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Mintition</h1>
            {userEmail && <p className="text-muted-foreground">{userEmail}</p>}
          </div>
          <Button onClick={handleLogout} variant="outline" className="gap-2 bg-transparent">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>

        <Tabs defaultValue="wallets" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-slate-800">
            <TabsTrigger value="wallets" className="flex items-center gap-2">
              <WalletIcon className="w-4 h-4" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="funding" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Auto-Funding
            </TabsTrigger>
            <TabsTrigger value="minting" className="flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Minting
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wallets" className="space-y-6">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader>
                <CardTitle>Generate Wallets</CardTitle>
                <CardDescription>Create new wallets for minting NFTs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleGenerateWallets(10)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isGenerating}
                  >
                    Generate 10
                  </Button>
                  <Button
                    onClick={() => handleGenerateWallets(50)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isGenerating}
                  >
                    Generate 50
                  </Button>
                  <Button
                    onClick={() => handleGenerateWallets(100)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isGenerating}
                  >
                    Generate 100
                  </Button>
                  <Button
                    onClick={() => handleGenerateWallets(500)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isGenerating}
                  >
                    Generate 500
                  </Button>
                </div>
              </CardContent>
            </Card>

            {wallets.length > 0 && (
              <Card className="border-slate-700 bg-slate-800">
                <CardHeader>
                  <CardTitle>Wallet Summary</CardTitle>
                  <CardDescription>Total wallets: {wallets.length}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-700 rounded-lg">
                      <p className="text-sm text-slate-400">Total Wallets</p>
                      <p className="text-2xl font-bold text-white">{wallets.length}</p>
                    </div>
                    <div className="p-4 bg-green-900 rounded-lg">
                      <p className="text-sm text-green-200">Funded</p>
                      <p className="text-2xl font-bold text-green-400">{fundedCount}</p>
                    </div>
                    <div className="p-4 bg-red-900 rounded-lg">
                      <p className="text-sm text-red-200">Not Funded</p>
                      <p className="text-2xl font-bold text-red-400">{notFundedCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {wallets.length > 0 && (
              <Card className="border-slate-700 bg-slate-800">
                <CardHeader>
                  <CardTitle>Generated Wallets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {wallets.map((wallet, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-slate-700 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono text-slate-300">
                            {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {wallet.status === "funded" ? (
                            <span className="text-green-400 text-sm">✓ Funded</span>
                          ) : (
                            <span className="text-red-400 text-sm">✗ Not Funded</span>
                          )}
                          {wallet.mintsCompleted && wallet.mintsCompleted > 0 ? (
                            <span className="text-blue-400 text-sm">{wallet.mintsCompleted} mints</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="funding" className="space-y-6">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader>
                <CardTitle>Auto-Fund Wallets</CardTitle>
                <CardDescription>Use your private key to automatically fund all wallets</CardDescription>
              </CardHeader>
              <CardContent>
                <AutoFundingSection onFund={handleAutoFund} isFunding={isFunding} fundingProgress={fundingProgress} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="minting" className="space-y-6">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader>
                <CardTitle>Smart Contract Configuration</CardTitle>
                <CardDescription>Enter your NFT contract address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Smart Contract Address</label>
                  <Input
                    placeholder="0x..."
                    value={contractAddress}
                    onChange={(e) => handleContractAddressChange(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                  <p className="text-xs text-slate-400 mt-2">Enter the contract address you want to mint from</p>
                </div>
              </CardContent>
            </Card>

            {wallets.length > 0 && (
              <Card className="border-slate-700 bg-slate-800">
                <CardHeader>
                  <CardTitle>Start Minting</CardTitle>
                  <CardDescription>Mint NFTs across all generated wallets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-slate-700 rounded-lg">
                    <p className="text-sm text-slate-300 mb-2">
                      Wallets to Mint: <span className="font-bold text-white">{wallets.length}</span>
                    </p>
                    <p className="text-sm text-slate-300">
                      Contract:{" "}
                      <span className="font-mono text-xs">
                        {contractAddress ? `${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}` : "Not set"}
                      </span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleMint}
                      disabled={isMinting || wallets.length === 0 || !contractAddress}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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
            )}

            {transactions.length > 0 && (
              <Card className="border-slate-700 bg-slate-800">
                <CardHeader>
                  <CardTitle>Transaction History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {transactions.map((tx, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-slate-700 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono text-slate-300">
                            {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                          </p>
                        </div>
                        <span
                          className={
                            tx.status === "success"
                              ? "text-green-400 text-sm"
                              : tx.status === "pending"
                                ? "text-yellow-400 text-sm"
                                : "text-red-400 text-sm"
                          }
                        >
                          {tx.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <section className="space-y-4 mt-8">
          <h2 className="text-2xl font-bold text-white">Wallet Batches</h2>

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
                      <h3 className="font-semibold text-white">{batch.name}</h3>
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
            <Card className="glass">
              <CardHeader>
                <CardTitle>Save Current Batch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Batch Name</label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg bg-background text-white border-slate-600"
                    placeholder="e.g., Marketing Campaign Batch 1"
                  />
                </div>
                <Button onClick={() => saveBatchToDB(wallets, batchName)} disabled={isSavingBatch} className="w-full">
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
