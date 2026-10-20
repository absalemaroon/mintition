import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/app/skeleton"

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  helper?: string
  loading?: boolean
}

export function StatCard({ icon: Icon, label, value, helper, loading }: StatCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-4 h-8 w-20" />
        ) : (
          <p className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{value}</p>
        )}
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  )
}
