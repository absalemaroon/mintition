/** Small fetch wrapper for our own API: JSON in, JSON out, readable errors, redirect when signed out. */
export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const isForm = typeof FormData !== "undefined" && rest.body instanceof FormData
  const res = await fetch(url, {
    ...rest,
    cache: "no-store",
    headers: { ...(json !== undefined || (!isForm && rest.body) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/auth/login"
    throw new Error("Signed out")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any).error || "Request failed")
  return data as T
}
