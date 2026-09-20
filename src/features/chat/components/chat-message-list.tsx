import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { copyTextToClipboard } from "@/lib/app/clipboard"
import { getCurrentLocale } from "@/lib/i18n/i18n"
import { ImageGallery } from "@/components/app/image-gallery"
import type { ImageReference } from "@/lib/api/images"
import { inputProgressLabel, isWaitingGuidedInput } from "@/features/chat/model/input-progress"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ChatEntry } from "@/features/chat/gateway-chat-types"
import {
  ListTreeIcon,
  InfoIcon,
  ListCollapseIcon,
  ArrowDownIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  PauseIcon,
  MessageCircleQuestionIcon,
  BotIcon,
  BoxIcon,
  CheckIcon,
  Clock3Icon,
  CopyIcon,
  CpuIcon,
  Loader2Icon,
  ShieldAlertIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TimerIcon,
  XIcon,
} from "lucide-react"
import { WebNodeList } from "@/features/chat/components/agent-pane"
import type { AgentUserInputResponse } from "@/features/chat/components/agent-tool-renderers"
import { useChatScrollBoundary } from "@/features/chat/components/chat-scroll-boundary"
import { cn } from "@/lib/utils"

const inputStatusIcons = {
  "inputProgress.sending": Loader2Icon,
  "inputProgress.received": Clock3Icon,
  "inputProgress.queued": Clock3Icon,
  "inputProgress.blocked": PauseIcon,
  "inputProgress.resuming": Loader2Icon,
  "inputProgress.processing": Loader2Icon,
  "inputProgress.finished": CheckIcon,
  "inputProgress.acceptedFailed": CircleAlertIcon,
  "inputProgress.acceptedCancelled": XIcon,
  "inputProgress.acceptedAwaiting": MessageCircleQuestionIcon,
  "inputProgress.acceptedSuspended": PauseIcon,
  "inputProgress.cancelled": XIcon,
  "inputProgress.unconfirmed": CircleHelpIcon,
}

function InputStatusIcon({ label, phase }: { label: string; phase?: string }) {
  const { t } = useTranslation()
  const Icon = inputStatusIcons[label as keyof typeof inputStatusIcons] ?? CircleHelpIcon
  const spinning = Icon === Loader2Icon
  return (
    <div className="mt-0.5 flex justify-end" data-input-progress={phase}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t(label)}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              label === "inputProgress.acceptedFailed" && "text-destructive",
              ["inputProgress.blocked", "inputProgress.acceptedAwaiting", "inputProgress.acceptedSuspended"].includes(label) && "text-amber-600 dark:text-amber-400"
            )}
          >
            <Icon aria-hidden="true" className={cn("size-3.5", spinning && "motion-safe:animate-spin")} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>{t(label)}</TooltipContent>
      </Tooltip>
    </div>
  )
}

type ChatMessageListProps = {
  onOpenConversation?: (conversationId: string) => void
  compactingRunId?: string | null
  accessToken?: string | null
  onImageReference?: (image: ImageReference) => void
  onInspectRun?: (runId: string) => void
  entries: ChatEntry[]
  modelDisplayNames?: Record<string, string>
  sandboxDisplayNames?: Record<string, string>
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
  activeHumanNeedId?: string | null
  onSubmitUserInput: (response: AgentUserInputResponse) => Promise<void>
  isFullScreen: boolean
  trialVerdict?: {
    entryId: string
    busyAction: "accept" | "rollback" | null
    canAccept: boolean
    canRollback: boolean
    onAccept: () => void
    onRollback: () => void
  } | null
}

function assistantAnswerText(entry: Extract<ChatEntry, { role: "assistant" }>) {
  return entry.pane.blockOrder
    .map((blockId) => entry.pane.blocks[blockId])
    .filter((block) => block?.type === "text")
    .map((block) => block.content)
    .join("\n\n")
    .trim()
}

