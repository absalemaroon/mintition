import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/app/skeleton"
import { AnimatedNumber } from "@/components/app/animated-number"

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  /** Optional numeric value for the count-up animation (use with `format`). */
  numeric?: { value: number; decimals?: number; prefix?: string; suffix?: string }
  helper?: string
  loading?: boolean
}

export function StatCard({ icon: Icon, label, value, numeric, helper, loading }: StatCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-4 h-8 w-20" />
        ) : (
          <p className="mt-3 truncate font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">
            {numeric ? <AnimatedNumber value={numeric.value} decimals={numeric.decimals} prefix={numeric.prefix} suffix={numeric.suffix} /> : value}
          </p>
        )}
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  )
}
