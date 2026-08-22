import * as React from "react"
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
    case "running":
      return "text-sky-700 dark:text-sky-400"
    case "waiting":
      return "text-amber-700 dark:text-amber-400"
    case "succeeded":
      return "text-emerald-700 dark:text-emerald-400"
    case "failed":
      return "text-destructive"
    case "cancelled":
      return "text-amber-700 dark:text-amber-400"
    default:
      return "text-foreground/65"
  }
}

function statusMarkerTone(status: ToolCallStatus) {
  switch (status) {
    case "running":
      return "bg-sky-500"
    case "waiting":
      return "bg-amber-500"
    case "succeeded":
      return "bg-emerald-500"
    case "failed":
      return "bg-destructive"
    case "cancelled":
      return "bg-amber-500"
    default:
      return "bg-foreground/35"
  }
}

export function ToolCallShell({
  tool,
  title,
  summary,
  icon,
  children,
  defaultOpen,
  autoOpenActive = false,
  autoOpenWaiting = false,
  lockOpen = false,
  className,
}: {
  tool: ToolCallView
  title?: React.ReactNode
  summary?: React.ReactNode
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
          data-tool-call-id={tool.id}
          data-tool-status={tool.status}
          className="group flex min-h-7 w-full min-w-0 items-center gap-2 text-left text-[12px] text-foreground/62 select-none transition-colors hover:text-foreground/85 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="inline-flex min-w-0 max-w-[52%] shrink-0 items-center gap-1.5">
            {icon ?? <WrenchIcon className="size-3.5 flex-none" />}
            <span className="truncate">{title ?? tool.name}</span>
          </span>
          {!open && summary ? (
            <span
              data-tool-summary
              className={cn(
                "min-w-0 flex-1 truncate text-[11px] text-foreground/45",
                tool.status === "failed" && "text-destructive/85"
              )}
            >
              {summary}
            </span>
          ) : null}
          <span
            aria-live="polite"
            className={cn(
              "ml-auto inline-flex shrink-0 items-center gap-1 text-[10px]",
              statusTone(tool.status)
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                statusMarkerTone(tool.status),
                tool.status === "running" && "animate-pulse"
              )}
            />
            {toolStatusLabel(tool.status)}
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
