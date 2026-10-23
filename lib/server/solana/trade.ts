import { TradeError } from "@/lib/server/swap"
import { base58Encode } from "@/lib/server/solana/base58"
import { parseSecretKey } from "@/lib/server/solana/keys"
import { jupiterQuote, jupiterSwapTransaction } from "@/lib/server/solana/jupiter"
import { getBalance, getLatestBlockhash, getMintInfo, getTokenAccountAmount, getTokenBalance, simulate } from "@/lib/server/solana/rpc"
import {
  ASSOCIATED_TOKEN_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, WRAPPED_SOL_MINT, associatedTokenAddress, compileLegacyMessage, createAssociatedTokenAccountIdempotent,
  signExternalTransaction, signLegacy, systemTransfer, tokenTransferChecked,
} from "@/lib/server/solana/tx"

/** Builds, signs and safety-checks one Solana action. No database access here: the worker handles state. */

export interface SolJob {
  kind: "buy" | "sell" | "transfer" | "mint"
  contract: string
  params: any
}

export interface Prepared {
  unsigned: Uint8Array
  /** true = built by an outside service (swap), so it gets the strict signer checks. */
  external: boolean
  legacyMessage?: Uint8Array
  lastValidBlockHeight: number
  detail: string
  /** Most SOL (lamports) the wallet may lose in this transaction, including fees and account rent. */
  maxLamportsOut: bigint
}

const MARGIN = 10_000_000n // 0.01 SOL: fees, priority fee and token-account rent
const BASE_FEE = 5_000n

