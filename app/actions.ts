"use server"

import { saveBatch, getAllBatches, getBatchById, updateBatchAfterFunding, updateBatchMints } from "@/lib/db-utils"

export async function saveBatchAction(
  name: string,
  wallets: Array<{ address: string; privateKey: string }>,
  description?: string,
) {
  try {
    const result = await saveBatch(name, wallets, description)
    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return { error: errorMsg }
  }
}

export async function getAllBatchesAction() {
  try {
    return await getAllBatches()
  } catch (error) {
    return []
  }
}

export async function getBatchByIdAction(id: string) {
  try {
    return await getBatchById(id)
  } catch (error) {
    return null
  }
}

export async function updateBatchAfterFundingAction(id: string, totalFunded: string) {
  try {
    return await updateBatchAfterFunding(id, totalFunded)
  } catch (error) {
    throw error
  }
}

export async function updateBatchMintsAction(id: string, totalMints: number) {
  try {
    return await updateBatchMints(id, totalMints)
  } catch (error) {
    throw error
  }
}
