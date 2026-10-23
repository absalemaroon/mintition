import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto"

/**
 * Application-level encryption for everything sensitive that goes into the database.
 *
 *  - AES-256-GCM (authenticated): tampering or swapping ciphertext between rows is detected.
 *  - A fresh random 96-bit IV for every value.
 *  - Each value is bound to a context string ("AAD", e.g. "wallet.pk|<row id>"), so a
 *    ciphertext copied into another column or row refuses to decrypt.
 *  - Keys come from the server environment only. A database leak alone reveals nothing.
 *
 * Env:
 *   DATA_ENCRYPTION_KEY               base64 of 32 random bytes  (required)
 *   DATA_ENCRYPTION_KEY_VERSION       integer, default 1
 *   DATA_ENCRYPTION_KEY_PREVIOUS      old key, kept only while re-encrypting after a rotation
 *   DATA_ENCRYPTION_KEY_PREVIOUS_VERSION
 *
 * Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const KEY_BYTES = 32
const SALT = Buffer.from("mintition/v1")

interface Keyring {
  activeVersion: number
  masters: Map<number, Buffer>
}

let keyringCache: Keyring | null = null
const subkeyCache = new Map<string, Buffer>()

function decodeKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new Error(`${name} is not set`)
  const key = Buffer.from(value.trim(), "base64")
  if (key.length !== KEY_BYTES) throw new Error(`${name} must be base64 of exactly 32 bytes`)
  return key
}

function getKeyring(): Keyring {
  if (keyringCache) return keyringCache
  const activeVersion = Number(process.env.DATA_ENCRYPTION_KEY_VERSION || 1)
  if (!Number.isInteger(activeVersion) || activeVersion < 1) throw new Error("DATA_ENCRYPTION_KEY_VERSION must be a positive integer")
  const masters = new Map<number, Buffer>()
  masters.set(activeVersion, decodeKey(process.env.DATA_ENCRYPTION_KEY, "DATA_ENCRYPTION_KEY"))
  if (process.env.DATA_ENCRYPTION_KEY_PREVIOUS) {
    const prev = Number(process.env.DATA_ENCRYPTION_KEY_PREVIOUS_VERSION || activeVersion - 1)
    masters.set(prev, decodeKey(process.env.DATA_ENCRYPTION_KEY_PREVIOUS, "DATA_ENCRYPTION_KEY_PREVIOUS"))
  }
  keyringCache = { activeVersion, masters }
  return keyringCache
}

/** Separate keys for encryption and for the blind index, both derived from the master key. */
function subkey(version: number, purpose: "enc" | "idx"): Buffer {
  const cacheId = `${version}:${purpose}`
  const hit = subkeyCache.get(cacheId)
  if (hit) return hit
  const master = getKeyring().masters.get(version)
  if (!master) throw new Error(`No encryption key available for version ${version}`)
  const derived = Buffer.from(hkdfSync("sha256", master, SALT, Buffer.from(`mintition:${purpose}`), KEY_BYTES))
  subkeyCache.set(cacheId, derived)
  return derived
}

const b64u = (buf: Buffer) => buf.toString("base64url")

/** Encrypts text. `context` must be supplied again to decrypt (use purpose + row id). */
export function encrypt(plaintext: string, context: string): string {
  const { activeVersion } = getKeyring()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", subkey(activeVersion, "enc"), iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return `v${activeVersion}:${b64u(iv)}:${b64u(ciphertext)}:${b64u(cipher.getAuthTag())}`
}

export function decrypt(token: string, context: string): string {
  const parts = token.split(":")
  if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) throw new Error("Malformed ciphertext")
  const version = Number(parts[0].slice(1))
  const iv = Buffer.from(parts[1], "base64url")
  const ciphertext = Buffer.from(parts[2], "base64url")
  const tag = Buffer.from(parts[3], "base64url")
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Malformed ciphertext")
  const decipher = createDecipheriv("aes-256-gcm", subkey(version, "enc"), iv)
  decipher.setAAD(Buffer.from(context, "utf8"))
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    // Same message for a wrong key, wrong context or tampering: reveal nothing.
    throw new Error("Decryption failed")
  }
}

export function encryptJson(value: unknown, context: string): string {
  return encrypt(JSON.stringify(value), context)
}

export function decryptJson<T = unknown>(token: string, context: string): T {
  return JSON.parse(decrypt(token, context)) as T
}

/** Deterministic keyed hash for look-ups and uniqueness without storing the plain value. */
export function blindIndex(value: string): string {
  return createHmac("sha256", subkey(getKeyring().activeVersion, "idx")).update(value).digest("hex")
}

export function encryptionConfigured(): boolean {
  try {
    getKeyring()
    return true
  } catch {
    return false
  }
}

/** Test helper: forget cached keys after changing env vars. */
export function __resetKeyCache() {
  keyringCache = null
  subkeyCache.clear()
}
