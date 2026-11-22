import * as React from "react"
import { ConversationTitleEditor } from "./conversation-title-editor"
import { useTranslation } from "react-i18next"

import { StatusBadge, type StatusBadgeTone } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { useChatScrollBoundary } from "@/features/chat/components/chat-scroll-boundary"
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
  workbench?: boolean
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
  onRenameConversation?: (conversationId: string, title: string) => Promise<void>
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
    suspended: i18n.t("chat.header.status.suspended"),
    completed_unread: i18n.t("chat.header.status.completedUnread"),
    failed: i18n.t("chat.header.status.failed"),
  }
  const tones: Record<ConversationRuntimeStatus, StatusBadgeTone> = {
    running: "warning",
    awaiting_human: "warning",
    suspended: "neutral",
    completed_unread: "success",
    failed: "danger",
  }

  return {
    label: labels[status],
    tone: tones[status],
  }
}

// Presentation only: selection and status remain owned by the single chat runtime.
export function ConversationNavigation({
  selectedConversationId, conversations, onSelectConversation,
  onRefreshConversations, onStartNewChat,
}: Pick<ChatSidebarHeaderProps, "selectedConversationId" | "conversations" | "onSelectConversation" | "onRefreshConversations" | "onStartNewChat">) {
  const { t } = useTranslation()
  const [query, setQuery] = React.useState("")
  const filtered = conversations.filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <nav aria-label={t("workbench.conversations")} className="flex min-h-0 flex-col gap-1 border-b border-sidebar-border/60 px-3 py-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:px-2">
      <div className="flex items-center gap-1 group-data-[collapsible=icon]:justify-center">
        <Button variant="ghost" aria-label={t("chat.header.newChat")} title={t("chat.header.newChat")} className="min-w-0 flex-1 justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0" onClick={onStartNewChat}><PlusIcon /><span className="group-data-[collapsible=icon]:hidden">{t("chat.header.newChat")}</span></Button>
        <span className="group-data-[collapsible=icon]:hidden"><HeaderActionButton title={t("chat.header.refresh")} onClick={onRefreshConversations}><RefreshCcwIcon className="size-4" /></HeaderActionButton></span>
      </div>
      <div className="relative my-1 shrink-0 group-data-[collapsible=icon]:hidden">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input aria-label={t("chat.header.search")} placeholder={t("chat.header.search")} value={query} onChange={event => setQuery(event.target.value)} className="h-9 rounded-lg border-transparent bg-sidebar-accent/40 pl-8 shadow-none focus-visible:border-ring" />
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain group-data-[collapsible=icon]:hidden">
        {groupConversations(filtered).map(group => <div key={group.label}>
          <div className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">{group.label}</div>
          {group.items.map(item => <button key={item.id} type="button" aria-current={item.id === selectedConversationId ? "true" : undefined} onClick={() => onSelectConversation(item.id)} className={cn("flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent focus-visible:outline-ring", item.id === selectedConversationId && "bg-sidebar-accent font-medium text-sidebar-foreground")}>
            <span className="min-w-0 flex-1 truncate" title={item.title}>{item.title}</span>
            {item.runtimeStatus ? <StatusBadge status={item.runtimeStatus} {...runtimeStatusBadge(item.runtimeStatus)} className="shrink-0 px-1 text-[10px]" /> : null}
          </button>)}
        </div>)}
        {!filtered.length ? <p className="px-2 py-3 text-xs text-muted-foreground">{t(conversations.length ? "chat.header.noMatches" : "workbench.empty")}</p> : null}
      </div>
    </nav>
  )
}

export function ChatSidebarHeader({
  workbench = false,
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
  onRenameConversation,
}: ChatSidebarHeaderProps) {
  const scrollBoundaryRef = useChatScrollBoundary<HTMLDivElement>()
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
    <SidebarHeader className={cn(
      "absolute inset-x-0 top-0 z-20 gap-0 p-0",
      isFullScreen ? "bg-transparent" : "bg-sidebar/80 backdrop-blur-md"
    )}>
      <div className="flex h-11 shrink-0 items-center gap-2.5 pr-3 pl-5">
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

              <div
                data-chat-scroll-region
                ref={scrollBoundaryRef}
                className="max-h-[360px] overflow-y-auto overscroll-contain"
              >
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
          {selectedConversationId && onRenameConversation && (
            <ConversationTitleEditor
              key={selectedConversationId}
              title={selectedConversationTitle}
              onSave={(title) => onRenameConversation(selectedConversationId, title)}
            />
          )}
          <HeaderActionButton
            title={t("chat.header.newChat")}
            onClick={handleStartNewChat}
          >
            <PlusIcon className="size-4" />
          </HeaderActionButton>
          {!workbench && <><HeaderActionButton
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
          </HeaderActionButton></>}

        </div>
      </div>
    </SidebarHeader>
  )
}
