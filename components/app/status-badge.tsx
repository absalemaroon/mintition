import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type Tone = "neutral" | "success" | "warning" | "info" | "danger"

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
}

export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Maps any wallet / funding / transaction status string to a badge tone. */
export function toneForStatus(status: string | undefined): Tone {
  switch (status) {
    case "funded":
    case "minted":
    case "completed":
    case "success":
      return "success"
    case "funding":
    case "scheduled":
    case "pending":
      return "warning"
    case "minting":
      return "info"
    case "failed":
    case "error":
    case "funding_failed":
      return "danger"
    default:
      return "neutral"
  }
}

/** "not_funded" -> "Not funded" */
export function labelForStatus(status: string | undefined): string {
  const text = (status || "idle").replace(/_/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
