"use server"

import { saveBatch, getAllBatches, getBatchById, updateBatchAfterFunding, updateBatchMints } from "@/lib/db-utils"

export async function saveBatchAction(
  name: string,
  wallets: Array<{ address: string; privateKey: string }>,
  description?: string,
) {
  try {
    console.log("[v0] Server action: saveBatchAction called")
    const result = await saveBatch(name, wallets, description)
    console.log("[v0] Server action: saveBatchAction completed successfully")
    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("[v0] Server action error - saveBatchAction:", errorMsg)
    return { error: errorMsg }
  }
}

export async function getAllBatchesAction() {
  try {
    return await getAllBatches()
  } catch (error) {
    console.error("[v0] Error fetching batches:", error)
    return []
  }
}

export async function getBatchByIdAction(id: string) {
  try {
    return await getBatchById(id)
  } catch (error) {
    console.error("[v0] Error fetching batch:", error)
    return null
  }
}

export async function updateBatchAfterFundingAction(id: string, totalFunded: string) {
  try {
    return await updateBatchAfterFunding(id, totalFunded)
  } catch (error) {
    console.error("[v0] Error updating batch:", error)
    throw error
  }
}

export async function updateBatchMintsAction(id: string, totalMints: number) {
  try {
    return await updateBatchMints(id, totalMints)
  } catch (error) {
    console.error("[v0] Error updating mints:", error)
    throw error
  }
}
