import { after } from "next/server"
import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { createJob, listJobs } from "@/lib/server/jobs"
import { runWorker } from "@/lib/server/mint-engine"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export const GET = route(async () => ({ jobs: await listJobs(50) }))

const uuid = z.string().uuid()
const wei = z.string().regex(/^\d{1,40}$/)
const common = {
  name: z.string().max(80).default(""),
  chainId: z.number().int().positive(),
  batchId: uuid,
  runAt: z.string().max(40).nullable().optional(),
  concurrency: z.number().int().min(1).max(50).default(5),
}

const schema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("mint"), contractAddress: z.string().max(64), mintsPerWallet: z.number().int().min(1).max(20).default(1), concurrency: z.number().int().min(1).max(50).default(10) }),
  z.object({
    ...common,
    kind: z.literal("buy"),
    token: z.string().max(64),
    amountWei: wei,
    amountDisplay: z.string().max(30),
    slippage: z.number().min(0.1).max(30).default(3),
    maxImpact: z.number().min(0.5).max(50).default(10),
    symbol: z.string().max(20).optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("sell"),
    token: z.string().max(64),
    percent: z.number().min(1).max(100),
    slippage: z.number().min(0.1).max(30).default(3),
    maxImpact: z.number().min(0.5).max(50).default(10),
    symbol: z.string().max(20).optional(),
  }),
  z.object({
    ...common,
    kind: z.literal("transfer"),
    asset: z.enum(["native", "token"]),
    token: z.string().max(64).optional(),
    mode: z.enum(["fixed", "all"]),
    amountWei: wei.optional(),
    amountDisplay: z.string().max(30).optional(),
    symbol: z.string().max(20).optional(),
    destination: z.discriminatedUnion("type", [
      z.object({ type: z.literal("address"), address: z.string().max(64) }),
      z.object({ type: z.literal("batch"), batchId: uuid, pairing: z.enum(["sequential", "random"]).default("sequential") }),
    ]),
  }),
])

export const POST = route(async (req, { ip }) => {
  const raw = await req.json().catch(() => null)
  // Older clients send no "kind": that means a mint.
  const body = schema.safeParse(raw && typeof raw === "object" ? { kind: "mint", ...raw } : raw)
  if (!body.success) throw new ApiError(400, "Check the form: some values are invalid")
  const job = await createJob(body.data)
  await audit("job.created", ip, { jobId: job.id, kind: job.kind, total: job.total, runAt: job.runAt })

  // Due now: start working immediately after the response is sent. The cron worker
  // keeps going from there, so nothing depends on this browser tab or this request.
  if (Date.parse(job.runAt) <= Date.now() + 2_000) after(() => runWorker({ budgetMs: 50_000 }).catch(() => undefined))
  return { job }
})
