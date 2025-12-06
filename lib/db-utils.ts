import { createAdminClient } from "./supabase/server-admin"

export async function saveBatch(
  name: string,
  wallets: Array<{ address: string; privateKey: string }>,
  description?: string,
) {
  try {
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
      throw new Error(`Supabase error: ${error.message}`)
    }

    return data
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to save batch: ${errorMsg}`)
  }
}

export async function getAllBatches() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from("wallet_batches").select("*").order("created_at", { ascending: false })

    if (error) {
      throw new Error(`Supabase error: ${error.message}`)
    }

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

    return transformedData
  } catch (error) {
    return []
  }
}

export async function getBatchById(id: string) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from("wallet_batches").select("*").eq("id", id).single()

    if (error && error.code !== "PGRST116") {
      throw new Error(`Supabase error: ${error.message}`)
    }

    if (!data) {
      return null
    }

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

    return transformedData
  } catch (error) {
    return null
  }
}

export async function updateBatchAfterFunding(id: string, totalFunded: string) {
  try {
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
      throw new Error(`Supabase error: ${error.message}`)
    }

    return data
  } catch (error) {
    throw new Error(`Failed to update batch: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function updateBatchMints(id: string, totalMints: number) {
  try {
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
      throw new Error(`Supabase error: ${error.message}`)
    }

    return data
  } catch (error) {
    throw new Error(`Failed to update batch mints: ${error instanceof Error ? error.message : String(error)}`)
  }
}
