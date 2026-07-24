import * as React from "react"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type {
  ToolCallStatus,
  ToolCallView,
} from "@/features/chat/chat-pane-state"
import { i18n } from "@/lib/i18n/i18n"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, WrenchIcon } from "lucide-react"

function toolStatusLabel(status: ToolCallStatus) {
  switch (status) {
    case "pending":
      return i18n.t("chat.agent.waiting")
    case "running":
      return i18n.t("chat.agent.running")
    case "waiting":
      return i18n.t("chat.agent.awaitingInput")
    case "succeeded":
      return i18n.t("chat.agent.success")
    case "failed":
      return i18n.t("chat.agent.failed")
    case "cancelled":
      return i18n.t("chat.agent.cancelled")
    default:
      return status
  }
}

function statusTone(status: ToolCallStatus) {
  switch (status) {
    case "waiting":
      return "border-amber-500/30 bg-amber-500/5 text-amber-700"
    case "succeeded":
      return "border-emerald-500/25 text-emerald-700"
    case "failed":
      return "border-red-500/25 text-red-600"
    case "cancelled":
      return "border-amber-500/25 text-amber-700"
    default:
      return "border-black/10 text-foreground/65"
  }
}

export function ToolCallShell({
  tool,
  title,
  icon,
  children,
  defaultOpen,
  autoOpenActive = true,
  autoOpenWaiting = false,
  lockOpen = false,
  className,
}: {
  tool: ToolCallView
  title?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  autoOpenActive?: boolean
  autoOpenWaiting?: boolean
  lockOpen?: boolean
  className?: string
}) {
  const isActive = tool.status === "running" || tool.status === "waiting"
  const isTerminal =
    tool.status === "succeeded" ||
    tool.status === "failed" ||
    tool.status === "cancelled"
  const [open, setOpen] = React.useState(
    defaultOpen ?? (autoOpenActive && isActive)
  )
  const previousStatusRef = React.useRef<ToolCallStatus>(tool.status)

  React.useEffect(() => {
    const previousStatus = previousStatusRef.current
    if (
      (autoOpenActive && isActive) ||
      (autoOpenWaiting && tool.status === "waiting")
    ) {
      setOpen(true)
    } else if (
      (previousStatus === "running" || previousStatus === "waiting") &&
      isTerminal
    ) {
      setOpen(false)
    }
    previousStatusRef.current = tool.status
  }, [autoOpenActive, autoOpenWaiting, isActive, isTerminal, tool.status])

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        if (lockOpen && !nextOpen) return
        setOpen(nextOpen)
      }}
      className={cn("flex flex-col", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 text-left text-[13px] text-foreground/62 select-none transition-colors hover:text-foreground/80"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {icon ?? <WrenchIcon className="size-3.5 flex-none" />}
            <span className="truncate">{title ?? tool.name}</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "h-5 shrink-0 rounded-full bg-transparent px-1.5 text-[10px]",
                statusTone(tool.status)
              )}
            >
              {toolStatusLabel(tool.status)}
            </Badge>
            <ChevronDownIcon className="size-3.5 flex-none -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animated-collapsible-content relative ml-[6.5px] border-l-[0.5px] border-border/50 pt-2 pl-3.5 text-xs text-foreground/65">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
