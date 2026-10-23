import { createHash } from "node:crypto"
import { base58Decode, base58Encode } from "@/lib/server/solana/base58"
import { signMessage } from "@/lib/server/solana/keys"
import { parseSecretKey } from "@/lib/server/solana/keys"

/** Solana transaction building and signing, written against the public wire format. No extra packages. */

export const SYSTEM_PROGRAM = "11111111111111111111111111111111"
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112"

export function encodeCompactU16(value: number): number[] {
  const out: number[] = []
  let v = value
  for (;;) {
    const low = v & 0x7f
    v >>= 7
    if (v === 0) {
      out.push(low)
      return out
    }
    out.push(low | 0x80)
  }
}

export function decodeCompactU16(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0
  let shift = 0
  let i = offset
  for (;;) {
    if (i >= bytes.length) throw new Error("Truncated transaction")
    const b = bytes[i++]
    value |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) return { value, next: i }
    shift += 7
    if (shift > 14) throw new Error("Bad length in transaction")
  }
}

const u64le = (n: bigint): number[] => {
  const out: number[] = []
  let v = n
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn))
    v >>= 8n
  }
  return out
}

export interface AccountMeta {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

export interface Instruction {
  programId: string
  keys: AccountMeta[]
  data: Uint8Array
}

/** Builds the unsigned message for a legacy transaction. */
export function compileLegacyMessage(feePayer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, { signer: boolean; writable: boolean }>()
  const add = (pubkey: string, signer: boolean, writable: boolean) => {
    const cur = metas.get(pubkey)
    metas.set(pubkey, { signer: (cur?.signer ?? false) || signer, writable: (cur?.writable ?? false) || writable })
  }
  add(feePayer, true, true)
  for (const ix of instructions) {
    for (const k of ix.keys) add(k.pubkey, k.isSigner, k.isWritable)
    add(ix.programId, false, false)
  }
  const keys = [...metas.entries()]
  const rank = (m: { signer: boolean; writable: boolean }) => (m.signer ? (m.writable ? 0 : 1) : m.writable ? 2 : 3)
  const ordered = keys
    .map(([pubkey, m], idx) => ({ pubkey, ...m, idx }))
    .sort((a, b) => (a.pubkey === feePayer ? -1 : b.pubkey === feePayer ? 1 : rank(a) - rank(b) || a.idx - b.idx))

  const numSigners = ordered.filter((k) => k.signer).length
  const readonlySigned = ordered.filter((k) => k.signer && !k.writable).length
  const readonlyUnsigned = ordered.filter((k) => !k.signer && !k.writable).length
  const index = new Map(ordered.map((k, i) => [k.pubkey, i]))

  const out: number[] = [numSigners, readonlySigned, readonlyUnsigned, ...encodeCompactU16(ordered.length)]
  for (const k of ordered) out.push(...base58Decode(k.pubkey))
  out.push(...base58Decode(recentBlockhash), ...encodeCompactU16(instructions.length))
  for (const ix of instructions) {
    out.push(index.get(ix.programId)!, ...encodeCompactU16(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)!), ...encodeCompactU16(ix.data.length), ...ix.data)
  }
  return Uint8Array.from(out)
}

export function serializeTransaction(signatures: Uint8Array[], message: Uint8Array): Uint8Array {
  return Uint8Array.from([...encodeCompactU16(signatures.length), ...signatures.flatMap((s) => [...s]), ...message])
}

export interface ParsedTransaction {
  signatures: Uint8Array[]
  message: Uint8Array
  version: "legacy" | number
  numRequiredSignatures: number
  accountKeys: string[]
  feePayer: string
}

