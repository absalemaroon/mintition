const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const MAP = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]))

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ""
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out
    n /= 58n
  }
  return "1".repeat(zeros) + out
}

export function base58Decode(text: string): Uint8Array {
  let zeros = 0
  while (zeros < text.length && text[zeros] === "1") zeros++
  let n = 0n
  for (const ch of text) {
    const v = MAP.get(ch)
    if (v === undefined) throw new Error("Invalid base58 character")
    n = n * 58n + BigInt(v)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes])
}

/** A Solana address is 32 bytes in base58 (32 to 44 characters). */
export function isSolanaAddress(value: string): boolean {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false
  try {
    return base58Decode(value).length === 32
  } catch {
    return false
  }
}
