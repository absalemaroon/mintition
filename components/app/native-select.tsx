import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** A plain <select> styled like our inputs. Native, so it works well on phones. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-10 w-full appearance-none rounded-lg border border-border bg-muted pr-9 pl-3 text-base transition-[color,background-color,box-shadow,border-color] duration-150 outline-none focus-visible:border-foreground/40 focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  )
}
