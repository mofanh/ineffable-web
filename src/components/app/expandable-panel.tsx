import * as React from "react"

import { cn } from "@/lib/utils"

export function AppExpandablePanel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-t border-border bg-muted/20 px-4 py-4 text-sm",
        className
      )}
    >
      {children}
    </div>
  )
}
