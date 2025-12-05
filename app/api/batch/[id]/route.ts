import { type NextRequest, NextResponse } from "next/server"
import { getBatchById } from "@/lib/db-utils"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const batch = await getBatchById(id)

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: batch.id,
      name: batch.name,
      description: batch.description,
      walletCount: batch.walletCount,
      walletData: batch.walletData,
      totalMints: batch.totalMints,
      totalFunded: batch.totalFunded,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    })
  } catch (error) {
    console.error("[v0] Error fetching batch:", error)
    return NextResponse.json({ error: "Failed to fetch batch" }, { status: 500 })
  }
}