const fmt = (v: bigint, d: number) => Number(Number(v) / 10 ** d).toLocaleString("en-US", { maximumSignificantDigits: 6 })
const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`

export async function prepareSolana(job: SolJob, meta: { to?: string } | null, wallet: { address: string }): Promise<Prepared> {
  const p = job.params
  const address = wallet.address

  if (job.kind === "buy" || job.kind === "sell") {
    const mintInfo = await getMintInfo(job.contract)
    if (!mintInfo.exists) throw new TradeError("permanent", "That token does not exist on Solana")
    const label = p.symbol || short(job.contract)
    let inputMint: string
    let outputMint: string
    let amount: bigint
    let allowed = MARGIN
    if (job.kind === "buy") {
      amount = BigInt(p.amountWei)
      const balance = await getBalance(address)
      if (balance < amount + 3_000_000n) throw new TradeError("permanent", `Not enough SOL: wallet has ${fmt(balance, 9)}, needs ${p.amountDisplay} plus fees`)
      inputMint = WRAPPED_SOL_MINT
      outputMint = job.contract
      allowed = amount + MARGIN
    } else {
      const bal = await getTokenBalance(address, job.contract)
      amount = (bal * BigInt(Math.round(p.percent))) / 100n
      if (amount <= 0n) throw new TradeError("permanent", "This wallet holds none of this token")
      inputMint = job.contract
      outputMint = WRAPPED_SOL_MINT
    }
    const quote = await jupiterQuote({ inputMint, outputMint, amount, slippagePct: p.slippage })
    if (quote.priceImpactPct !== null && quote.priceImpactPct > p.maxImpact) {
      throw new TradeError("permanent", `Price impact ${quote.priceImpactPct.toFixed(1)}% is above your ${p.maxImpact}% limit. Not traded.`)
    }
    const swap = await jupiterSwapTransaction(quote, address)
    const detail =
      job.kind === "buy"
        ? `Bought ~${fmt(quote.outAmount, mintInfo.decimals)} ${label} for ${p.amountDisplay} SOL`
        : `Sold ${fmt(amount, mintInfo.decimals)} ${label} for ~${fmt(quote.outAmount, 9)} SOL`
    return { unsigned: swap.txBytes, external: true, lastValidBlockHeight: swap.lastValidBlockHeight, detail, maxLamportsOut: allowed }
  }

  if (job.kind === "transfer") {
    if (!meta?.to) throw new TradeError("permanent", "No destination for this wallet")
    const to = meta.to
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhash()

    if (p.asset === "native") {
      const balance = await getBalance(address)
      const lamports = p.mode === "fixed" ? BigInt(p.amountWei) : balance - BASE_FEE
      if (lamports <= 0n || balance < lamports + BASE_FEE) throw new TradeError("permanent", "Not enough SOL to send and pay the fee")
      const message = compileLegacyMessage(address, [systemTransfer(address, to, lamports)], blockhash)
      return { unsigned: message, external: false, legacyMessage: message, lastValidBlockHeight, detail: `Sent ${fmt(lamports, 9)} SOL to ${short(to)}`, maxLamportsOut: lamports + BASE_FEE * 2n }
    }

    const mintInfo = await getMintInfo(job.contract)
    if (!mintInfo.exists) throw new TradeError("permanent", "That token does not exist on Solana")
    if (mintInfo.program !== TOKEN_PROGRAM && mintInfo.program !== TOKEN_2022_PROGRAM) throw new TradeError("permanent", "Unsupported token program")
    const src = associatedTokenAddress(address, job.contract, mintInfo.program)
    const dst = associatedTokenAddress(to, job.contract, mintInfo.program)
    const have = await getTokenAccountAmount(src)
    if (have === null) throw new TradeError("permanent", "This wallet has no account for that token")
    const amount = p.mode === "fixed" ? BigInt(p.amountWei) : have
    if (amount <= 0n || have < amount) throw new TradeError("permanent", "Not enough of that token in this wallet")
    const message = compileLegacyMessage(
      address,
      [createAssociatedTokenAccountIdempotent(address, dst, to, job.contract, mintInfo.program), tokenTransferChecked(src, job.contract, dst, address, amount, mintInfo.decimals, mintInfo.program)],
      blockhash,
    )
    return { unsigned: message, external: false, legacyMessage: message, lastValidBlockHeight, detail: `Sent ${fmt(amount, mintInfo.decimals)} ${p.symbol || short(job.contract)} to ${short(to)}`, maxLamportsOut: MARGIN }
  }

  throw new TradeError("permanent", "NFT minting is not supported on Solana yet")
}

/** Pure check, exported for tests: the simulated transaction must not take more SOL than expected. */
export function assertNoDrain(before: bigint, after: bigint | null, allowedOut: bigint) {
  if (after === null) return // account would not exist afterwards (a full sweep): the amount was already bounded
  if (before - after > allowedOut) throw new TradeError("permanent", "Safety stop: the transaction would move more SOL than expected. Nothing was sent.")
}

/** Signs (with the strict checks for outside-built transactions), then simulates and checks nothing drains the wallet. */
export async function signAndCheck(prepared: Prepared, wallet: { address: string; privateKey: string }): Promise<{ signedBase64: string; signature: string }> {
  const key = parseSecretKey(wallet.privateKey)
  if (key.address !== wallet.address) throw new TradeError("permanent", "Wallet key does not match its address")
  let signed: { signed: Uint8Array; signature: string }
  try {
    signed = prepared.external ? signExternalTransaction(prepared.unsigned, wallet.privateKey) : signLegacy(prepared.legacyMessage!, wallet.privateKey)
  } catch (e) {
    throw new TradeError("permanent", `Safety stop: ${e instanceof Error ? e.message : "could not sign"}`)
  }
  const signedBase64 = Buffer.from(signed.signed).toString("base64")
  const before = await getBalance(wallet.address)
  const sim = await simulate(signedBase64, wallet.address)
  if (sim.err) throw new TradeError("permanent", `The transaction would fail, so it was not sent: ${JSON.stringify(sim.err).slice(0, 120)}`)
  assertNoDrain(before, sim.lamportsAfter, prepared.maxLamportsOut)
  return { signedBase64, signature: signed.signature }
}

export { base58Encode, ASSOCIATED_TOKEN_PROGRAM }
