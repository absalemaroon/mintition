import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

/** Big title, one muted line, actions aligned right. Used at the top of every view. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          <span className="text-primary" aria-hidden="true">&gt; </span>
          {title}
          <span className="animate-blink ml-1 inline-block h-5 w-2.5 translate-y-0.5 bg-primary align-baseline" aria-hidden="true" />
        </h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
