import { createPrivateKey, createPublicKey, randomBytes, sign as edSign, verify as edVerify, type KeyObject } from "node:crypto"
import { base58Decode, base58Encode } from "@/lib/server/solana/base58"

/** ed25519 keys for Solana, using Node's built-in crypto (no extra packages). */

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

export interface SolanaKeypair {
  /** 32-byte public key. */
  publicKey: Uint8Array
  /** 32-byte seed. */
  seed: Uint8Array
  address: string
  /** base58 of seed + public key (64 bytes). This is the format Phantom and Solflare export and import. */
  secretKey: string
}

function privateKeyObject(seed: Uint8Array): KeyObject {
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" })
}

export function publicKeyFromSeed(seed: Uint8Array): Uint8Array {
  const der = createPublicKey(privateKeyObject(seed)).export({ format: "der", type: "spki" }) as Buffer
  return new Uint8Array(der.subarray(der.length - 32))
}

export function keypairFromSeed(seed: Uint8Array): SolanaKeypair {
  if (seed.length !== 32) throw new Error("A Solana seed is 32 bytes")
  const publicKey = publicKeyFromSeed(seed)
  return { publicKey, seed, address: base58Encode(publicKey), secretKey: base58Encode(Uint8Array.from([...seed, ...publicKey])) }
}

export function generateKeypair(): SolanaKeypair {
  return keypairFromSeed(new Uint8Array(randomBytes(32)))
}

/**
 * Reads a secret key as exported by wallets: base58 of 64 bytes, base58 of a 32-byte seed,
 * or the JSON array of numbers used by the Solana CLI. The address is always derived from the key,
 * never trusted from the input.
 */
export function parseSecretKey(input: string): SolanaKeypair {
  const text = input.trim()
  let bytes: Uint8Array
  if (text.startsWith("[")) {
    const arr = JSON.parse(text)
    if (!Array.isArray(arr) || !arr.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error("Invalid key array")
    bytes = Uint8Array.from(arr)
  } else {
    bytes = base58Decode(text)
  }
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error("A Solana secret key is 32 or 64 bytes")
  const pair = keypairFromSeed(bytes.slice(0, 32))
  if (bytes.length === 64 && Buffer.compare(Buffer.from(bytes.slice(32)), Buffer.from(pair.publicKey)) !== 0) throw new Error("Secret key does not match its public key")
  return pair
}

/** Signs a message with a base58 secret key (as stored in the vault). Returns the 64-byte signature. */
export function signMessage(secretKey: string, message: Uint8Array): Uint8Array {
  const pair = parseSecretKey(secretKey)
  return new Uint8Array(edSign(null, Buffer.from(message), privateKeyObject(pair.seed)))
}

export function verifySignature(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey)]), format: "der", type: "spki" })
  return edVerify(null, Buffer.from(message), key, Buffer.from(signature))
}
