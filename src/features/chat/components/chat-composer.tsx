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
  AtSignIcon,
  BotIcon,
  FileTextIcon,
  GripVerticalIcon,
  SendHorizontalIcon,
  XIcon,
} from "lucide-react"

export type PreInputQueueItem = {
  id: string
  content: string
  status?: "pending" | "queued" | "promoting" | "deleting"
}

export type AgentDescriptorOption = {
  workspaceId: string
  workspaceName: string
  path: string
  label: string
}

export type ModelProfileOption = {
  id: string
  displayName: string
  supportsReasoning: boolean
  supportsToolCalls: boolean
}

type ChatComposerProps = {
  composer: string
  error: string | null
  isSending: boolean
  preInputQueue: PreInputQueueItem[]
  agentDescriptorOptions: AgentDescriptorOption[]
  modelOptions: ModelProfileOption[]
  selectedModelProfileId: string
  sandboxOptions: { environmentId: string; label: string; status: string }[]
  selectedSandboxEnvironmentId: string
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onModelProfileChange: (value: string) => void
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
  agentDescriptorOptions,
  modelOptions,
  selectedModelProfileId,
  sandboxOptions,
  selectedSandboxEnvironmentId,
  onComposerChange,
  onComposerKeyDown,
  onModelProfileChange,
  onSandboxEnvironmentChange,
  onSend,
  onStop,
  onPromoteToGuided,
  onDeleteFromQueue,
}: ChatComposerProps) {
  const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false)

  const isActionPending = (status?: PreInputQueueItem["status"]) =>
    status === "pending" || status === "promoting" || status === "deleting"
  const agentTrigger = React.useMemo(() => {
    const match = composer.match(/(^|\s)@([^\s@]*)$/)
    if (!match || match.index == null) {
      return null
    }

    return {
      query: match[2].toLowerCase(),
      start: match.index + match[1].length,
    }
  }, [composer])
  const filteredAgentOptions = React.useMemo(() => {
    if (!agentTrigger?.query) {
      return agentDescriptorOptions
    }

    return agentDescriptorOptions.filter((option) => {
      const haystack = `${option.workspaceName} ${option.label} ${option.path}`.toLowerCase()
      return haystack.includes(agentTrigger.query)
    })
  }, [agentDescriptorOptions, agentTrigger])
  const groupedAgentOptions = filteredAgentOptions.reduce<
    { workspaceId: string; workspaceName: string; options: AgentDescriptorOption[] }[]
  >((groups, option) => {
    const group = groups.find((item) => item.workspaceId === option.workspaceId)
    if (group) {
      group.options.push(option)
      return groups
    }

    groups.push({
      workspaceId: option.workspaceId,
      workspaceName: option.workspaceName,
      options: [option],
    })
    return groups
  }, [])
  const shouldShowAgentMenu = isAgentMenuOpen && Boolean(agentTrigger)
  const hasAgentFiles = agentDescriptorOptions.length > 0
  const hasFilteredAgentFiles = filteredAgentOptions.length > 0
  const agentMenuHint = hasAgentFiles
    ? "输入以搜索 Agent 文件"
    : "在 workspace 文件中创建 system/agents/*.md 后可引用"

  function handleComposerValueChange(value: string) {
    onComposerChange(value)
    setIsAgentMenuOpen(/(^|\s)@([^\s@]*)$/.test(value))
  }

  function insertAgentDescriptor(option: AgentDescriptorOption) {
    const mention = `@agent(${option.workspaceId}:${option.path})`
    if (!agentTrigger) {
      const trimmedEnd = composer.replace(/\s+$/, "")
      onComposerChange(trimmedEnd ? `${trimmedEnd}\n${mention} ` : `${mention} `)
      setIsAgentMenuOpen(false)
      return
    }

    onComposerChange(`${composer.slice(0, agentTrigger.start)}${mention} `)
    setIsAgentMenuOpen(false)
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && shouldShowAgentMenu) {
      event.preventDefault()
      setIsAgentMenuOpen(false)
      return
    }

    onComposerKeyDown(event)
  }

  function handleAgentOptionMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
  }

  function handleComposerFocus() {
    if (agentTrigger) {
      setIsAgentMenuOpen(true)
    }
  }

  function handleComposerBlur() {
    window.setTimeout(() => setIsAgentMenuOpen(false), 120)
  }

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
                  {item.status === "queued" ? "排队中 · " : ""}
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

        {shouldShowAgentMenu ? (
          <div className="overflow-hidden rounded-2xl border border-sidebar-border bg-popover text-popover-foreground shadow-lg">
            <div className="px-3.5 py-2 text-sm font-medium">添加</div>
            <div className="space-y-1 px-2 pb-2">
              <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent/60 px-2.5 py-2 text-sm">
                <AtSignIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-medium">Agent 描述文件</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {agentMenuHint}
                </span>
              </div>

              <div className="px-1 pt-1 text-xs font-medium text-muted-foreground">
                Agent 文件
              </div>

              <div className="max-h-64 overflow-y-auto">
                {hasFilteredAgentFiles ? (
                  groupedAgentOptions.map((group) => (
                    <div key={group.workspaceId} className="py-1">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                        {group.workspaceName}
                      </div>
                      {group.options.map((option) => (
                        <button
                          key={`${option.workspaceId}:${option.path}`}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
                          onMouseDown={handleAgentOptionMouseDown}
                          onClick={() => insertAgentDescriptor(option)}
                        >
                          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {option.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.path}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    {hasAgentFiles
                      ? "没有匹配的 Agent 文件"
                      : "暂无可引用的 Agent 文件"}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <InputGroup className="h-auto overflow-hidden rounded-2xl border border-sidebar-border bg-background shadow-xs">
          <InputGroupTextarea
            aria-label="对话消息"
            placeholder={
              isSending
                ? "继续输入，消息将在当前任务完成后发送…"
                : "描述任务，或输入 @ 引用 Agent 文件…"
            }
            rows={2}
            value={composer}
            onChange={(event) => handleComposerValueChange(event.target.value)}
            onFocus={handleComposerFocus}
            onBlur={handleComposerBlur}
            onKeyDown={handleComposerKeyDown}
            className="min-h-14 max-h-32 overflow-y-auto border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="justify-between border-t border-sidebar-border bg-sidebar-accent/15 px-2 py-1.5 [.border-t]:pt-1.5"
          >
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-1">
              <Select
                value={selectedModelProfileId || "__default__"}
                onValueChange={(value) =>
                  onModelProfileChange(value === "__default__" ? "" : value)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-full min-w-0 rounded-md bg-background text-xs"
                >
                  <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">默认模型</SelectItem>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedSandboxEnvironmentId || "__auto__"}
                onValueChange={(value) =>
                  onSandboxEnvironmentChange(value === "__auto__" ? "" : value)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-full min-w-0 rounded-md bg-background text-xs"
                >
                  <SelectValue placeholder="沙箱" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">自动选择沙箱</SelectItem>
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
            <div className="ml-1 flex shrink-0 items-center gap-1">
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
                <span className="sr-only">{isSending ? "加入队列" : "发送"}</span>
              </InputGroupButton>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}
