import type { Wallet } from "./types"

const WALLETS_KEY = "celo_wallets_v2"
const TRANSACTIONS_KEY = "celo_transactions"
const CONTRACT_ADDRESS_KEY = "celo_contract_address"

export const storage = {
  // Wallets
  getWallets(): Wallet[] {
    if (typeof window === "undefined") return []
    const data = localStorage.getItem(WALLETS_KEY)
    return data ? JSON.parse(data) : []
  },

  saveWallets(wallets: Wallet[]): void {
    if (typeof window === "undefined") return
    localStorage.setItem(WALLETS_KEY, JSON.stringify(wallets))
  },

  addWallet(wallet: Wallet): void {
    const wallets = this.getWallets()
    wallets.push(wallet)
    this.saveWallets(wallets)
  },

  updateWallet(address: string, updates: Partial<Wallet>): void {
    const wallets = this.getWallets()
    const index = wallets.findIndex((w) => w.address === address)
    if (index !== -1) {
      wallets[index] = { ...wallets[index], ...updates }
      this.saveWallets(wallets)
    }
  },

  deleteWallet(address: string): void {
    const wallets = this.getWallets()
    this.saveWallets(wallets.filter((w) => w.address !== address))
  },

  clearWallets(): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(WALLETS_KEY)
  },

  saveContractAddress(address: string): void {
    if (typeof window === "undefined") return
    localStorage.setItem(CONTRACT_ADDRESS_KEY, address)
  },

  getContractAddress(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem(CONTRACT_ADDRESS_KEY)
  },

  clearContractAddress(): void {
    if (typeof window === "undefined") return
    localStorage.removeItem(CONTRACT_ADDRESS_KEY)
  },

  exportWalletsAsCSV(): string {
    const wallets = this.getWallets()
    const headers = ["Wallet #", "Address", "Private Key", "Funded", "Mints Completed", "Status"]
    const rows = wallets.map((w, i) => [
      i + 1,
      w.address,
      w.privateKey,
      w.funded ? "Yes" : "No",
      w.mintsCompleted,
      w.status || "idle",
    ])

    return [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")
  },

  importWalletsFromCSV(csv: string): Wallet[] {
    const lines = csv.trim().split("\n")
    const wallets: Wallet[] = []

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const [, address, privateKey, funded, mintsCompleted] = lines[i].split(",").map((v) => v.replace(/"/g, ""))

      if (address && privateKey) {
        wallets.push({
          address,
          privateKey,
          funded: funded === "Yes",
          mintsCompleted: Number(mintsCompleted) || 0,
          status: "idle",
        })
      }
    }

    return wallets
  },
}
