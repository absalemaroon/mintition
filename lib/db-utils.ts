import { createAdminClient } from "./supabase/server-admin"

export async function saveBatch(
  name: string,
  wallets: Array<{ address: string; privateKey: string }>,
  description?: string,
) {
  try {
    console.log("[v0] Saving batch with Supabase:", { name, walletCount: wallets.length })

    if (!name || name.trim() === "") {
      throw new Error("Batch name is required")
    }
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error("At least one wallet is required")
    }

    const validatedWallets = wallets.map((w) => {
      if (!w.address || !w.privateKey) {
        throw new Error("Each wallet must have address and privateKey")
      }
      return {
        address: String(w.address),
        privateKey: String(w.privateKey),
      }
    })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("wallet_batches")
      .insert({
        name: name.trim(),
        description: description?.trim() || "",
        wallet_count: validatedWallets.length,
        wallet_data: validatedWallets,
        total_mints: 0,
        total_funded: "0",
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Supabase error details:", error)
      throw new Error(`Supabase error: ${error.message}`)
    }

    console.log("[v0] Batch saved successfully:", { id: data?.id })
    return data
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error("[v0] Error saving batch:", errorMsg, error)
    throw new Error(`Failed to save batch: ${errorMsg}`)
  }
}

export async function getAllBatches() {
  try {
    console.log("[v0] Fetching all batches")
    const supabase = createAdminClient()
    const { data, error } = await supabase.from("wallet_batches").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Supabase error details:", error)
      throw new Error(`Supabase error: ${error.message}`)
    }

    // Transform snake_case to camelCase for consistency
    const transformedData = (data || []).map((batch: any) => ({
      id: batch.id,
      name: batch.name,
      description: batch.description,
      walletCount: batch.wallet_count,
      walletData: batch.wallet_data,
      totalMints: batch.total_mints,
      totalFunded: batch.total_funded,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
    }))

    console.log("[v0] Fetched batches:", transformedData.length)
    return transformedData
  } catch (error) {
    console.error("[v0] Error fetching batches:", error)
    return []
  }
}

export async function getBatchById(id: string) {
  try {
    console.log("[v0] Fetching batch by id:", id)
    const supabase = createAdminClient()
    const { data, error } = await supabase.from("wallet_batches").select("*").eq("id", id).single()

    if (error && error.code !== "PGRST116") {
      console.error("[v0] Supabase error details:", error)
      throw new Error(`Supabase error: ${error.message}`)
    }

    if (!data) {
      console.log("[v0] Batch not found")
      return null
    }

    // Transform snake_case to camelCase
    const transformedData = {
      id: data.id,
      name: data.name,
      description: data.description,
      walletCount: data.wallet_count,
      walletData: data.wallet_data,
      totalMints: data.total_mints,
      totalFunded: data.total_funded,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    console.log("[v0] Fetched batch:", transformedData.id)
    return transformedData
  } catch (error) {
    console.error("[v0] Error fetching batch:", error)
    return null
  }
}

export async function updateBatchAfterFunding(id: string, totalFunded: string) {
  try {
    console.log("[v0] Updating batch after funding:", { id, totalFunded })
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("wallet_batches")
      .update({
        total_funded: totalFunded,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Supabase error details:", error)
      throw new Error(`Supabase error: ${error.message}`)
    }

    console.log("[v0] Batch updated successfully")
    return data
  } catch (error) {
    console.error("[v0] Error updating batch:", error)
    throw new Error(`Failed to update batch: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function updateBatchMints(id: string, totalMints: number) {
  try {
    console.log("[v0] Updating batch mints:", { id, totalMints })
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("wallet_batches")
      .update({
        total_mints: totalMints,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Supabase error details:", error)
      throw new Error(`Supabase error: ${error.message}`)
    }

    console.log("[v0] Batch mints updated successfully")
    return data
  } catch (error) {
    console.error("[v0] Error updating mints:", error)
    throw new Error(`Failed to update batch mints: ${error instanceof Error ? error.message : String(error)}`)
  }
}
