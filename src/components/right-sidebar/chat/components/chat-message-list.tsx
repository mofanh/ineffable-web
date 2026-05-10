import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { hasAgentPaneContent } from "@/components/right-sidebar/chat/chat-pane-state"
import type { ChatEntry } from "@/components/right-sidebar/chat/gateway-chat-types"
import { ArrowDownIcon, SparklesIcon } from "lucide-react"
import { AgentPane } from "@/components/right-sidebar/chat/components/agent-pane"

type ChatMessageListProps = {
  entries: ChatEntry[]
  isSending: boolean
  showScrollToBottom: boolean
  scrollViewportRef: React.RefObject<HTMLDivElement | null>
  onViewportScroll: () => void
  onScrollToBottomClick: () => void
}

function StreamingTailDot() {
  return (
    <span className="relative flex size-3 items-center justify-center" aria-label="Streaming">
      <span className="absolute inline-flex size-3 rounded-full bg-emerald-500/35 animate-ping" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  )
}

export function ChatMessageList({
  entries,
  isSending,
  showScrollToBottom,
  scrollViewportRef,
  onViewportScroll,
  onScrollToBottomClick,
}: ChatMessageListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="bg-sidebar-accent text-sidebar-accent-foreground flex size-12 items-center justify-center rounded-2xl border border-sidebar-border">
          <SparklesIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">还没有对话</p>
          <p className="text-sidebar-foreground/70 text-xs leading-5">
            在这里直接和后端 LLM 对话，新会话会自动初始化。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollViewportRef}
        onScroll={onViewportScroll}
        className="flex h-full min-h-0 flex-col gap-7 overflow-y-auto px-3 py-4"
      >
        {entries.map((entry, index) => {
          const showStreamingTail =
            isSending && entry.role === "assistant" && index === entries.length - 1

          if (entry.role === "user") {
            return (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[82%] rounded-[28px] bg-black/6 px-5 py-4 text-[15px] leading-8 text-foreground shadow-sm">
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

          return (
            <div key={entry.id} className="flex justify-start gap-3">
              <div className="max-w-[92%] min-w-0 space-y-5 pb-1 text-foreground">
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
                          className="space-y-3 rounded-2xl bg-black/2.5 px-3 py-3"
                        >
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
            最新消息
          </Button>
        </div>
      ) : null}
    </div>
  )
}
