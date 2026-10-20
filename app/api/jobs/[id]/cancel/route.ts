import { z } from "zod"
import { route, ApiError } from "@/lib/security/guard"
import { cancelJob } from "@/lib/server/jobs"
import { audit } from "@/lib/server/audit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(async (_r, { ip }) => {
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) throw new ApiError(400, "Bad job id")
    const job = await cancelJob(id)
    await audit("job.cancelled", ip, { jobId: id })
    return { job }
  })(req)
