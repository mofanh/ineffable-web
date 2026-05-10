import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { SidebarFooter } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  ArrowUpIcon,
  GripVerticalIcon,
  SendHorizontalIcon,
  XIcon,
} from "lucide-react"

export type PreInputQueueItem = {
  id: string
  content: string
  status?: "pending" | "queued" | "promoting" | "deleting"
}

type ChatComposerProps = {
  composer: string
  error: string | null
  isSending: boolean
  preInputQueue: PreInputQueueItem[]
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onStop: () => void
  onPromoteToGuided: (id: string) => void
  onDeleteFromQueue: (id: string) => void
}

export function ChatComposer({
  composer,
  error,
  isSending,
  preInputQueue,
  onComposerChange,
  onComposerKeyDown,
  onSend,
  onStop,
  onPromoteToGuided,
  onDeleteFromQueue,
}: ChatComposerProps) {
  const isActionPending = (status?: PreInputQueueItem["status"]) =>
    status === "pending" || status === "promoting" || status === "deleting"

  return (
    <SidebarFooter className="p-3">
      {preInputQueue.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
            <GripVerticalIcon className="size-3" />
            <span>预输入队列 ({preInputQueue.length})</span>
          </div>
          <div className="max-h-[140px] space-y-1 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-1.5">
            {preInputQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-1.5 rounded-lg bg-background px-2.5 py-2 text-[13px] leading-snug shadow-sm"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/80">
                  {item.status === "pending" ? "预进入中 · " : ""}
                  {item.status === "promoting" ? "引导中 · " : ""}
                  {item.status === "deleting" ? "删除中 · " : ""}
                  {item.content.length > 100
                    ? `${item.content.slice(0, 100)}...`
                    : item.content}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 rounded-md text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"
                    title="提升为引导输入（立即注入当前对话）"
                    onClick={() => onPromoteToGuided(item.id)}
                    disabled={isActionPending(item.status)}
                  >
                    <SendHorizontalIcon className="size-3" />
                    <span className="sr-only">提升为引导</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="从队列中删除"
                    onClick={() => onDeleteFromQueue(item.id)}
                    disabled={isActionPending(item.status)}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">删除</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        <InputGroup className="h-auto overflow-hidden rounded-2xl border border-sidebar-border bg-background shadow-xs">
          <InputGroupTextarea
            aria-label="Chat message"
            placeholder={
              isSending
                ? "预输入 → 排队等待当前任务完成..."
                : "给 LLM 发送消息..."
            }
            rows={4}
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            className="min-h-24 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="justify-between border-t border-sidebar-border bg-sidebar-accent/15"
          >
            <p className="text-muted-foreground text-[11px]">
              {isSending
                ? "预输入 · Cmd/Ctrl + Enter 加入队列"
                : "Cmd/Ctrl + Enter 发送"}
            </p>
            <div className="flex items-center gap-2">
              {isSending ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onStop}
                >
                  停止
                </Button>
              ) : null}

              <InputGroupButton
                type="submit"
                size="icon-sm"
                className={cn(
                  "rounded-full transition-colors",
                  isSending && "bg-amber-500 text-white hover:bg-amber-600"
                )}
                disabled={!composer.trim()}
                title={isSending ? "加入预输入队列" : "发送消息"}
              >
                <ArrowUpIcon />
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}
