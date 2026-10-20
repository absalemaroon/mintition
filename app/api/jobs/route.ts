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

const schema = z.object({
  name: z.string().max(80).default(""),
  chainId: z.number().int().positive(),
  contractAddress: z.string().max(64),
  batchId: z.string().uuid(),
  runAt: z.string().max(40).nullable().optional(),
  concurrency: z.number().int().min(1).max(50).default(10),
  mintsPerWallet: z.number().int().min(1).max(20).default(1),
})

export const POST = route(async (req, { ip }) => {
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) throw new ApiError(400, "Check the form: some values are invalid")
  const job = await createJob(body.data)
  await audit("job.created", ip, { jobId: job.id, total: job.total, runAt: job.runAt })

  // Due now: start working immediately after the response is sent. The cron worker
  // keeps going from there, so nothing depends on this browser tab or this request.
  if (Date.parse(job.runAt) <= Date.now() + 2_000) after(() => runWorker({ budgetMs: 50_000 }).catch(() => undefined))
  return { job }
})
