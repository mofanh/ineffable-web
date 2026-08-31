import * as React from "react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import type { ChatEntry } from "@/features/chat/gateway-chat-types"
import {
  ArrowDownIcon,
  CheckIcon,
  Loader2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { WebNodeList } from "@/features/chat/components/agent-pane"
import type { AgentUserInputResponse } from "@/features/chat/components/agent-tool-renderers"
import { containChatWheel } from "@/features/chat/components/chat-scroll-boundary"
import { cn } from "@/lib/utils"

type ChatMessageListProps = {
  entries: ChatEntry[]
  hasOlderEntries: boolean
  isLoadingOlderEntries: boolean
  olderEntriesError: string | null
  isAwaitingResponse: boolean
  isLoadingInitial: boolean
  showScrollToBottom: boolean
  scrollViewportRef: React.RefObject<HTMLDivElement | null>
  onViewportScroll: () => void
  onLoadOlderConversationMessagesPage: () => void
  onScrollToBottomClick: () => void
  onStreamingContentProgress: () => void
  onApproveApproval: (entryId: string) => void
  onRejectApproval: (entryId: string) => void
  activeHumanRunId: string | null
  onSubmitUserInput: (response: AgentUserInputResponse) => Promise<void>
  isFullScreen: boolean
}

function RunActivity() {
  const { t } = useTranslation()
  const [startedAt] = React.useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-foreground/48" role="status">
      <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
      <span>
        {elapsedSeconds >= 15
          ? t("chat.messages.generatingFor", { seconds: elapsedSeconds })
          : t("chat.messages.generating")}
      </span>
    </span>
  )
}

function ThinkingPlaceholder() {
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center gap-2 text-[14px] text-foreground/60"
      role="status"
      aria-live="polite"
    >
      <Loader2Icon className="size-3.5 animate-spin" />
      <span>{t("chat.messages.thinking")}</span>
    </div>
  )
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  return prefersReducedMotion
}

export const ChatMessageList = React.memo(function ChatMessageList({
  entries,
  hasOlderEntries,
  isLoadingOlderEntries,
  olderEntriesError,
  isAwaitingResponse,
  isLoadingInitial,
  showScrollToBottom,
  scrollViewportRef,
  onViewportScroll,
  onLoadOlderConversationMessagesPage,
  onScrollToBottomClick,
  onStreamingContentProgress,
  onApproveApproval,
  onRejectApproval,
  activeHumanRunId,
  onSubmitUserInput,
  isFullScreen,
}: ChatMessageListProps) {
  const { t } = useTranslation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const messageContentRef = React.useRef<HTMLDivElement | null>(null)
  const hasEntries = entries.length > 0
  const lastEntry = entries.at(-1)
  const showThinkingPlaceholder =
    isAwaitingResponse &&
    !(
      lastEntry?.role === "assistant" &&
      lastEntry.status === "streaming"
    )

  React.useEffect(() => {
    const content = messageContentRef.current
    if (!content || typeof ResizeObserver === "undefined") {
      return
    }

    let animationFrame: number | null = null
    const observer = new ResizeObserver(() => {
      if (animationFrame != null) {
        return
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null
        onStreamingContentProgress()
      })
    })

    observer.observe(content)
    return () => {
      observer.disconnect()
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [hasEntries, onStreamingContentProgress, showThinkingPlaceholder])

  if (!hasEntries && isLoadingInitial) {
    return (
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col gap-7 px-5 py-8 md:px-8" role="status">
        <span className="sr-only">{t("chat.gateway.syncingHistory")}</span>
        {["w-2/5", "w-full", "w-4/5", "w-full"].map((width, index) => (
          <div key={index} className="space-y-3" aria-hidden="true">
            <div className={`h-4 animate-pulse rounded bg-foreground/8 ${width}`} />
            <div className="h-16 animate-pulse rounded-xl bg-foreground/5" />
          </div>
        ))}
      </div>
    )
  }

  if (!hasEntries && !showThinkingPlaceholder) {
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
        data-chat-scroll-region
        onWheel={containChatWheel}
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
        className={cn(
          "h-full min-h-0 overflow-y-auto overscroll-contain py-4",
          isFullScreen ? "px-5 md:px-8" : "px-3"
        )}
      >
        <div
          ref={messageContentRef}
          data-chat-scroll-content
          className={cn(
            "mx-auto flex min-h-full w-full flex-col gap-7",
            isFullScreen && "max-w-[760px]"
          )}
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
            entry.role === "assistant" &&
            entry.status === "streaming" &&
            index === entries.length - 1

          if (entry.role === "user") {
            return (
              <div key={entry.id} data-chat-row-key={entry.id} className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary/8 px-4 py-3 text-[14px] leading-7 text-foreground">
                  <p className="whitespace-pre-wrap wrap-break-word">{entry.content}</p>
                </div>
              </div>
            )
          }

          if (entry.role === "system") {
            return (
              <div key={entry.id} data-chat-row-key={entry.id} className="flex justify-start gap-3">
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
              <div key={entry.id} data-chat-row-key={entry.id} className="flex justify-start gap-3">
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
                <WebNodeList
                  pane={entry.pane}
                  isStreaming={showStreamingTail}
                  prefersReducedMotion={prefersReducedMotion}
                  canRespondToUserInput={
                    Boolean(activeHumanRunId) && entry.runId === activeHumanRunId
                  }
                  onSubmitUserInput={onSubmitUserInput}
                  subagentOrder={entry.subagentOrder}
                  subagents={entry.subagents}
                />

                {showStreamingTail ? (
                  <div className="flex items-center pt-1 text-foreground/70">
                    <RunActivity />
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
        {showThinkingPlaceholder ? <ThinkingPlaceholder /> : null}
        </div>
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
