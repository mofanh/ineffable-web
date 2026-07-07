import * as React from "react"

import { cn } from "@/lib/utils"

export function ActionToolbar({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode
  align?: "start" | "end" | "between"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "start" && "justify-start",
        align === "end" && "justify-end",
        align === "between" && "justify-between",
        className
      )}
    >
      {children}
    </div>
  )
}
