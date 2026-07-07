import * as React from "react"
import { InboxIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground rounded-md border border-dashed border-border bg-background/60 p-6 text-sm",
        className
      )}
    >
      <InboxIcon className="mb-3 size-5" />
      <p className="text-foreground font-medium">{title}</p>
      {description ? <p className="mt-1 leading-6">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
