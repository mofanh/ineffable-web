import * as React from "react"

import { cn } from "@/lib/utils"

export function AppListToolbar({
  search,
  filters,
  actions,
  className,
}: {
  search?: React.ReactNode
  filters?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
        {search ? <div className="min-w-0 md:w-80">{search}</div> : null}
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
