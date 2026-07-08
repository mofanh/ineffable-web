import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function AppDisclosureSection({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <section className="rounded-md border border-border bg-background">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="block text-sm font-medium">{title}</span>
          {description ? (
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? <div className="border-t border-border p-4">{children}</div> : null}
    </section>
  )
}
