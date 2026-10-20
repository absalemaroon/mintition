import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server-admin"
import { route, ApiError } from "@/lib/security/guard"
import { ipMatchesAny, normalizeCidr, parseIpList } from "@/lib/security/ip"
import { invalidateAllowlistCache } from "@/lib/security/allowlist"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const db = () => createAdminClient() as any

async function list() {
  const { data, error } = await db().from("allowed_ips").select("id,cidr,label,created_at").order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return data as { id: string; cidr: string; label: string; created_at: string }[]
}

export const GET = route(async (_req, { ip }) => {
  const entries = await list()
  const envEntries = parseIpList(process.env.ALLOWED_IPS)
  return {
    currentIp: ip,
    currentIpAllowed: ipMatchesAny(ip, [...entries.map((e) => e.cidr), ...envEntries]),
    envEntryCount: envEntries.length,
    entries,
  }
})

const addSchema = z.object({ cidr: z.string().min(2).max(64), label: z.string().max(60).default("") })

export const POST = route(async (req, { ip }) => {
  const body = addSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Enter a valid IP address or range")
  const cidr = normalizeCidr(body.data.cidr)
  if (!cidr) throw new ApiError(400, "That is not a valid IP address or range (example: 203.0.113.7 or 203.0.113.0/24)")
  if (cidr === "0.0.0.0/0" || cidr === "0:0:0:0:0:0:0:0/0") throw new ApiError(400, "That range allows the whole internet. Add a specific address instead.")
  const label = body.data.label.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()
  const { error } = await db().from("allowed_ips").insert({ cidr, label })
  if (error) throw new ApiError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "That address is already listed" : "Could not save")
  invalidateAllowlistCache()
  await audit("ip.added", ip, { cidr })
  return { entries: await list() }
})

const removeSchema = z.object({ id: z.string().uuid() })

export const DELETE = route(async (req, { ip }) => {
  const body = removeSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Bad request")
  const entries = await list()
  const target = entries.find((e) => e.id === body.data.id)
  if (!target) throw new ApiError(404, "Not found")

  // Never let the owner lock themselves out from this screen.
  const remaining = [...entries.filter((e) => e.id !== target.id).map((e) => e.cidr), ...parseIpList(process.env.ALLOWED_IPS)]
  if (!ipMatchesAny(ip, remaining)) {
    throw new ApiError(409, "Removing this would lock you out: your current IP would no longer be allowed. Add another entry that covers your IP first.")
  }
  const { error } = await db().from("allowed_ips").delete().eq("id", target.id)
  if (error) throw new Error(error.message)
  invalidateAllowlistCache()
  await audit("ip.removed", ip, { cidr: target.cidr })
  return { entries: await list() }
})
