#!/usr/bin/env node
/**
 * Downloads chain logos into public/chains and writes lib/chain-logos.json.
 * Run once on your computer (needs internet):   node scripts/fetch-chain-logos.mjs
 *
 * Source: the open ethereum-lists/chains registry (the data behind chainlist.org).
 * Chains whose logo cannot be fetched keep the coloured monogram, nothing breaks.
 * Re-run any time after adding chains to lib/chains.ts.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "public", "chains")
const RAW = "https://raw.githubusercontent.com/ethereum-lists/chains/master/_data"
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://cloudflare-ipfs.com/ipfs/"]
const MAX_BYTES = 300 * 1024

const source = await readFile(path.join(root, "lib", "chains.ts"), "utf8")
const ids = [...new Set([...source.matchAll(/chainId: (\d+)/g), ...source.matchAll(/soon\((\d+),/g)].map((m) => m[1]))]
console.log(`Found ${ids.length} chains in lib/chains.ts`)

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  return res.ok ? res.json() : null
}

async function getImage(cidPath) {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const res = await fetch(gateway + cidPath, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const type = res.headers.get("content-type") || ""
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0 || bytes.length > MAX_BYTES) continue
      return { type, bytes }
    } catch {
      /* try the next gateway */
    }
  }
  return null
}

function extensionFor(type, bytes) {
  if (type.includes("svg") || bytes.subarray(0, 200).toString("utf8").includes("<svg")) return "svg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg"
  if (bytes.subarray(8, 12).toString() === "WEBP") return "webp"
  return null
}

const map = {}
let ok = 0
const queue = [...ids]
await mkdir(outDir, { recursive: true })

await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const id = queue.shift()
      try {
        const chain = await getJson(`${RAW}/chains/eip155-${id}.json`)
        if (!chain?.icon) { console.log(`- ${id}: no icon listed`); continue }
        const icons = await getJson(`${RAW}/icons/${chain.icon}.json`)
        const best = Array.isArray(icons) ? icons.find((i) => i.url?.startsWith("ipfs://")) : null
        if (!best) { console.log(`- ${id}: no downloadable icon`); continue }
        const image = await getImage(best.url.replace("ipfs://", ""))
        if (!image) { console.log(`- ${id}: download failed`); continue }
        const ext = extensionFor(image.type, image.bytes)
        if (!ext) { console.log(`- ${id}: unknown image type`); continue }
        if (ext === "svg") {
          const text = image.bytes.toString("utf8")
          // Defence in depth: an <img> never runs scripts, but refuse anything that tries.
          if (/<script|onload\s*=|onerror\s*=|javascript:/i.test(text)) { console.log(`- ${id}: unsafe svg skipped`); continue }
        }
        await writeFile(path.join(outDir, `${id}.${ext}`), image.bytes)
        map[id] = `/chains/${id}.${ext}`
        ok++
        console.log(`+ ${id}: saved ${id}.${ext}`)
      } catch (error) {
        console.log(`- ${id}: ${error.message}`)
      }
    }
  }),
)

const sorted = Object.fromEntries(Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0])))
await writeFile(path.join(root, "lib", "chain-logos.json"), JSON.stringify(sorted, null, 2) + "\n")
console.log(`\nDone: ${ok}/${ids.length} logos saved. The rest keep the monogram.`)
