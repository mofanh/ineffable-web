import * as React from "react"

import { cn } from "@/lib/utils"

export function DataTableShell({
  children,
  className,
  tableClassName,
}: {
  children: React.ReactNode
  className?: string
  tableClassName?: string
}) {
  return (
    <div
      className={cn(
        "@container/table w-full max-w-full overflow-x-auto rounded-md border border-border",
        className
      )}
    >
      <table
        className={cn(
          "w-full min-w-[30rem] table-fixed text-left text-sm sm:min-w-0",
          tableClassName
        )}
      >
        {children}
      </table>
    </div>
  )
}

export function DataTableHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-muted/20 text-[10px] uppercase text-muted-foreground",
        className
      )}
    >
      {children}
    </thead>
  )
}

export function DataTableBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tbody className={cn("divide-y divide-border", className)}>{children}</tbody>
}
