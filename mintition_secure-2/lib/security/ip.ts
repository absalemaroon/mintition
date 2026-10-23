/**
 * IP parsing and CIDR matching for IPv4 and IPv6. No dependencies, usable in any runtime.
 * "1.2.3.4" means exactly that address. "1.2.3.0/24" means the whole range.
 */

export interface ParsedIp {
  version: 4 | 6
  bytes: number[] // 4 or 16
}

function parseV4(text: string): number[] | null {
  const parts = text.split(".")
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

function parseV6(input: string): number[] | null {
  let text = input
  const zone = text.indexOf("%")
  if (zone !== -1) text = text.slice(0, zone)
  if (!text.includes(":")) return null

  // Embedded IPv4 tail, e.g. ::ffff:1.2.3.4
  let tail: number[] = []
  const lastColon = text.lastIndexOf(":")
  const lastPart = text.slice(lastColon + 1)
  if (lastPart.includes(".")) {
    const v4 = parseV4(lastPart)
    if (!v4) return null
    tail = v4
    text = text.slice(0, lastColon + 1) + "0:0"
  }

  const halves = text.split("::")
  if (halves.length > 2) return null
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"))
  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null

  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...rest]
  const bytes: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    const n = parseInt(group, 16)
    bytes.push(n >> 8, n & 0xff)
  }
  if (tail.length) {
    bytes[12] = tail[0]
    bytes[13] = tail[1]
    bytes[14] = tail[2]
    bytes[15] = tail[3]
  }
  return bytes.length === 16 ? bytes : null
}

export function parseIp(input: string): ParsedIp | null {
  const text = input.trim()
  const v4 = parseV4(text)
  if (v4) return { version: 4, bytes: v4 }
  const v6 = parseV6(text)
  if (!v6) return null
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as the IPv4 address.
  const mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff
  return mapped ? { version: 4, bytes: v6.slice(12) } : { version: 6, bytes: v6 }
}

export interface ParsedCidr {
  ip: ParsedIp
  prefix: number
}

export function parseCidr(input: string): ParsedCidr | null {
  const text = input.trim()
  const slash = text.indexOf("/")
  const ip = parseIp(slash === -1 ? text : text.slice(0, slash))
  if (!ip) return null
  const max = ip.version === 4 ? 32 : 128
  if (slash === -1) return { ip, prefix: max }
  const prefixText = text.slice(slash + 1)
  if (!/^\d{1,3}$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  if (prefix > max) return null
  return { ip, prefix }
}

function matches(ip: ParsedIp, cidr: ParsedCidr): boolean {
  if (ip.version !== cidr.ip.version) return false
  let bits = cidr.prefix
  for (let i = 0; i < ip.bytes.length && bits > 0; i++) {
    const take = Math.min(8, bits)
    const mask = (0xff << (8 - take)) & 0xff
    if ((ip.bytes[i] & mask) !== (cidr.ip.bytes[i] & mask)) return false
    bits -= take
  }
  return true
}

/** True if `ip` is inside any of the entries. Malformed entries never match. */
export function ipMatchesAny(ip: string | null | undefined, entries: string[]): boolean {
  if (!ip) return false
  const parsed = parseIp(ip)
  if (!parsed) return false
  return entries.some((entry) => {
    const cidr = parseCidr(entry)
    return cidr ? matches(parsed, cidr) : false
  })
}

/** Canonical text for storing, e.g. "1.2.3.4" -> "1.2.3.4/32". Returns null if invalid. */
export function normalizeCidr(input: string): string | null {
  const cidr = parseCidr(input)
  if (!cidr) return null
  const bytes = cidr.ip.bytes
  const text =
    cidr.ip.version === 4
      ? bytes.join(".")
      : Array.from({ length: 8 }, (_, i) => ((bytes[i * 2] << 8) | bytes[i * 2 + 1]).toString(16)).join(":")
  return `${text}/${cidr.prefix}`
}

/** Best-effort client IP from proxy headers. On Vercel these are set by the platform. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && parseIp(value)) return value
  }
  return null
}

/** Comma / space / newline separated list from an env var. */
export function parseIpList(raw: string | undefined): string[] {
  return (raw || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
