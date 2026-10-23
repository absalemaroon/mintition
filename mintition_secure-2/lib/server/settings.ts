import { createAdminClient } from "@/lib/supabase/server-admin"
import { ApiError } from "@/lib/security/guard"

const db = () => createAdminClient() as any
const BUCKET = "branding"
const MAX_LOGO_BYTES = 1024 * 1024

export interface Branding {
  name: string
  hasLogo: boolean
  logoVersion: number
}

export async function getBranding(): Promise<Branding> {
  const { data } = await db().from("app_settings").select("project_name,logo_path,logo_version").eq("singleton", true).maybeSingle()
  return {
    name: data?.project_name || "Mintition",
    hasLogo: Boolean(data?.logo_path),
    logoVersion: Number(data?.logo_version || 0),
  }
}

export async function updateProjectName(raw: string) {
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()
  if (name.length < 1 || name.length > 40) throw new ApiError(400, "Name must be 1 to 40 characters")
  const { error } = await db().from("app_settings").update({ project_name: name }).eq("singleton", true)
  if (error) throw new Error(error.message)
  return name
}

/** Only real PNG / JPEG / WebP files. SVG is refused on purpose: it can carry scripts. */
function sniffImage(bytes: Uint8Array): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" }
  if (startsWith([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" }
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", mime: "image/webp" }
  return null
}

export async function saveLogo(file: File) {
  if (file.size === 0) throw new ApiError(400, "Empty file")
  if (file.size > MAX_LOGO_BYTES) throw new ApiError(413, "Logo must be 1 MB or smaller")
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImage(bytes)
  if (!kind) throw new ApiError(415, "Logo must be a PNG, JPEG or WebP image")

  const admin = db()
  const { data: current } = await admin.from("app_settings").select("logo_path").eq("singleton", true).maybeSingle()
  const path = `logo-${Date.now()}.${kind.ext}`
  const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false })
  if (upload.error) throw new Error(upload.error.message)

  const { error } = await admin.from("app_settings").update({ logo_path: path, logo_version: Date.now() }).eq("singleton", true)
  if (error) throw new Error(error.message)
  if (current?.logo_path) await admin.storage.from(BUCKET).remove([current.logo_path])
}

export async function clearLogo() {
  const admin = db()
  const { data: current } = await admin.from("app_settings").select("logo_path").eq("singleton", true).maybeSingle()
  const { error } = await admin.from("app_settings").update({ logo_path: null, logo_version: Date.now() }).eq("singleton", true)
  if (error) throw new Error(error.message)
  if (current?.logo_path) await admin.storage.from(BUCKET).remove([current.logo_path])
}

export async function readLogo(): Promise<{ body: ArrayBuffer; mime: string } | null> {
  const admin = db()
  const { data } = await admin.from("app_settings").select("logo_path").eq("singleton", true).maybeSingle()
  if (!data?.logo_path) return null
  const file = await admin.storage.from(BUCKET).download(data.logo_path)
  if (file.error || !file.data) return null
  const mime = data.logo_path.endsWith(".png") ? "image/png" : data.logo_path.endsWith(".webp") ? "image/webp" : "image/jpeg"
  return { body: await file.data.arrayBuffer(), mime }
}
