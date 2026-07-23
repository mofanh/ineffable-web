import * as React from "react"
import { useTranslation } from "react-i18next"

import { StatusBadge, type StatusBadgeTone } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SidebarHeader } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { i18n } from "@/lib/i18n/i18n"
import type { ConversationRuntimeStatus } from "@/features/chat/model/conversation-runtime-status"
import {
  CheckIcon,
  ChevronDownIcon,
  BotIcon,
  Maximize2Icon,
  MessageSquareTextIcon,
  Minimize2Icon,
  PanelRightIcon,
  PlusIcon,
  RefreshCcwIcon,
  SearchIcon,
} from "lucide-react"

type ChatSidebarHeaderProps = {
  bindStatus: string
  selectedConversationId: string | null
  selectedConversationTitle: string
  conversations: ConversationListItem[]
  onSelectConversation: (conversationId: string | null) => void
  onRefreshConversations: () => void
  onStartNewChat: () => void
  isFullScreen: boolean
  onFullScreenChange: (isFullScreen: boolean) => void
  onCollapseSidebar: () => void
}

type ConversationListItem = {
  id: string
  title: string
  updatedAt?: string | null
  runtimeStatus?: ConversationRuntimeStatus | null
}

type ConversationGroup = {
  label: string
  items: ConversationListItem[]
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
    return i18n.t("chat.header.older")
  }

  const updatedDate = new Date(updatedAt)
  if (Number.isNaN(updatedDate.getTime())) {
    return i18n.t("chat.header.older")
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffMs = startOfToday.getTime() - new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate()).getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays <= 0) {
    return i18n.t("chat.header.today")
  }
  if (diffDays <= 7) {
    return i18n.t("chat.header.last7Days")
  }
  if (diffDays <= 30) {
    return i18n.t("chat.header.last30Days")
  }
  return i18n.t("chat.header.older")
}

function groupConversations(
  conversations: ConversationListItem[]
) {
  const order = [
    i18n.t("chat.header.today"),
    i18n.t("chat.header.last7Days"),
    i18n.t("chat.header.last30Days"),
    i18n.t("chat.header.older"),
  ]
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

function runtimeStatusBadge(status: ConversationRuntimeStatus) {
  const labels: Record<ConversationRuntimeStatus, string> = {
    running: i18n.t("chat.header.status.running"),
    awaiting_human: i18n.t("chat.header.status.awaitingHuman"),
    completed_unread: i18n.t("chat.header.status.completedUnread"),
    failed: i18n.t("chat.header.status.failed"),
  }
  const tones: Record<ConversationRuntimeStatus, StatusBadgeTone> = {
    running: "warning",
    awaiting_human: "warning",
    completed_unread: "success",
    failed: "danger",
  }

  return {
    label: labels[status],
    tone: tones[status],
  }
}

export function ChatSidebarHeader({
  bindStatus,
  selectedConversationId,
  selectedConversationTitle,
  conversations,
  onSelectConversation,
  onRefreshConversations,
  onStartNewChat,
  isFullScreen,
  onFullScreenChange,
  onCollapseSidebar,
}: ChatSidebarHeaderProps) {
  const { t } = useTranslation()
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
              className="group flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 pr-1 pl-0.5 text-left"
              aria-expanded={open}
              title={selectedConversationTitle}
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-background text-muted-foreground"
                title={t("chat.header.assistant")}
              >
                <BotIcon className="size-3.5" />
              </span>
              <span className="truncate text-[14px] font-semibold text-foreground">
                {selectedConversationTitle}
              </span>
              <span
                className="flex shrink-0 items-center gap-1 text-muted-foreground"
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
            className="w-[min(340px,calc(100vw-2rem))] min-w-0 overflow-hidden rounded-xl p-0"
          >
            <div className="rounded-lg bg-popover">
              <div className="flex items-center gap-1.5 border-b border-sidebar-border px-4 py-2.5">
                <SearchIcon className="size-4 text-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("chat.header.search")}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-[13px] shadow-none focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={t("chat.header.refresh")}
                  aria-label={t("chat.header.refresh")}
                  onClick={onRefreshConversations}
                  className="ml-auto shrink-0"
                >
                  <RefreshCcwIcon className="size-3.5" />
                </Button>
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
                      <span className="truncate">{t("chat.header.newChat")}</span>
                    </div>
                  </button>
                </div>

                {groupedConversations.length === 0 ? (
                  <div className="border-t border-sidebar-border px-4 py-6 text-center">
                    <p className="text-sm font-medium text-foreground">
                      {t("chat.header.noMatches")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("chat.header.noMatchesDescription")}
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
                              {conversation.runtimeStatus ? (
                                <StatusBadge
                                  status={conversation.runtimeStatus}
                                  {...runtimeStatusBadge(conversation.runtimeStatus)}
                                  className="h-5 shrink-0 px-1.5 text-[10px]"
                                />
                              ) : null}
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
          <HeaderActionButton
            title={t("chat.header.newChat")}
            onClick={handleStartNewChat}
          >
            <PlusIcon className="size-4" />
          </HeaderActionButton>
          <HeaderActionButton
            title={
              isFullScreen
                ? t("chat.header.exitFullScreen")
                : t("chat.header.enterFullScreen")
            }
            onClick={() => onFullScreenChange(!isFullScreen)}
          >
            {isFullScreen ? (
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </HeaderActionButton>
          <HeaderActionButton
            title={t("chat.header.collapse")}
            onClick={onCollapseSidebar}
          >
            <PanelRightIcon className="size-4" />
          </HeaderActionButton>
        </div>
      </div>
    </SidebarHeader>
  )
}
