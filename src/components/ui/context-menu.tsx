import * as React from "react"
import { ContextMenu as Primitive } from "radix-ui"
import { cn } from "@/lib/utils"

export const ContextMenu = Primitive.Root
export const ContextMenuTrigger = Primitive.Trigger
export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content className={cn("z-50 min-w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md", className)} {...props} /></Primitive.Portal>
}
export function ContextMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn("flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50", className)} {...props} />
}
