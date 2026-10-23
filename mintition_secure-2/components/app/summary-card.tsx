import type { ReactNode } from "react"
import { Check, Circle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SummaryCardProps {
  title: string
  description?: string
  /** Small element top-right, e.g. the chain pill. */
  badge?: ReactNode
  children: ReactNode
  /** Pinned to the bottom: the primary action. */
  footer?: ReactNode
  className?: string
}

/** The "invoice preview" card: a titled list of line items with the action pinned at the bottom. */
export function SummaryCard({ title, description, badge, children, footer, className }: SummaryCardProps) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-5">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {badge}
      </CardHeader>
      <CardContent className="flex-1 px-5 py-2">{children}</CardContent>
      {footer && <div className="space-y-3 border-t px-5 py-5">{footer}</div>}
    </Card>
  )
}

interface SummaryRowProps {
  label: string
  value: ReactNode
  mono?: boolean
  strong?: boolean
}

export function SummaryRow({ label, value, mono, strong }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right tabular-nums", mono && "font-mono text-xs", strong && "text-base font-semibold")}>
        {value}
      </span>
    </div>
  )
}

interface ChecklistItemProps {
  done: boolean
  label: string
  /** "required" items block the action, "optional" ones are only a heads-up. */
  hint?: string
}

export function ChecklistItem({ done, label, hint }: ChecklistItemProps) {
  return (
    <li className="flex items-start gap-3 py-2 text-sm">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          done ? "bg-success text-background" : "border border-border text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : <Circle className="size-1.5 fill-current" />}
      </span>
      <span className="min-w-0">
        <span className={cn(done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
        {hint && !done && <span className="block text-xs text-muted-foreground">{hint}</span>}
        <span className="sr-only">{done ? " (done)" : " (not done)"}</span>
      </span>
    </li>
  )
}