function formatRunDuration(durationMs: number | null | undefined) {
  if (!Number.isFinite(durationMs) || durationMs == null || durationMs < 0) {
    return null
  }
  if (durationMs < 1_000) return `${durationMs} ms`
  if (durationMs < 60_000) {
    const seconds = durationMs / 1_000
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} s`
  }
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.floor((durationMs % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

function formatCompletionTime(value: string | null | undefined) {
  if (!value) return null
  const completedAt = new Date(value)
  if (!Number.isFinite(completedAt.getTime())) return null
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(completedAt)
}

function RunActivity({ compacting = false }: { compacting?: boolean }) {
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
      {compacting ? <ListCollapseIcon aria-hidden="true" className="size-3.5 motion-safe:animate-pulse" /> : <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />}
      <span>
        {compacting ? t("chat.messages.compacting") : elapsedSeconds >= 15
          ? t("chat.messages.generatingFor", { seconds: elapsedSeconds })
          : t("chat.messages.generating")}
      </span>
    </span>
  )
}

function ThinkingPlaceholder({ compacting = false }: { compacting?: boolean }) {
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center gap-2 text-[14px] text-foreground/60"
      role="status"
      aria-live="polite"
    >
      {compacting ? <ListCollapseIcon aria-hidden="true" className="size-3.5 motion-safe:animate-pulse" /> : <Loader2Icon className="size-3.5 animate-spin" />}
      <span>{t(compacting ? "chat.messages.compacting" : "chat.messages.thinking")}</span>
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
  onOpenConversation,
  compactingRunId,
  accessToken, onImageReference,
  entries,
  modelDisplayNames = {},
  sandboxDisplayNames = {},
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
  activeHumanNeedId,
  onSubmitUserInput,
  isFullScreen,
  trialVerdict,
  onInspectRun,
}: ChatMessageListProps) {
  const scrollBoundaryRef = useChatScrollBoundary(scrollViewportRef)
  const { t } = useTranslation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const messageContentRef = React.useRef<HTMLDivElement | null>(null)
  const hasEntries = entries.length > 0
  const lastEntry = entries.at(-1)
  const showThinkingPlaceholder =
    isAwaitingResponse &&
    !(lastEntry?.role === "user" && isWaitingGuidedInput(lastEntry)) &&
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
      <div className="mx-auto flex h-full w-full max-w-[760px] flex-col gap-7 px-5 pt-[calc(var(--chat-header-height,0px)+0.5rem)] pb-8 md:px-8" role="status">
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
        ref={scrollBoundaryRef}
        data-chat-scroll-region
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
          "h-full min-h-0 overflow-y-auto overscroll-contain pt-[calc(var(--chat-header-height,0px)+0.5rem)] pb-4 scroll-pt-[calc(var(--chat-header-height,0px)+0.5rem)]",
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
          const showTrialVerdict =
            entry.role === "assistant" &&
            entry.status === "done" &&
            trialVerdict?.entryId === entry.id
          const answerText =
            entry.role === "assistant" ? assistantAnswerText(entry) : ""
          const showAnswerFooter =
            entry.role === "assistant" &&
            entry.status === "done" &&
            Boolean(answerText)

          if (entry.role === "user") {
            const progressLabel = inputProgressLabel(entry.inputProgress, entry.deliveryStatus)
            return (
              <div
                key={entry.id}
                data-chat-row-key={entry.id}
                data-chat-entry-role="user"
                className="flex justify-end"
              >
                <div className="flex min-w-0 max-w-[82%] flex-col items-end">
                  {entry.inputProgress?.task_source ? <span className="mb-1 text-xs text-muted-foreground">{t("chat.header.taskInstruction")}</span> : null}
                  <div data-input-waiting={isWaitingGuidedInput(entry) || undefined}
                    className={cn("flex min-w-0 max-w-full flex-col items-end gap-2 transition-opacity", isWaitingGuidedInput(entry) && "opacity-50")}>
                    <ImageGallery images={entry.images ?? []} accessToken={accessToken} onReference={onImageReference} userMessage />
                    {entry.content ? <div data-user-message-text className="min-w-0 max-w-full rounded-2xl rounded-br-md bg-primary/8 px-4 py-3 text-[14px] leading-7 text-foreground">
                      {entry.inputProgress?.automation_source ? <details className="group" data-automation-instruction>
                        <summary className="cursor-pointer list-none space-y-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="block text-xs text-muted-foreground">{t("presentation.automation")}</span>
                          <span className="block font-medium">{entry.inputProgress.automation_source.name || t("presentation.automation")}</span>
                          {entry.inputProgress.automation_source.summary && <span className="block line-clamp-2 text-sm text-muted-foreground">{entry.inputProgress.automation_source.summary}</span>}
                          <span className="block text-xs text-muted-foreground group-open:hidden">{t("presentation.instruction")}</span>
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap wrap-break-word">{entry.content}</p>
                      </details> : <p className="whitespace-pre-wrap wrap-break-word">{entry.content}</p>}
                    </div> : null}
                  </div>
                  {progressLabel ? <InputStatusIcon label={progressLabel} phase={entry.inputProgress?.phase ?? entry.deliveryStatus} /> : null}
                </div>
              </div>
            )
          }

          if (entry.role === "system" && entry.taskResult) {
            const result = entry.taskResult
            return <div key={entry.id} data-chat-row-key={entry.id} data-chat-entry-role="system" className="rounded-xl border border-border/60 px-4 py-3 text-sm">
              <div className="font-medium">{result.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t(`chat.header.taskResult.${result.outcome}`)}</div>
              {onOpenConversation ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => onOpenConversation(result.conversationId)}>{t("chat.header.openTask")}</Button> : null}
            </div>
          }

          if (entry.role === "system") {
            return (
              <div
                key={entry.id}
                data-chat-row-key={entry.id}
                data-chat-entry-role="system"
                className="flex justify-start gap-3"
              >
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
              <div
                key={entry.id}
                data-chat-row-key={entry.id}
                data-chat-entry-role="approval"
                className="flex justify-start gap-3"
              >
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
            <div
              key={entry.id}
              data-chat-row-key={entry.id}
              data-chat-entry-role="assistant"
              className="flex w-full justify-start"
            >
              <div className="w-full min-w-0 space-y-5 pb-1 text-foreground">
                <WebNodeList
                      accessToken={accessToken} onImageReference={onImageReference}
                  pane={entry.pane}
                  isStreaming={showStreamingTail}
                  prefersReducedMotion={prefersReducedMotion}
                  canRespondToUserInput={
                    Number.isSafeInteger(entry.canonicalMessageSeqEnd) && Boolean(activeHumanRunId) && entry.runId === activeHumanRunId
                  }
                  activeHumanNeedId={activeHumanNeedId}
                  onSubmitUserInput={onSubmitUserInput}
                  subagentOrder={entry.subagentOrder}
                  subagents={entry.subagents}
                />

                {showStreamingTail ? (
                  <div className="flex items-center pt-1 text-foreground/70">
                    <RunActivity compacting={Boolean(compactingRunId && compactingRunId === entry.runId)} />
                  </div>
                ) : null}

                {!showAnswerFooter && entry.runId && onInspectRun && <div className="pt-1"><Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onInspectRun(entry.runId!)}><ListTreeIcon className="size-4" />{t("trajectory.open")}</Button></div>}
                {showAnswerFooter ? (
                  <div
                    className="flex min-w-0 flex-wrap items-center gap-2 pt-1 text-muted-foreground"
                    data-assistant-answer-footer
                    data-agent-trial-verdict={showTrialVerdict || undefined}
                  >
                    <div className="flex shrink-0 items-center gap-1">
                      {entry.runId && onInspectRun && <Button type="button" size="icon-sm" variant="ghost" className="rounded-full" aria-label={t("trajectory.open")} title={t("trajectory.open")} onClick={() => onInspectRun(entry.runId!)}><ListTreeIcon className="size-4" /></Button>}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="rounded-full"
                        aria-label={t("presentation.copy")}
                        title={t("presentation.copy")}
                        onClick={() => {
                          void copyTextToClipboard(answerText)
                        }}
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                      {showTrialVerdict ? (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="rounded-full hover:text-emerald-600"
                            disabled={!trialVerdict.canAccept || trialVerdict.busyAction !== null}
                            aria-label={t("presentation.keepAgent")}
                            title={t("presentation.keepAgentHint")}
                            onClick={trialVerdict.onAccept}
                          >
                            {trialVerdict.busyAction === "accept" ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              <ThumbsUpIcon className="size-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="rounded-full hover:text-destructive"
                            disabled={!trialVerdict.canRollback || trialVerdict.busyAction !== null}
                            aria-label={t("presentation.restoreAgent")}
                            title={t("presentation.restoreAgentHint")}
                            onClick={trialVerdict.onRollback}
                          >
                            {trialVerdict.busyAction === "rollback" ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              <ThumbsDownIcon className="size-4" />
                            )}
                          </Button>
                        </>
                      ) : null}
                    </div>

                    {entry.modelProfileId && <span className="inline-flex min-w-0 max-w-48 items-center gap-1 text-[11px] text-foreground/45" title={modelDisplayNames[entry.modelProfileId] ?? entry.modelProfileId}><CpuIcon className="size-3 shrink-0" /><span className="truncate">{modelDisplayNames[entry.modelProfileId] ?? entry.modelProfileId}</span></span>}
                    {entry.modelProfileId ||
                    entry.sandboxEnvironmentId ||
                    entry.agentId ||
                    entry.definitionFingerprint ||
                    entry.capabilityExposure ||
                    entry.runDurationMs != null ||
                    entry.runCompletedAt ? (
                      <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={t("presentation.answerDetails")} title={t("presentation.answerDetails")}><InfoIcon className="size-4" /></Button></PopoverTrigger>
                        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3">
                          <div
                            className="flex min-w-0 flex-col gap-3 text-xs wrap-anywhere text-muted-foreground"
                            data-answer-run-metadata
                          >
                            {entry.modelProfileId ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={`${t("presentation.model")}: ${entry.modelProfileId}`}
                              >
                                <CpuIcon className="size-3" />
                                {modelDisplayNames[entry.modelProfileId] ?? entry.modelProfileId}
                              </span>
                            ) : null}
                            {entry.sandboxEnvironmentId ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={t("chat.answerMetadata.sandboxTitle", {
                                  id: entry.sandboxEnvironmentId,
                                })}
                              >
                                <BoxIcon className="size-3" />
                                {sandboxDisplayNames[entry.sandboxEnvironmentId] ??
                                  entry.sandboxEnvironmentId}
                              </span>
                            ) : null}
                            {entry.agentId || entry.definitionFingerprint ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={`${t("presentation.agent")}: ${entry.agentId ?? "unknown"}${entry.definitionFingerprint ? ` (${entry.definitionFingerprint})` : ""}`}
                              >
                                <BotIcon className="size-3" />
                                {entry.agentId ?? "Agent"}
                                {entry.definitionFingerprint
                                  ? ` · ${entry.definitionFingerprint}`
                                  : ""}
                              </span>
                            ) : null}
                            {entry.capabilityExposure ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={t("chat.answerMetadata.capabilityTitle", {
                                  authorized: entry.capabilityExposure.authorizedCount,
                                  initial: entry.capabilityExposure.initialExposedCount,
                                  prefetched: entry.capabilityExposure.prefetchedCount,
                                  activated: entry.capabilityExposure.activatedCount,
                                  final: entry.capabilityExposure.finalExposedCount,
                                  deferred: entry.capabilityExposure.deferredCount,
                                  stable: entry.capabilityExposure.stableCount,
                                  dynamic: entry.capabilityExposure.dynamicCount,
                                  bytes: entry.capabilityExposure.schemaBytes,
                                  hash: entry.capabilityExposure.planHash,
                                })}
                              >
                                <SparklesIcon className="size-3" />
                                {t("chat.answerMetadata.capability", {
                                  mode: ({ clean: t("presentation.modeClean"), smart: t("presentation.modeSmart"), full: t("presentation.modeFull"), custom: t("presentation.modeCustom") } as Record<string, string>)[entry.capabilityExposure.mode] ?? entry.capabilityExposure.mode,
                                  count: entry.capabilityExposure.finalExposedCount,
                                })}
                              </span>
                            ) : null}
                            {formatRunDuration(entry.runDurationMs) ? (
                              <span className="inline-flex items-center gap-1" title={t("presentation.duration")}>
                                <TimerIcon className="size-3" />
                                {formatRunDuration(entry.runDurationMs)}
                              </span>
                            ) : null}
                            {formatCompletionTime(entry.runCompletedAt) ? (
                              <span
                                className="inline-flex items-center gap-1"
                                title={`${t("presentation.completedAt")}: ${entry.runCompletedAt}`}
                              >
                                <Clock3Icon className="size-3" />
                                {formatCompletionTime(entry.runCompletedAt)}
                              </span>
                            ) : null}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
        {showThinkingPlaceholder ? <ThinkingPlaceholder compacting={Boolean(compactingRunId)} /> : null}
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
