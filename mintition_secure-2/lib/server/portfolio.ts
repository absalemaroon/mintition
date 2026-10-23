import { ethers } from "ethers"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { decryptJson } from "@/lib/security/crypto"
import { ApiError } from "@/lib/security/guard"
import { isValidAddress, type ChainConfig } from "@/lib/chains"
import { ERC20_ABI, getProvider } from "@/lib/server/evm"
import { getTokenQuotes } from "@/lib/server/market"
import { nativePrices } from "@/lib/server/prices"
import { jobCtx } from "@/lib/server/jobs"
import { getWalletAddresses, listWallets } from "@/lib/server/vault"
import { getBalance, getMintInfo, getTokenBalance } from "@/lib/server/solana/rpc"

const db = () => createAdminClient() as any

export interface Holding {
  address: string
  symbol: string
  name: string | null
  logo: string | null
  decimals: number
  amount: string
  priceUsd: number | null
  valueUsd: number | null
}

export interface Portfolio {
  walletId: string
  address: string
  chainId: number
  native: { symbol: string; amount: string; priceUsd: number | null; valueUsd: number | null }
  holdings: Holding[]
  totalUsd: number | null
  transactions: { id: string; kind: string; status: string; hash: string; detail?: string; error?: string; contract?: string; timestamp: number }[]
}

/** Native balance, the tokens this wallet has traded through the app, USD values, and its transaction history. */
export async function walletPortfolio(chain: ChainConfig, walletId: string, extraToken?: string): Promise<Portfolio> {
  const wallets = await listWallets()
  const w = wallets.find((x) => x.id === walletId)
  void getWalletAddresses
  if (!w) throw new ApiError(404, "Wallet not found")
  if (w.family !== chain.family) throw new ApiError(400, `This is a ${w.family === "solana" ? "Solana" : "EVM"} wallet. Switch the network to see it.`)

  const { data: rows } = await db().from("transactions").select("id,kind,status,payload_enc,created_at,chain_id").eq("wallet_id", walletId).eq("chain_id", chain.chainId).order("created_at", { ascending: false }).limit(60)
  const transactions = (rows ?? []).map((r: any) => {
    let p: any = {}
    try {
      p = decryptJson(r.payload_enc, jobCtx.txRow(r.id))
    } catch {
      p = { error: "Unreadable record" }
    }
    return { id: r.id, kind: r.kind, status: r.status, hash: p.hash || (r.status === "failed" ? "failed" : "pending"), detail: p.detail, error: p.error, contract: p.contract, timestamp: Date.parse(r.created_at) }
  })

  const tokens = new Set<string>()
  for (const t of transactions) if (t.contract && t.contract !== "native" && isValidAddress(chain, t.contract)) tokens.add(t.contract)
  if (extraToken && isValidAddress(chain, extraToken)) tokens.add(extraToken)
  const tokenList = [...tokens].slice(0, 20)

  const solana = chain.family === "solana"
  const provider = solana ? null : await getProvider(chain.chainId)
  const nativeRaw = solana ? await getBalance(w.address) : await provider!.getBalance(w.address)
  const nativeAmount = ethers.formatUnits(nativeRaw, chain.nativeDecimals)

  const quotes = await getTokenQuotes(chain, tokenList)
  const holdings: Holding[] = []
  await Promise.all(
    tokenList.map(async (addr) => {
      try {
        let decimals: number
        let raw: bigint
        let symbol = quotes.get(addr)?.symbol ?? null
        if (solana) {
          const info = await getMintInfo(addr)
          decimals = info.decimals
          raw = await getTokenBalance(w.address, addr)
        } else {
          const c = new ethers.Contract(addr, ERC20_ABI, provider!)
          const [d, bal, sym] = await Promise.all([c.getFunction("decimals")().catch(() => 18), c.getFunction("balanceOf")(w.address) as Promise<bigint>, c.getFunction("symbol")().catch(() => null)])
          decimals = Number(d)
          raw = bal
          symbol = symbol ?? sym
        }
        const amount = ethers.formatUnits(raw, decimals)
        const q = quotes.get(addr)
        holdings.push({ address: addr, symbol: symbol || "TOKEN", name: q?.name ?? null, logo: q?.image ?? null, decimals, amount, priceUsd: q?.priceUsd ?? null, valueUsd: q?.priceUsd != null ? Number(amount) * q.priceUsd : null })
      } catch {
        /* skip unreadable token */
      }
    }),
  )
  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))

  const price = (await nativePrices([chain]))[chain.id]
  const nativeUsd = price != null ? Number(nativeAmount) * price : null
  const known = [nativeUsd, ...holdings.map((h) => h.valueUsd)].filter((v): v is number => v !== null)
  return {
    walletId,
    address: w.address,
    chainId: chain.chainId,
    native: { symbol: chain.nativeSymbol, amount: nativeAmount, priceUsd: price, valueUsd: nativeUsd },
    holdings: holdings.filter((h) => Number(h.amount) > 0),
    totalUsd: known.length ? known.reduce((a, b) => a + b, 0) : null,
    transactions,
  }
}