export function parseTransaction(bytes: Uint8Array): ParsedTransaction {
  const { value: sigCount, next } = decodeCompactU16(bytes, 0)
  let offset = next
  const signatures: Uint8Array[] = []
  for (let i = 0; i < sigCount; i++) {
    if (offset + 64 > bytes.length) throw new Error("Truncated transaction")
    signatures.push(bytes.slice(offset, offset + 64))
    offset += 64
  }
  const message = bytes.slice(offset)
  let p = 0
  let version: "legacy" | number = "legacy"
  if (message[0] & 0x80) {
    version = message[0] & 0x7f
    p = 1
  }
  const numRequiredSignatures = message[p]
  p += 3 // header: required signatures, readonly signed, readonly unsigned
  const { value: keyCount, next: keysStart } = decodeCompactU16(message, p)
  const accountKeys: string[] = []
  for (let i = 0; i < keyCount; i++) {
    const start = keysStart + i * 32
    if (start + 32 > message.length) throw new Error("Truncated transaction")
    accountKeys.push(base58Encode(message.slice(start, start + 32)))
  }
  if (accountKeys.length === 0) throw new Error("Transaction has no accounts")
  return { signatures, message, version, numRequiredSignatures, accountKeys, feePayer: accountKeys[0] }
}

/**
 * Signs a transaction that someone else built (for example a swap from an API), but ONLY if it is safe to:
 * we must be the fee payer and the only required signer. Anything else is refused.
 */
export function signExternalTransaction(txBytes: Uint8Array, secretKey: string): { signed: Uint8Array; signature: string } {
  const pair = parseSecretKey(secretKey)
  const parsed = parseTransaction(txBytes)
  if (parsed.feePayer !== pair.address) throw new Error("Transaction fee payer is not this wallet")
  if (parsed.numRequiredSignatures !== 1 || parsed.signatures.length !== 1) throw new Error("Transaction needs signatures from other parties")
  const signature = signMessage(secretKey, parsed.message)
  return { signed: serializeTransaction([signature], parsed.message), signature: base58Encode(signature) }
}

/** Signs a transaction we built ourselves. */
export function signLegacy(message: Uint8Array, secretKey: string): { signed: Uint8Array; signature: string } {
  const signature = signMessage(secretKey, message)
  return { signed: serializeTransaction([signature], message), signature: base58Encode(signature) }
}

// ---------- instructions ----------

export function systemTransfer(from: string, to: string, lamports: bigint): Instruction {
  return {
    programId: SYSTEM_PROGRAM,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: Uint8Array.from([2, 0, 0, 0, ...u64le(lamports)]),
  }
}

export function createAssociatedTokenAccountIdempotent(payer: string, ata: string, owner: string, mint: string, tokenProgram: string): Instruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Uint8Array.from([1]),
  }
}

export function tokenTransferChecked(source: string, mint: string, destination: string, owner: string, amount: bigint, decimals: number, tokenProgram: string): Instruction {
  return {
    programId: tokenProgram,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.from([12, ...u64le(amount), decimals]),
  }
}

// ---------- program derived addresses ----------

const P = 2n ** 255n - 19n
const D = (((-121665n % P) + P) % P * modPow(121666n, P - 2n, P)) % P

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  let b = ((base % mod) + mod) % mod
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod
    b = (b * b) % mod
    e >>= 1n
  }
  return result
}

/** True if the 32 bytes decode to a point on the ed25519 curve (such an address has a private key). */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false
  let y = 0n
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i])
  const signBit = (bytes[31] & 0x80) !== 0
  y %= P
  const y2 = (y * y) % P
  const u = (y2 - 1n + P) % P
  const v = (D * y2 + 1n) % P
  const x2 = (u * modPow(v, P - 2n, P)) % P
  if (x2 === 0n) return !signBit
  return modPow(x2, (P - 1n) / 2n, P) === 1n // Euler's criterion: x2 must be a square
}

export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = base58Decode(programId)
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash("sha256")
      .update(Buffer.concat([...seeds.map((s) => Buffer.from(s)), Buffer.from([bump]), Buffer.from(program), Buffer.from("ProgramDerivedAddress")]))
      .digest()
    if (!isOnCurve(new Uint8Array(hash))) return base58Encode(new Uint8Array(hash))
  }
  throw new Error("Could not derive a program address")
}

export function associatedTokenAddress(owner: string, mint: string, tokenProgram: string = TOKEN_PROGRAM): string {
  return findProgramAddress([base58Decode(owner), base58Decode(tokenProgram), base58Decode(mint)], ASSOCIATED_TOKEN_PROGRAM)
}
