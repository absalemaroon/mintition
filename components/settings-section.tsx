"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Info, Loader2, Trash2, Upload, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/app/status-badge"
import { ChainLogo } from "@/components/app/chain-logo"
import { api } from "@/lib/api-client"
import { CHAINS } from "@/lib/chains"
import type { Branding } from "@/lib/types"

interface IpEntry {
  id: string
  cidr: string
  label: string
  created_at: string
}

interface IpState {
  currentIp: string | null
  currentIpAllowed: boolean
  envEntryCount: number
  entries: IpEntry[]
}

interface SecurityStatus {
  database: {
    available: boolean
    singleUserRule: boolean
    userCount: number
    tablesLocked: boolean
    workerScheduled: boolean
    legacyPlaintextBatches: number
  }
  server: { encryptionKeySet: boolean; cronSecretSet: boolean; envBreakGlassIps: number }
}

interface SettingsSectionProps {
  brand: Branding
  onBrandChange: (brand: Branding) => void
  onVaultChanged: () => void
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span>{label}</span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
        <span className="sr-only">{ok ? " (ok)" : " (needs attention)"}</span>
      </span>
    </li>
  )
}

export function SettingsSection({ brand, onBrandChange, onVaultChanged }: SettingsSectionProps) {
  // ----- branding
  const [name, setName] = useState(brand.name)
  const [savingName, setSavingName] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => setName(brand.name), [brand.name])

  const saveName = async () => {
    setSavingName(true)
    try {
      await api("/api/settings", { method: "PATCH", json: { projectName: name } })
      onBrandChange({ ...brand, name: name.trim() })
      toast.success("Name updated")
    } catch (e) {
      toast.error("Could not save the name", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSavingName(false)
    }
  }

  const uploadLogo = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const next = await api<Branding>("/api/settings/logo", { method: "POST", body: form })
      onBrandChange(next)
      toast.success("Logo updated")
    } catch (e) {
      toast.error("Could not upload the logo", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const removeLogo = async () => {
    try {
      onBrandChange(await api<Branding>("/api/settings/logo", { method: "DELETE" }))
      toast.success("Logo removed")
    } catch (e) {
      toast.error("Could not remove the logo", { description: e instanceof Error ? e.message : undefined })
    }
  }

  // ----- IP allowlist
  const [ips, setIps] = useState<IpState | null>(null)
  const [cidr, setCidr] = useState("")
  const [label, setLabel] = useState("")
  const [addingIp, setAddingIp] = useState(false)

  const loadIps = useCallback(async () => {
    try {
      setIps(await api<IpState>("/api/security/ips"))
    } catch {
      /* shown as loading */
    }
  }, [])

  const addIp = async (value: string, text: string) => {
    setAddingIp(true)
    try {
      await api("/api/security/ips", { method: "POST", json: { cidr: value, label: text } })
      setCidr("")
      setLabel("")
      await loadIps()
      toast.success("Address added")
    } catch (e) {
      toast.error("Could not add the address", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setAddingIp(false)
    }
  }

  const removeIp = async (id: string) => {
    try {
      await api("/api/security/ips", { method: "DELETE", json: { id } })
      await loadIps()
      toast.success("Address removed")
    } catch (e) {
      toast.error("Could not remove it", { description: e instanceof Error ? e.message : undefined })
    }
  }

  // ----- network check
  const [health, setHealth] = useState<Record<string, { ok: boolean; ms: number; block?: number; error?: string }> | null>(null)
  const [checking, setChecking] = useState(false)
  const checkNetworks = async () => {
    setChecking(true)
    try {
      setHealth((await api<{ results: Record<string, { ok: boolean; ms: number; block?: number; error?: string }> }>("/api/chains/health")).results)
    } catch (e) {
      toast.error("Network check failed", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setChecking(false)
    }
  }
  const liveChains = CHAINS.filter((c) => c.status === "live")
  const failing = health ? liveChains.filter((c) => health[c.id] && !health[c.id].ok) : []

  // ----- security status
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [migrating, setMigrating] = useState(false)
  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<SecurityStatus>("/api/security/status"))
    } catch {
      /* shown as loading */
    }
  }, [])

  useEffect(() => {
    loadIps()
    loadStatus()
  }, [loadIps, loadStatus])

  const migrate = async () => {
    setMigrating(true)
    try {
      const result = await api<{ batches: number; wallets: number }>("/api/security/migrate", { method: "POST" })
      toast.success("Old data encrypted", { description: `${result.wallets} wallets in ${result.batches} batches are now encrypted.` })
      await loadStatus()
      onVaultChanged()
    } catch (e) {
      toast.error("Could not encrypt the old data", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Branding</CardTitle>
          <CardDescription>The name and logo shown in the sidebar and on the sign-in page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <div className="flex gap-2">
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              <Button onClick={saveName} disabled={savingName || !name.trim() || name.trim() === brand.name}>
                {savingName ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {brand.hasLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/branding/logo?v=${brand.logoVersion}`} alt="Current logo" className="size-full object-cover" />
                ) : (
                  <span className="text-xl font-semibold text-muted-foreground" aria-hidden="true">
                    {brand.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  id="logo-file"
                  onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                  Upload logo
                </Button>
                {brand.hasLogo && (
                  <Button variant="outline" onClick={removeLogo}>
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 1 MB. Square images look best.</p>
          </div>
        </CardContent>
      </Card>

      {/* Access control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access control</CardTitle>
          <CardDescription>Only these IP addresses can load the app. Everyone else gets a blank 404.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>
              Phone and home connections often change IP address. If yours changes you will be locked out. Add a range (like 203.0.113.0/24) if you can, and keep
              this recovery in mind: add your new IP in the Supabase SQL editor with{" "}
              <code className="rounded bg-card px-1 font-mono text-xs">insert into allowed_ips (cidr) values (&apos;YOUR.IP/32&apos;);</code>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Your current IP</p>
              <p className="font-mono text-sm break-all">{ips?.currentIp ?? "unknown"}</p>
            </div>
            <div className="flex items-center gap-2">
              {ips && <StatusBadge tone={ips.currentIpAllowed ? "success" : "danger"}>{ips.currentIpAllowed ? "Allowed" : "Not allowed"}</StatusBadge>}
              {ips?.currentIp && !ips.currentIpAllowed && (
                <Button size="sm" variant="outline" onClick={() => addIp(ips.currentIp!, "My device")} disabled={addingIp}>
                  Add my IP
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="ip-cidr">IP address or range</Label>
              <Input id="ip-cidr" value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="203.0.113.7 or 203.0.113.0/24" className="font-mono text-sm" autoComplete="off" spellCheck={false} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip-label">Label (optional)</Label>
              <Input id="ip-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home" maxLength={60} />
            </div>
            <Button onClick={() => addIp(cidr, label)} disabled={addingIp || !cidr.trim()}>
              {addingIp ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Add
            </Button>
          </div>

          {ips && ips.entries.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {ips.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">{entry.cidr}</span>
                    {entry.label && <span className="block truncate text-xs text-muted-foreground">{entry.label}</span>}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => removeIp(entry.id)} aria-label={`Remove ${entry.cidr}`}>
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{ips ? "No addresses listed yet." : "Loading..."}</p>
          )}
          {ips && ips.envEntryCount > 0 && (
            <p className="text-xs text-muted-foreground">{ips.envEntryCount} more address(es) are set in the ALLOWED_IPS environment variable. They always work and cannot be removed here.</p>
          )}
        </CardContent>
      </Card>

      {/* Network check */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Network check</CardTitle>
            <CardDescription>Tests the connection to every network from your server and confirms each one answers with the right chain id.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkNetworks} disabled={checking} className="shrink-0">
            {checking && <Loader2 className="animate-spin" aria-hidden="true" />}
            {health ? "Check again" : "Check all"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!health ? (
            <p className="text-sm text-muted-foreground">{liveChains.length} networks are enabled. Press Check all (takes up to a minute).</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">{liveChains.length - failing.length}</span> of {liveChains.length} networks are working.
                {failing.length > 0 && <span className="text-danger"> {failing.length} need attention.</span>}
              </p>
              {failing.length > 0 && (
                <ul className="divide-y rounded-xl border">
                  {failing.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3.5 py-3">
                      <ChainLogo chain={c} size={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{health[c.id].error}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <details className="rounded-xl border">
                <summary className="cursor-pointer px-3.5 py-3 text-sm font-medium">All networks</summary>
                <ul className="max-h-72 divide-y overflow-auto border-t">
                  {liveChains.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                      <ChainLogo chain={c} size={20} />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{health[c.id]?.ok ? `${health[c.id].ms} ms` : "failed"}</span>
                      {health[c.id]?.ok ? <CheckCircle2 className="size-4 text-success" aria-label="Working" /> : <XCircle className="size-4 text-danger" aria-label="Not working" />}
                    </li>
                  ))}
                </ul>
              </details>
              <p className="text-xs text-muted-foreground">If a network fails, set a private RPC for it with an RPC_URL_&lt;chain id&gt; environment variable (for example RPC_URL_8453) and redeploy.</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Security checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Security checklist</CardTitle>
          <CardDescription>A live check of how this project is locked down.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status ? (
            <p className="text-sm text-muted-foreground">Checking...</p>
          ) : (
            <>
              {!status.database.available && (
                <Alert variant="warning">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>The database checks are unavailable. Run scripts/002_secure_core.sql in the Supabase SQL editor.</AlertDescription>
                </Alert>
              )}
              <ul className="divide-y">
                <Check ok={status.server.encryptionKeySet} label="Encryption key is set on the server" detail="DATA_ENCRYPTION_KEY. Without it, nothing can be saved or read." />
                <Check ok={status.database.singleUserRule} label="One user per project, enforced by the database" detail={`${status.database.userCount} user(s) exist. Nobody else can ever be created.`} />
                <Check ok={status.database.tablesLocked} label="Tables are locked to the public key" detail="The public anon key can read and write nothing." />
                <Check ok={status.database.workerScheduled} label="Background worker is scheduled" detail="Needed so minting continues when the app is closed (scripts/003_schedule_worker.sql)." />
                <Check ok={status.server.cronSecretSet} label="Worker secret is set" detail="CRON_SECRET, 32+ characters." />
                <Check ok={status.database.legacyPlaintextBatches === 0} label="No unencrypted wallet data" detail={status.database.legacyPlaintextBatches ? `${status.database.legacyPlaintextBatches} old batch(es) still hold plain-text keys.` : undefined} />
              </ul>

              {status.database.legacyPlaintextBatches > 0 && (
                <div className="space-y-3">
                  <Alert variant="warning">
                    <Info aria-hidden="true" />
                    <AlertDescription>
                      Older versions stored private keys unencrypted. Encrypt them now. If those wallets ever held meaningful funds, consider moving the funds to new wallets as well, since the old
                      storage was readable with the public key.
                    </AlertDescription>
                  </Alert>
                  <Button onClick={migrate} disabled={migrating}>
                    {migrating ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                    Encrypt old data now
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
