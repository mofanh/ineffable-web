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
import { CheckIcon, ChevronDownIcon, CircleHelpIcon, CircleMinusIcon, CircleXIcon, DotIcon, LoaderCircleIcon, WrenchIcon } from "lucide-react"

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
      return "text-muted-foreground"
    case "failed":
      return "text-destructive"
    case "cancelled":
      return "text-amber-700 dark:text-amber-400"
    default:
      return "text-foreground/65"
  }
}

export function ToolCallShell({
  tool,
  title,
  summary,
  summaryTone,
  statusLabel,
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
  summaryTone?: "error"
  statusLabel?: React.ReactNode
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
  const attention = tool.settlementStatus === "outcome_unknown" || tool.operation?.status === "save_pending"
  const quietSuccess = tool.status === "succeeded" && statusLabel == null && !summaryTone &&
    tool.settlementStatus !== "outcome_unknown" && tool.operation?.status !== "save_pending"
  const StatusIcon = tool.status === "failed" || summaryTone === "error" ? CircleXIcon
    : tool.status === "cancelled" ? CircleMinusIcon
    : quietSuccess ? CheckIcon : tool.status === "running" ? LoaderCircleIcon
    : tool.status === "waiting" || attention ? CircleHelpIcon : DotIcon

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
      className={cn("@container/tool flex flex-col", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-tool-call-id={tool.id}
          data-tool-status={tool.status}
          className="group flex min-h-7 w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 text-left text-[13px] text-foreground/70 select-none transition-colors hover:text-foreground/90 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="order-1 inline-flex min-w-0 flex-1 items-center gap-1.5">
            {icon ?? <WrenchIcon className="size-3.5 flex-none" />}
            <span data-tool-title className="min-w-0 flex-1 truncate">{title ?? tool.name}</span>
          </span>
          {!open && summary ? (
            <span
              data-tool-summary
              className={cn(
                "order-3 min-w-0 basis-full truncate pl-5 text-[11px] text-foreground/50 @md/tool:order-2 @md/tool:max-w-[35%] @md/tool:basis-auto @md/tool:pl-0",
                (tool.status === "failed" || summaryTone === "error") && "text-destructive/85"
              )}
            >
              {summary}
            </span>
          ) : null}
          <span
            aria-live="polite"
            className={cn(
              "order-2 ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] @md/tool:order-3",
              summaryTone === "error" ? "text-destructive" : attention ? "text-amber-700 dark:text-amber-400"
                : tool.status === "succeeded" && statusLabel != null ? "text-foreground/60" : statusTone(tool.status)
            )}
          >
            <StatusIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0",
                tool.status === "running" && "motion-safe:animate-spin"
              )}
            />
            <span data-tool-status-label className={quietSuccess ? "sr-only" : undefined}>{statusLabel ?? (tool.settlementStatus === "outcome_unknown" ? i18n.t("trajectory.statuses.outcome_unknown")
              : tool.operation?.status === "save_pending" ? i18n.t("chat.agent.storagePending") : toolStatusLabel(tool.status))}</span>
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
