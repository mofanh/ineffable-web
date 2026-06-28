import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarFooter } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  ArrowUpIcon,
  BotIcon,
  GripVerticalIcon,
  SendHorizontalIcon,
  XIcon,
} from "lucide-react"

export type PreInputQueueItem = {
  id: string
  content: string
  status?: "pending" | "queued" | "promoting" | "deleting"
}

export type AgentWorkspaceOption = {
  id: string
  name: string
}

export type AgentDescriptorOption = {
  workspaceId: string
  path: string
  label: string
}

type ChatComposerProps = {
  composer: string
  error: string | null
  isSending: boolean
  preInputQueue: PreInputQueueItem[]
  workspaceOptions: AgentWorkspaceOption[]
  agentDescriptorOptions: AgentDescriptorOption[]
  selectedAgentWorkspaceId: string
  selectedAgentPath: string
  sandboxOptions: { environmentId: string; label: string; status: string }[]
  selectedSandboxEnvironmentId: string
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onAgentWorkspaceChange: (value: string) => void
  onAgentPathChange: (value: string) => void
  onInsertAgentDescriptor: () => void
  onSandboxEnvironmentChange: (value: string) => void
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
  workspaceOptions,
  agentDescriptorOptions,
  selectedAgentWorkspaceId,
  selectedAgentPath,
  sandboxOptions,
  selectedSandboxEnvironmentId,
  onComposerChange,
  onComposerKeyDown,
  onAgentWorkspaceChange,
  onAgentPathChange,
  onInsertAgentDescriptor,
  onSandboxEnvironmentChange,
  onSend,
  onStop,
  onPromoteToGuided,
  onDeleteFromQueue,
}: ChatComposerProps) {
  const isActionPending = (status?: PreInputQueueItem["status"]) =>
    status === "pending" || status === "promoting" || status === "deleting"
  const workspaceAgentOptions = agentDescriptorOptions.filter(
    (option) => option.workspaceId === selectedAgentWorkspaceId
  )

  return (
    <SidebarFooter className="p-2">
      {preInputQueue.length > 0 ? (
        <div className="mb-1.5 space-y-1.5">
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
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        <InputGroup className="h-auto overflow-hidden rounded-2xl border border-sidebar-border bg-background shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-sidebar-border bg-sidebar-accent/10 px-2 py-1.5">
            <BotIcon className="size-3.5 text-muted-foreground" />
            <Select
              value={selectedAgentWorkspaceId || "__none__"}
              onValueChange={(value) =>
                onAgentWorkspaceChange(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-[150px] max-w-full rounded-md bg-background text-xs"
              >
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Workspace</SelectItem>
                {workspaceOptions.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedAgentPath || "__none__"}
              onValueChange={(value) =>
                onAgentPathChange(value === "__none__" ? "" : value)
              }
              disabled={!selectedAgentWorkspaceId}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-[190px] max-w-full rounded-md bg-background text-xs"
              >
                <SelectValue placeholder="Agent file" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {selectedAgentWorkspaceId ? "Agent file" : "Select workspace"}
                </SelectItem>
                {workspaceAgentOptions.map((agent) => (
                  <SelectItem key={`${agent.workspaceId}:${agent.path}`} value={agent.path}>
                    {agent.label}
                  </SelectItem>
                ))}
                {selectedAgentWorkspaceId && workspaceAgentOptions.length === 0 ? (
                  <SelectItem value="__empty__" disabled>
                    Create system/agents/*.md in workspace files
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={!selectedAgentWorkspaceId || !selectedAgentPath}
              onClick={onInsertAgentDescriptor}
            >
              插入 Agent
            </Button>
          </div>
          <InputGroupTextarea
            aria-label="Chat message"
            placeholder={
              isSending
                ? "预输入 → 排队等待当前任务完成..."
                : "给 LLM 发送消息..."
            }
            rows={2}
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            className="min-h-14 max-h-32 overflow-y-auto border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="justify-between border-t border-sidebar-border bg-sidebar-accent/15 px-2 py-1.5 [.border-t]:pt-1.5"
          >
            <div className="flex min-w-0 items-center">
              <Select
                value={selectedSandboxEnvironmentId || "__auto__"}
                onValueChange={(value) =>
                  onSandboxEnvironmentChange(value === "__auto__" ? "" : value)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[160px] max-w-full rounded-md bg-background text-xs"
                >
                  <SelectValue placeholder="Sandbox" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Sandbox: Auto</SelectItem>
                  {sandboxOptions.map((option) => (
                    <SelectItem
                      key={option.environmentId}
                      value={option.environmentId}
                    >
                      {option.label} / {option.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
