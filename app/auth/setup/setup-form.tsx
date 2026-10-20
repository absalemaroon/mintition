"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export function SetupForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password !== confirm) return setError("Passwords do not match")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Setup failed")
      router.push("/auth/login")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="gap-6 py-6">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">Create the owner account</CardTitle>
            <CardDescription>
              This project allows exactly one user. After you create it, nobody else can ever be added, and this page disappears.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password (12+ characters)</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={12} autoComplete="new-password" />
              </div>
              {error && (
                <Alert variant="destructive" className="bg-danger-soft border-danger/30">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your current IP address is added to the allowed list automatically. Every other address is blocked from then on.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
