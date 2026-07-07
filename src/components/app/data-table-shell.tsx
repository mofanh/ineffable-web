import * as React from "react"

import { cn } from "@/lib/utils"

export function DataTableShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border", className)}>
      <table className="w-full text-left text-sm">{children}</table>
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
