import * as React from "react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { hasAgentPaneContent } from "@/features/chat/chat-pane-state"
import type { ChatEntry } from "@/features/chat/gateway-chat-types"
import {
  ArrowDownIcon,
  CheckIcon,
  Loader2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { AgentPane } from "@/features/chat/components/agent-pane"
import { cn } from "@/lib/utils"

type ChatMessageListProps = {
  entries: ChatEntry[]
  hasOlderEntries: boolean
  isLoadingOlderEntries: boolean
  olderEntriesError: string | null
  isSending: boolean
  showScrollToBottom: boolean
  scrollViewportRef: React.RefObject<HTMLDivElement | null>
  onViewportScroll: () => void
  onLoadOlderConversationMessagesPage: () => void
  onScrollToBottomClick: () => void
  onApproveApproval: (entryId: string) => void
  onRejectApproval: (entryId: string) => void
}

function StreamingTailDot() {
  const { t } = useTranslation()

  return (
    <span
      className="relative flex size-3 items-center justify-center"
      aria-label={t("chat.messages.generating")}
    >
      <span className="absolute inline-flex size-3 rounded-full bg-emerald-500/35 animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  )
}

export const ChatMessageList = React.memo(function ChatMessageList({
  entries,
  hasOlderEntries,
  isLoadingOlderEntries,
  olderEntriesError,
  isSending,
  showScrollToBottom,
  scrollViewportRef,
  onViewportScroll,
  onLoadOlderConversationMessagesPage,
  onScrollToBottomClick,
  onApproveApproval,
  onRejectApproval,
}: ChatMessageListProps) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="bg-sidebar-accent text-sidebar-accent-foreground flex size-12 items-center justify-center rounded-2xl border border-sidebar-border">
          <SparklesIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("chat.messages.startTitle")}</p>
          <p className="text-sidebar-foreground/70 text-xs leading-5">
            {t("chat.messages.startDescription")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollViewportRef}
        onScroll={(event) => {
          onViewportScroll()
          if (
            hasOlderEntries &&
            !isLoadingOlderEntries &&
            !olderEntriesError &&
            event.currentTarget.scrollTop < 96
          ) {
            onLoadOlderConversationMessagesPage()
          }
        }}
        className="flex h-full min-h-0 flex-col gap-7 overflow-y-auto px-3 py-4"
      >
        {hasOlderEntries ? (
          <div className="flex justify-center">
            <Button
              type="button"
              size="sm"
              variant={olderEntriesError ? "outline" : "ghost"}
              className="h-8 rounded-md px-3 text-xs text-sidebar-foreground/70"
              disabled={isLoadingOlderEntries}
              onClick={onLoadOlderConversationMessagesPage}
            >
              {isLoadingOlderEntries ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : null}
              {olderEntriesError
                ? t("chat.messages.retryOlder")
                : t("chat.messages.older")}
            </Button>
            {olderEntriesError ? (
              <p className="ml-2 max-w-[220px] truncate text-xs text-destructive">
                {olderEntriesError}
              </p>
            ) : null}
          </div>
        ) : null}

        {entries.map((entry, index) => {
          const showStreamingTail =
            isSending && entry.role === "assistant" && index === entries.length - 1

          if (entry.role === "user") {
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary/8 px-4 py-3 text-[14px] leading-7 text-foreground">
                  <p className="whitespace-pre-wrap wrap-break-word">{entry.content}</p>
                </div>
              </div>
            )
          }

          if (entry.role === "system") {
            return (
              <div key={entry.id} className="flex justify-start gap-3">
                <Avatar className="mt-1 size-8 border border-sidebar-border">
                  <AvatarFallback className="text-[11px]">!</AvatarFallback>
                </Avatar>
                <div className="max-w-[86%] text-sm leading-7 text-destructive">
                  <p className="whitespace-pre-wrap wrap-break-word">{entry.content}</p>
                </div>
              </div>
            )
          }

          if (entry.role === "approval") {
            const isBusy =
              entry.status === "approving" || entry.status === "rejecting"
            const isResolved =
              entry.status === "approved" || entry.status === "rejected"

            return (
              <div key={entry.id} className="flex justify-start gap-3">
                <Avatar className="mt-1 size-8 border border-amber-200 bg-amber-50">
                  <AvatarFallback className="bg-amber-50 text-amber-700">
                    <ShieldAlertIcon className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-[92%] min-w-0 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3 text-sm text-amber-950">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-amber-800">
                      {t("chat.messages.approvalWaiting")}
                    </p>
                    <p className="whitespace-pre-wrap break-words leading-6">
                      {entry.action}
                    </p>
                    {entry.executionSessionId ? (
                      <p className="break-all font-mono text-[11px] text-amber-800/80">
                        session {entry.executionSessionId}
                      </p>
                    ) : null}
                    {entry.error ? (
                      <p className="text-xs text-destructive">{entry.error}</p>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-md bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                      disabled={isBusy || isResolved || !entry.approvalId}
                      onClick={() => onApproveApproval(entry.id)}
                    >
                      {entry.status === "approving" ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <CheckIcon className="size-3.5" />
                      )}
                      {t("chat.messages.approve")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md border-amber-300 px-3 text-xs text-amber-900 hover:bg-amber-100"
                      disabled={isBusy || isResolved || !entry.approvalId}
                      onClick={() => onRejectApproval(entry.id)}
                    >
                      {entry.status === "rejecting" ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <XIcon className="size-3.5" />
                      )}
                      {t("chat.messages.reject")}
                    </Button>
                    {entry.status === "approved" ? (
                      <span className="text-xs text-emerald-700">
                        {t("chat.messages.approvedContinuing")}
                      </span>
                    ) : null}
                    {entry.status === "rejected" ? (
                      <span className="text-xs text-amber-800">
                        {t("chat.messages.rejected")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={entry.id} className="flex w-full justify-start">
              <div className="w-full min-w-0 space-y-5 pb-1 text-foreground">
                <AgentPane pane={entry.pane} />

                {entry.subagentOrder.length ? (
                  <div className="space-y-4 border-t border-sidebar-border/70 pt-4">
                    {entry.subagentOrder.map((subagentId) => {
                      const subagent = entry.subagents[subagentId]
                      if (!subagent || !hasAgentPaneContent(subagent)) {
                        return null
                      }

                      return (
                        <div
                          key={subagentId}
                          className="space-y-3 rounded-xl border border-sidebar-border/70 bg-black/2.5 px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate font-medium text-foreground/75">
                              {t("chat.messages.subtask", { name: subagent.name })}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
                                subagent.status === "streaming"
                                  ? "bg-sky-500/10 text-sky-700"
                                  : "bg-emerald-500/10 text-emerald-700"
                              )}
                            >
                              {subagent.status === "streaming"
                                ? t("chat.messages.running")
                                : t("chat.messages.completed")}
                            </span>
                          </div>
                          <AgentPane pane={subagent} />
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {showStreamingTail ? (
                  <div className="flex items-center pt-1 text-foreground/70">
                    <StreamingTailDot />
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {showScrollToBottom ? (
        <div className="pointer-events-none absolute right-4 bottom-4">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto h-9 rounded-full px-3 shadow-md"
            onClick={onScrollToBottomClick}
          >
            <ArrowDownIcon />
            {t("chat.messages.latest")}
          </Button>
        </div>
      ) : null}
    </div>
  )
})
