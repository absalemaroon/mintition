import { saveBatchAction, getAllBatchesAction, getBatchByIdAction } from "@/app/actions"
import { toast } from "sonner"
import { storage } from "./storage"

export { getAllBatchesAction } from "@/app/actions"

export async function fetchAllBatches() {
  try {
    return await getAllBatchesAction()
  } catch (error) {
    toast.error("Failed to load batches")
    return []
  }
}

export async function saveBatchToDB(wallets: any[], batchName: string) {
  try {
    await saveBatchAction(batchName, wallets)
    toast.success("Batch saved successfully")
  } catch (error) {
    toast.error("Failed to save batch")
  }
}

export async function loadBatchFromDB(batchId: string) {
  try {
    const batch = await getBatchByIdAction(batchId)
    if (batch && batch.walletData) {
      storage.saveWallets(batch.walletData)
      toast.success("Batch loaded successfully")
      return batch
    }
  } catch (error) {
    toast.error("Failed to load batch")
  }
}
