import * as React from "react"

import { cn } from "@/lib/utils"

export function AppFieldGrid({
  children,
  columns = 2,
  className,
}: {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "md:grid-cols-2",
        columns === 3 && "md:grid-cols-3",
        columns === 4 && "md:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  )
}
