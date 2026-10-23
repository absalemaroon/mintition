"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

/** A coin logo with a letter fallback. `src` is always one of our own /api/logo/* URLs. */
export function TokenLogo({ src, symbol, size = 28, className }: { src?: string | null; symbol?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const show = Boolean(src) && !failed
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-mono font-semibold text-muted-foreground", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        (symbol || "?").slice(0, 1).toUpperCase()
      )}
    </span>
  )
}
