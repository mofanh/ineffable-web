import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SidebarHeader } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  CheckIcon,
  ChevronDownIcon,
  MessageSquareTextIcon,
  PanelRightIcon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"

type ChatSidebarHeaderProps = {
  isBound: boolean
  bindStatus: string
  selectedConversationId: string | null
  selectedConversationTitle: string
  conversations: Array<{ id: string; title: string; updatedAt?: string | null }>
  onSelectConversation: (conversationId: string | null) => void
  onRefreshConversations: () => void
  onStartNewChat: () => void
  onCollapseSidebar: () => void
}

type ConversationGroup = {
  label: string
  items: Array<{ id: string; title: string; updatedAt?: string | null }>
}

function HeaderActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={title}
      title={title}
      className="size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </Button>
  )
}

function getConversationGroupLabel(updatedAt?: string | null) {
  if (!updatedAt) {
    return "Older"
  }

  const updatedDate = new Date(updatedAt)
  if (Number.isNaN(updatedDate.getTime())) {
    return "Older"
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = startOfToday.getTime() - new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate()).getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays <= 0) {
    return "Today"
  }
  if (diffDays <= 7) {
    return "Previous 7 Days"
  }
  if (diffDays <= 30) {
    return "Previous 30 Days"
  }
  return "Older"
}

function groupConversations(
  conversations: Array<{ id: string; title: string; updatedAt?: string | null }>
) {
  const order = ["Today", "Previous 7 Days", "Previous 30 Days", "Older"]
  const grouped = new Map<string, ConversationGroup>()

  for (const conversation of conversations) {
    const label = getConversationGroupLabel(conversation.updatedAt)
    const bucket = grouped.get(label) ?? { label, items: [] }
    bucket.items.push(conversation)
    grouped.set(label, bucket)
  }

  return order
    .map((label) => grouped.get(label))
    .filter((group): group is ConversationGroup => Boolean(group && group.items.length))
}

export function ChatSidebarHeader({
  isBound,
  bindStatus,
  selectedConversationId,
  selectedConversationTitle,
  conversations,
  onSelectConversation,
  onRefreshConversations,
  onStartNewChat,
  onCollapseSidebar,
}: ChatSidebarHeaderProps) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)

  const handleStartNewChat = React.useCallback(() => {
    setOpen(false)
    setQuery("")
    onStartNewChat()
  }, [onStartNewChat])

  const handleSelectConversation = React.useCallback(
    (conversationId: string | null) => {
      setOpen(false)
      setQuery("")
      onSelectConversation(conversationId)
    },
    [onSelectConversation]
  )

  const filteredConversations = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return conversations
    }

    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalizedQuery)
    )
  }, [conversations, query])

  const groupedConversations = React.useMemo(
    () => groupConversations(filteredConversations),
    [filteredConversations]
  )

  return (
    <SidebarHeader className="gap-0 bg-sidebar p-0">
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 bg-sidebar pr-3 pl-5">
        {/* <HeaderAvatar /> */}

        {/* <div className="h-4 w-px shrink-0 bg-border" aria-hidden="true" /> */}

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group mr-4 flex min-w-0 flex-1 items-center gap-1 rounded py-0.5 pr-0 pl-0.5 text-left"
              aria-expanded={open}
              title={selectedConversationTitle}
            >
              <span className="truncate text-[14px] font-semibold text-foreground">
                {selectedConversationTitle}
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 text-muted-foreground",
                  isBound ? "text-emerald-600" : "text-muted-foreground"
                )}
                title={bindStatus}
              >
                <ChevronDownIcon className="size-3 transition-transform group-hover:translate-y-0.5 group-aria-expanded:rotate-180" />
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={10}
            className="w-[340px] min-w-[340px] overflow-hidden rounded-xl p-0"
          >
            <div className="rounded-lg bg-popover">
              <div className="flex items-center gap-1.5 border-b border-sidebar-border px-4 py-2.5">
                <SearchIcon className="size-4 text-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search..."
                  className="h-auto border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                <div className="px-1.5 py-1.5">
                  <button
                    type="button"
                    onClick={handleStartNewChat}
                    className="flex h-[34px] w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-accent"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PlusIcon className="size-4 text-muted-foreground" />
                      <span className="truncate">New Chat</span>
                    </div>
                  </button>
                </div>

                {groupedConversations.length === 0 ? (
                  <div className="border-t border-sidebar-border px-4 py-6 text-center">
                    <p className="text-sm font-medium text-foreground">没有匹配的历史对话</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      试试换个关键词，或者直接创建新对话。
                    </p>
                  </div>
                ) : (
                  groupedConversations.map((group) => (
                    <div
                      key={group.label}
                      className="overflow-hidden border-t border-sidebar-border px-1.5 py-1.5 first:border-t-0"
                    >
                      <div className="px-2 py-1 text-[12px] text-muted-foreground">
                        {group.label}
                      </div>
                      <div>
                        {group.items.map((conversation) => {
                          const isSelected = conversation.id === selectedConversationId

                          return (
                            <button
                              key={conversation.id}
                              type="button"
                              onClick={() => handleSelectConversation(conversation.id)}
                              className={cn(
                                "group flex h-[34px] w-full items-center justify-between gap-2 rounded-md pr-1.5 pl-2.5 text-left text-[13px] outline-none transition-colors",
                                isSelected ? "bg-accent" : "hover:bg-accent/70"
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {isSelected ? (
                                  <CheckIcon className="size-4 text-primary" />
                                ) : (
                                  <MessageSquareTextIcon className="size-4 text-muted-foreground" />
                                )}
                                <div className="truncate">{conversation.title}</div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex shrink-0 items-center gap-1">
          <HeaderActionButton title="刷新会话列表" onClick={onRefreshConversations}>
            <RefreshCcwIcon className="size-3.5 opacity-80" />
          </HeaderActionButton>
          <HeaderActionButton title="新对话" onClick={handleStartNewChat}>
            <PlusIcon className="size-4" />
          </HeaderActionButton>
          <HeaderActionButton
            title="打开会话面板"
            onClick={() => setOpen((current) => !current)}
          >
            <SquareArrowOutUpRightIcon className="size-4" />
          </HeaderActionButton>
          <HeaderActionButton title="收起右侧栏" onClick={onCollapseSidebar}>
            <PanelRightIcon className="size-4" />
          </HeaderActionButton>
        </div>
      </div>
    </SidebarHeader>
  )
}
