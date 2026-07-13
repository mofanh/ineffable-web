"use client"

import * as React from "react"

import { NavSecondary } from "@/components/nav-secondary"
import { defaultPath, navigation } from "@/routes/navigation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { IneffableLogo } from "@/components/ineffable-logo"
import { useAppSession } from "@/features/auth/app-session"
import { getLogoName, useLogoVariant } from "@/hooks/use-logo"
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceObject,
  getWorkspaceObjectContent,
  listIncomingWorkspaceInvitations,
  listWorkspaceTree,
  renameMoveWorkspaceObject,
  type Workspace,
  type WorkspaceObject,
} from "@/features/workspace/api/workspace-api"
import { downloadTextFile } from "@/features/workspace/model/download"
import {
  buildWorkspaceEntries,
  getCopyName,
  getUniqueName,
  getWorkspaceType,
  type SidebarEntry,
  type WorkspaceTreeMap,
} from "@/features/workspace/model/workspace-tree"
import {
  WORKSPACE_OBJECTS_CHANGED_EVENT,
  type WorkspaceObjectsChangedEvent,
} from "@/lib/workspace-events"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import {
  BadgeCheckIcon,
  BellIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderInputIcon,
  FolderPlusIcon,
  KeyRoundIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

const primaryNavItems: Array<{
  id: string
  title: string
  icon: LucideIcon
  path: string
  children?: Array<{
    id: string
    title: string
    icon: LucideIcon
    path: string
  }>
}> = [
  {
    id: "automation",
    title: "自动任务",
    icon: ZapIcon,
    path: "/automation",
  },
]

const systemManagementNavItems = [
  {
    id: "system-models",
    title: "模型管理",
    icon: BotIcon,
    path: "/system/models",
  },
  {
    id: "system-plans",
    title: "套餐管理",
    icon: PackageIcon,
    path: "/system/plans",
  },
  {
    id: "system-secrets",
    title: "密钥管理",
    icon: KeyRoundIcon,
    path: "/system/secrets",
  },
  {
    id: "system-users",
    title: "用户管理",
    icon: UsersIcon,
    path: "/system/users",
  },
]

function EntryIcon({ item }: { item: SidebarEntry }) {
  if (item.accent === "team") {
    return (
      <span className="flex size-5 items-center justify-center rounded-md bg-indigo-500 text-xs font-medium text-white">
        T
      </span>
    )
  }

  if (item.kind === "folder") {
    return item.expanded ? (
      <ChevronDownIcon className="text-sidebar-foreground/60" />
    ) : (
      <ChevronRightIcon className="text-sidebar-foreground/60" />
    )
  }

  if (item.kind === "html") {
    return <FileCodeIcon className="text-orange-500" />
  }

  return <FileTextIcon className="text-sky-500" />
}

type WorkspaceObjectAction =
  | "new-file"
  | "new-folder"
  | "copy-link"
  | "open-new-tab"
  | "duplicate"
  | "rename"
  | "move"
  | "export"
  | "delete"

type SpaceSectionAction =
  | "create-team"
  | "invite-members"
  | "manage-members"
  | "copy-link"
  | "open-new-tab"
  | "rename"
  | "export"
  | "delete"

type TeamWorkspaceAction =
  | "copy-link"
  | "open-new-tab"
  | "invite-members"
  | "manage-members"

function WorkspaceObjectMenu({
  item,
  onAction,
}: {
  item: SidebarEntry
  onAction: (action: WorkspaceObjectAction, item: SidebarEntry) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          aria-label={`${item.title} 操作`}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <MoreHorizontalIcon />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-56">
        <DropdownMenuItem onClick={() => onAction("copy-link", item)}>
          <LinkIcon />
          <span>复制链接</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>在新标签页打开</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {item.kind === "folder" ? (
          <>
            <DropdownMenuItem onClick={() => onAction("new-file", item)}>
              <FilePlusIcon />
              <span>新建文件</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("new-folder", item)}>
              <FolderPlusIcon />
              <span>新建文件夹</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("duplicate", item)}>
            <CopyIcon />
            <span>创建副本</span>
          </DropdownMenuItem>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("rename", item)}>
            <PencilIcon />
            <span>重命名</span>
          </DropdownMenuItem>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("move", item)}>
            <FolderInputIcon />
            <span>移动到…</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onAction("export", item)}>
          <DownloadIcon />
          <span>导出</span>
        </DropdownMenuItem>
        {!item.isWorkspaceRoot ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onAction("delete", item)}
            >
              <Trash2Icon />
              <span>删除</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TeamWorkspaceMenu({
  item,
  onAction,
}: {
  item: SidebarEntry
  onAction: (action: TeamWorkspaceAction, item: SidebarEntry) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          aria-label={`${item.title} 操作`}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <MoreHorizontalIcon />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-56">
        <DropdownMenuItem onClick={() => onAction("copy-link", item)}>
          <LinkIcon />
          <span>复制链接</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>在新标签页打开</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("invite-members", item)}>
          <UserPlusIcon />
          <span>邀请成员</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("manage-members", item)}>
          <UsersIcon />
          <span>管理成员</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarEntryButton({
  item,
  selectedEntryId,
  onSelectEntry,
  onOpenEntry,
  onAction,
  onTeamAction,
}: {
  item: SidebarEntry
  selectedEntryId: string
  onSelectEntry: (entryId: string) => void
  onOpenEntry: (item: SidebarEntry) => void
  onAction: (action: WorkspaceObjectAction, item: SidebarEntry) => void
  onTeamAction?: (action: TeamWorkspaceAction, item: SidebarEntry) => void
}) {
  const depthClass =
    item.depth === 2 ? "pl-12" : item.depth === 1 ? "pl-7" : undefined

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={selectedEntryId === item.id}
        tooltip={item.title}
        className={depthClass}
        onClick={() => {
          onSelectEntry(item.id)
          onOpenEntry(item)
        }}
      >
        <EntryIcon item={item} />
        <span>{item.title}</span>
      </SidebarMenuButton>
      {item.isWorkspaceRoot && item.accent === "team" && onTeamAction ? (
        <TeamWorkspaceMenu item={item} onAction={onTeamAction} />
      ) : item.workspaceId ? (
        <WorkspaceObjectMenu item={item} onAction={onAction} />
      ) : null}
    </SidebarMenuItem>
  )
}

function PrimaryNav({
  items,
  onSelectEntry,
}: {
  items: typeof primaryNavItems
  onSelectEntry: (entryId: string) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [openGroupIds, setOpenGroupIds] = React.useState<Set<string>>(
    () => new Set(["system-management"])
  )

  return (
    <SidebarGroup className="pt-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const children = item.children ?? []
            const isGroup = children.length > 0
            const isChildActive = children.some(
              (child) => location.pathname === child.path.split("?")[0]
            )
            const isActive =
              location.pathname === item.path.split("?")[0] || isChildActive
            const isOpen = openGroupIds.has(item.id) || isChildActive

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  isActive={isActive}
                  tooltip={item.title}
                  onClick={() => {
                    onSelectEntry(item.id)
                    if (isGroup) {
                      setOpenGroupIds((current) => {
                        const next = new Set(current)
                        if (next.has(item.id)) {
                          next.delete(item.id)
                        } else {
                          next.add(item.id)
                        }
                        return next
                      })
                      if (!isChildActive) {
                        navigate(item.path)
                      }
                      return
                    }
                    navigate(item.path)
                  }}
                >
                  <Icon className="text-sidebar-foreground/70" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
                {isGroup ? (
                  <SidebarMenuAction
                    type="button"
                    aria-label={isOpen ? "收起系统管理" : "展开系统管理"}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setOpenGroupIds((current) => {
                        const next = new Set(current)
                        if (next.has(item.id)) {
                          next.delete(item.id)
                        } else {
                          next.add(item.id)
                        }
                        return next
                      })
                    }}
                  >
                    {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </SidebarMenuAction>
                ) : null}
                {isGroup && isOpen ? (
                  <SidebarMenu className="mt-1 gap-0.5 pl-3">
                    {children.map((child) => {
                      const ChildIcon = child.icon
                      const childActive =
                        location.pathname === child.path.split("?")[0]
                      return (
                        <SidebarMenuItem key={child.id}>
                          <SidebarMenuButton
                            type="button"
                            size="sm"
                            isActive={childActive}
                            tooltip={child.title}
                            className="pl-4"
                            onClick={() => {
                              onSelectEntry(child.id)
                              navigate(child.path)
                            }}
                          >
                            <ChildIcon className="text-sidebar-foreground/60" />
                            <span>{child.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                ) : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SpaceSection({
  title,
  entries,
  emptyLabel,
  isLoading,
  error,
  canCreate,
  actionMenu,
  createMode = "object",
  selectedEntryId,
  onSelectEntry,
  onOpenEntry,
  onCreate,
  onCreateTeam,
  onAction,
  onTeamAction,
}: {
  title: string
  entries: SidebarEntry[]
  emptyLabel?: string
  isLoading?: boolean
  error?: string | null
  canCreate?: boolean
  actionMenu?: React.ReactNode
  createMode?: "object" | "team"
  selectedEntryId: string
  onSelectEntry: (entryId: string) => void
  onOpenEntry: (item: SidebarEntry) => void
  onCreate: (kind: "file" | "folder") => void
  onCreateTeam?: () => void
  onAction: (action: WorkspaceObjectAction, item: SidebarEntry) => void
  onTeamAction?: (action: TeamWorkspaceAction, item: SidebarEntry) => void
}) {
  return (
    <SidebarGroup className="gap-1.5 py-2">
      <div className="flex h-8 items-center gap-1 px-2">
        <SidebarGroupLabel className="h-auto min-w-0 flex-1 px-0 py-1 text-xs font-semibold tracking-normal text-sidebar-foreground/55">
          {title}
        </SidebarGroupLabel>
        {actionMenu}
        {canCreate && createMode === "team" ? (
          <button
            type="button"
            aria-label={`创建${title}`}
            className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/65 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={onCreateTeam}
          >
            <PlusIcon className="size-4" />
          </button>
        ) : canCreate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`在${title}中新建`}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/65 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PlusIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={() => onCreate("file")}>
                <FilePlusIcon />
                <span>新建文件</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("folder")}>
                <FolderPlusIcon />
                <span>新建文件夹</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {entries.length ? (
            entries.map((item) => (
              <SidebarEntryButton
                key={item.id}
                item={item}
                selectedEntryId={selectedEntryId}
                onSelectEntry={onSelectEntry}
                onOpenEntry={onOpenEntry}
                onAction={onAction}
                onTeamAction={onTeamAction}
              />
            ))
          ) : (
            <SidebarMenuItem>
              <div className="mx-2 rounded-lg border border-dashed border-sidebar-border px-3 py-3 text-xs leading-5 text-sidebar-foreground/45">
                {isLoading ? "正在加载…" : error || emptyLabel || "暂无内容"}
              </div>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function WorkspaceAccountSwitcher({
  user,
  pendingInvitationCount,
  onLogout,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  pendingInvitationCount: number
  onLogout?: () => void
}) {
  const { isMobile } = useSidebar()
  const fallback = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
          <ChevronDownIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 min-w-64"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/account">
              <BadgeCheckIcon />
              <span>账号与登录设备</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/notifications">
              <BellIcon />
              <span>邀请通知</span>
              {pendingInvitationCount > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {pendingInvitationCount > 99 ? "99+" : pendingInvitationCount}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="p-0">
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/login"
            onClick={(event) => {
              if (!onLogout) {
                return
              }

              event.preventDefault()
              onLogout()
            }}
          >
            <LogOutIcon />
            <span>退出登录</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const logoVariant = useLogoVariant({ mode: "rotate" })
  const {
    accessToken,
    currentUser,
    currentWorkspace,
    logout,
    workspaces,
  } = useAppSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedEntryId, setSelectedEntryId] = React.useState("")
  const [workspaceTrees, setWorkspaceTrees] = React.useState<WorkspaceTreeMap>({})
  const [collapsedEntryIds, setCollapsedEntryIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [isTreeLoading, setIsTreeLoading] = React.useState(false)
  const [treeError, setTreeError] = React.useState<string | null>(null)
  const [pendingInvitationCount, setPendingInvitationCount] = React.useState(0)
  const loadedWorkspaceTreeKeyRef = React.useRef("")
  const reportActionError = React.useCallback(
    (caught: unknown, fallbackMessage: string, title: string) => {
      const appError = normalizeAppError(caught, { fallbackMessage })
      notify.error({
        title,
        description: appError.message,
      })
      return appError.message
    },
    []
  )
  const workspaceTreeKey = React.useMemo(
    () => workspaces.map((workspace) => workspace.id).sort().join("|"),
    [workspaces]
  )
  const effectivePrimaryNavItems = React.useMemo(() => {
    if (currentUser?.role !== "admin") {
      return primaryNavItems
    }

    return [
      ...primaryNavItems,
      {
        id: "system-management",
        title: "系统管理",
        icon: ShieldIcon,
        path: "/system/models",
        children: systemManagementNavItems,
      },
    ]
  }, [currentUser?.role])

  React.useEffect(() => {
    const match = location.pathname.match(/^\/workspace\/[^/]+\/objects\/([^/]+)/)
    if (match?.[1]) {
      setSelectedEntryId(decodeURIComponent(match[1]))
    }
  }, [location.pathname])

  const refreshWorkspaceTrees = React.useCallback(
    async (options?: { workspaceIds?: string[]; showLoading?: boolean }) => {
      if (!accessToken || !workspaces.length) {
        setWorkspaceTrees({})
        setTreeError(null)
        setIsTreeLoading(false)
        return
      }

      const workspaceIds = options?.workspaceIds
      const targetWorkspaces = workspaceIds
        ? workspaces.filter((workspace) => workspaceIds.includes(workspace.id))
        : workspaces

      if (!targetWorkspaces.length) {
        return
      }

      if (options?.showLoading !== false) {
        setIsTreeLoading(true)
      }
      setTreeError(null)

      const results = await Promise.allSettled(
        targetWorkspaces.map(async (workspace) => {
          const tree = await listWorkspaceTree(accessToken, workspace.id)
          return [workspace.id, tree.objects] as const
        })
      )

      const nextTrees: WorkspaceTreeMap = {}
      let failed = false

      for (const result of results) {
        if (result.status === "fulfilled") {
          const [workspaceId, objects] = result.value
          nextTrees[workspaceId] = objects
        } else {
          failed = true
        }
      }

      setWorkspaceTrees((current) =>
        workspaceIds ? { ...current, ...nextTrees } : nextTrees
      )
      setTreeError(failed ? "文件列表加载失败，请稍后重试。" : null)
      setIsTreeLoading(false)
    },
    [accessToken, workspaces]
  )

  React.useEffect(() => {
    if (!accessToken || !workspaces.length) {
      setWorkspaceTrees({})
      setTreeError(null)
      setIsTreeLoading(false)
      loadedWorkspaceTreeKeyRef.current = ""
      return
    }

    if (loadedWorkspaceTreeKeyRef.current === workspaceTreeKey) {
      return
    }

    loadedWorkspaceTreeKeyRef.current = workspaceTreeKey
    let cancelled = false

    void refreshWorkspaceTrees().then(() => {
      if (cancelled) {
        return
      }
    })

    return () => {
      cancelled = true
    }
  }, [accessToken, refreshWorkspaceTrees, workspaceTreeKey, workspaces.length])

  React.useEffect(() => {
    if (!accessToken) {
      setPendingInvitationCount(0)
      return
    }

    let cancelled = false

    void listIncomingWorkspaceInvitations(accessToken)
      .then((response) => {
        if (!cancelled) {
          setPendingInvitationCount(response.invitations.length)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPendingInvitationCount(0)
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  React.useEffect(() => {
    const handleWorkspaceObjectsChanged = (event: Event) => {
      const detail = (event as WorkspaceObjectsChangedEvent).detail
      if (!detail?.workspaceId) {
        return
      }

      if (!workspaces.some((workspace) => workspace.id === detail.workspaceId)) {
        return
      }

      void refreshWorkspaceTrees({
        workspaceIds: [detail.workspaceId],
        showLoading: false,
      })
    }

    window.addEventListener(
      WORKSPACE_OBJECTS_CHANGED_EVENT,
      handleWorkspaceObjectsChanged
    )
    return () => {
      window.removeEventListener(
        WORKSPACE_OBJECTS_CHANGED_EVENT,
        handleWorkspaceObjectsChanged
      )
    }
  }, [refreshWorkspaceTrees, workspaces])

  const teamWorkspaces = React.useMemo(
    () => workspaces.filter((workspace) => getWorkspaceType(workspace) === "team"),
    [workspaces]
  )

  const personalWorkspaces = React.useMemo(() => {
    const personal = workspaces.filter(
      (workspace) =>
        getWorkspaceType(workspace) === "personal" &&
        (!currentUser?.id || workspace.owner_user_id === currentUser.id)
    )

    if (personal.length) {
      return personal
    }

    return workspaces.filter((workspace) => getWorkspaceType(workspace) !== "team")
  }, [currentUser?.id, workspaces])

  const teamSpaceEntries = React.useMemo(
    () =>
      teamWorkspaces.flatMap((workspace) =>
        buildWorkspaceEntries(workspace, workspaceTrees[workspace.id] ?? [], {
          includeRoot: true,
          rootAccent: "team",
          collapsedEntryIds,
        })
      ),
    [collapsedEntryIds, teamWorkspaces, workspaceTrees]
  )

  const personalSpaceEntries = React.useMemo(
    () =>
      personalWorkspaces.flatMap((workspace) =>
        buildWorkspaceEntries(workspace, workspaceTrees[workspace.id] ?? [], {
          includeRoot: personalWorkspaces.length > 1,
          collapsedEntryIds,
        })
      ),
    [collapsedEntryIds, personalWorkspaces, workspaceTrees]
  )

  const getSectionWorkspace = React.useCallback(
    (sectionWorkspaces: Workspace[]) => {
      if (!sectionWorkspaces.length) {
        notify.warning({ title: "暂无可用工作区" })
        return null
      }

      if (sectionWorkspaces.length === 1) {
        return sectionWorkspaces[0]
      }

      const input = window.prompt(
        `请输入工作区名称：\n${sectionWorkspaces.map((workspace) => workspace.name).join("\n")}`,
        sectionWorkspaces[0].name
      )
      if (!input) {
        return null
      }

      return (
        sectionWorkspaces.find(
          (workspace) =>
            workspace.name.toLowerCase() === input.trim().toLowerCase() ||
            workspace.slug.toLowerCase() === input.trim().toLowerCase()
        ) ?? null
      )
    },
    []
  )

  const createObject = React.useCallback(
    async ({
      workspace,
      parentId,
      kind,
    }: {
      workspace: Workspace
      parentId?: string | null
      kind: "file" | "folder"
    }) => {
      if (!accessToken) {
        return
      }

      const name = window.prompt(kind === "file" ? "文件名称" : "文件夹名称")
      const normalizedName = name?.trim()
      if (!normalizedName) {
        return
      }

      try {
        const response =
          kind === "file"
            ? await createWorkspaceFile(accessToken, workspace.id, {
                name: normalizedName,
                parent_id: parentId ?? null,
                content: "",
                mime_type: "text/plain",
              })
            : await createWorkspaceFolder(accessToken, workspace.id, {
                name: normalizedName,
                parent_id: parentId ?? null,
              })

        setSelectedEntryId(response.object.id)
        if (response.object.kind === "file") {
          void navigate(`/workspace/${workspace.id}/objects/${response.object.id}`)
        }
        await refreshWorkspaceTrees({
          workspaceIds: [workspace.id],
          showLoading: false,
        })
        notify.success({
          title: kind === "file" ? "文件已创建" : "文件夹已创建",
          description: response.object.name,
        })
      } catch (error) {
        reportActionError(error, "创建失败，请稍后重试。", "创建失败")
      }
    },
    [accessToken, navigate, refreshWorkspaceTrees, reportActionError]
  )

  const duplicateObject = React.useCallback(
    async (item: SidebarEntry) => {
      if (!accessToken || !item.object || !item.workspaceId) {
        return
      }

      const objects = workspaceTrees[item.workspaceId] ?? []
      const source = item.object
      const preferredName = getUniqueName(
        objects,
        source.parent_id,
        getCopyName(source.name)
      )

      if (source.kind === "file") {
        const content = await getWorkspaceObjectContent(
          accessToken,
          item.workspaceId,
          source.id
        )
        const created = await createWorkspaceFile(accessToken, item.workspaceId, {
          name: preferredName,
          parent_id: source.parent_id ?? null,
          content: content.content,
          mime_type: source.mime_type || "text/plain",
        })
        setSelectedEntryId(created.object.id)
        return
      }

      const childrenByParent = new Map<string, WorkspaceObject[]>()
      for (const object of objects) {
        const parentKey = object.parent_id || "root"
        const siblings = childrenByParent.get(parentKey) ?? []
        siblings.push(object)
        childrenByParent.set(parentKey, siblings)
      }

      const createdRoot = await createWorkspaceFolder(accessToken, item.workspaceId, {
        name: preferredName,
        parent_id: source.parent_id ?? null,
      })
      setSelectedEntryId(createdRoot.object.id)

      const cloneChildren = async (sourceParentId: string, targetParentId: string) => {
        const children = [...(childrenByParent.get(sourceParentId) ?? [])].sort(
          (left, right) => {
            if (left.kind !== right.kind) {
              return left.kind === "folder" ? -1 : 1
            }

            return left.name.localeCompare(right.name)
          }
        )

        for (const child of children) {
          if (child.kind === "folder") {
            const created = await createWorkspaceFolder(accessToken, item.workspaceId!, {
              name: child.name,
              parent_id: targetParentId,
            })
            await cloneChildren(child.id, created.object.id)
          } else {
            const content = await getWorkspaceObjectContent(
              accessToken,
              item.workspaceId!,
              child.id
            )
            await createWorkspaceFile(accessToken, item.workspaceId!, {
              name: child.name,
              parent_id: targetParentId,
              content: content.content,
              mime_type: child.mime_type || "text/plain",
            })
          }
        }
      }

      await cloneChildren(source.id, createdRoot.object.id)
    },
    [accessToken, workspaceTrees]
  )

  const handleObjectAction = React.useCallback(
    async (action: WorkspaceObjectAction, item: SidebarEntry) => {
      if (!accessToken || !item.workspaceId) {
        return
      }

      const workspace = workspaces.find((candidate) => candidate.id === item.workspaceId)
      if (!workspace) {
        return
      }

      try {
        if (action === "new-file" || action === "new-folder") {
          await createObject({
            workspace,
            parentId: item.object?.kind === "folder" ? item.object.id : null,
            kind: action === "new-file" ? "file" : "folder",
          })
          return
        }

        const url =
          item.object?.kind === "file" && item.workspaceId
            ? `${window.location.origin}/workspace/${item.workspaceId}/objects/${item.object.id}`
            : `${window.location.origin}${window.location.pathname}?workspace=${item.workspaceId}&object=${item.object?.id ?? item.id}`
        if (action === "copy-link") {
          await navigator.clipboard?.writeText(url)
          notify.info({ title: "链接已复制" })
          return
        }

        if (action === "open-new-tab") {
          window.open(url, "_blank", "noopener,noreferrer")
          return
        }

        if (action === "export") {
          if (!item.object || item.isWorkspaceRoot) {
            const objects = workspaceTrees[item.workspaceId] ?? []
            downloadTextFile(
              `${workspace.name}.json`,
              JSON.stringify({ workspace, objects }, null, 2),
              "application/json"
            )
            notify.info({ title: "工作区已导出" })
            return
          }

          if (item.object.kind === "file") {
            const response = await getWorkspaceObjectContent(
              accessToken,
              item.workspaceId,
              item.object.id
            )
            downloadTextFile(
              item.object.name,
              response.content,
              item.object.mime_type || "text/plain"
            )
            notify.info({ title: "文件已导出" })
            return
          }

          const prefix = `${item.object.path}/`
          const objects = (workspaceTrees[item.workspaceId] ?? []).filter(
            (object) => object.id === item.object?.id || object.path.startsWith(prefix)
          )
          downloadTextFile(
            `${item.object.name}.json`,
            JSON.stringify({ folder: item.object, objects }, null, 2),
            "application/json"
          )
          notify.info({ title: "文件夹已导出" })
          return
        }

        if (!item.object) {
          return
        }

        if (action === "duplicate") {
          await duplicateObject(item)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          notify.success({ title: "副本已创建" })
          return
        }

        if (action === "rename") {
          const name = window.prompt("输入新名称", item.object.name)
          const normalizedName = name?.trim()
          if (!normalizedName || normalizedName === item.object.name) {
            return
          }

          const response = await renameMoveWorkspaceObject(
            accessToken,
            item.workspaceId,
            item.object.id,
            { name: normalizedName }
          )
          setSelectedEntryId(response.object.id)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          notify.success({
            title: "名称已更新",
            description: response.object.name,
          })
          return
        }

        if (action === "move") {
          const targetPath = window.prompt(
            "输入目标文件夹路径，留空将移动到工作区根目录。",
            ""
          )
          if (targetPath === null) {
            return
          }

          const normalizedPath = targetPath.trim().replace(/^\/+|\/+$/g, "")
          const targetFolder = normalizedPath
            ? (workspaceTrees[item.workspaceId] ?? []).find(
                (object) =>
                  object.kind === "folder" &&
                  object.path.toLowerCase() === normalizedPath.toLowerCase()
              )
            : null
          if (normalizedPath && !targetFolder) {
            notify.error({
              title: "移动失败",
              description: "未找到目标文件夹。",
            })
            return
          }

          const response = await renameMoveWorkspaceObject(
            accessToken,
            item.workspaceId,
            item.object.id,
            { parent_id: targetFolder?.id ?? null }
          )
          setSelectedEntryId(response.object.id)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          notify.success({
            title: "对象已移动",
            description: response.object.path,
          })
          return
        }

        if (action === "delete") {
          const confirmed = await confirm({
            title: `删除「${item.object.name}」？`,
            description: "该对象将从工作区中移除，此操作无法撤销。",
            confirmLabel: "删除",
            variant: "destructive",
          })
          if (!confirmed) {
            return
          }

          await deleteWorkspaceObject(accessToken, item.workspaceId, item.object.id)
          setSelectedEntryId(item.workspaceId)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          notify.success({ title: "对象已删除" })
        }
      } catch (error) {
        reportActionError(error, "操作失败，请稍后重试。", "操作失败")
      }
    },
    [
      accessToken,
      createObject,
      duplicateObject,
      refreshWorkspaceTrees,
      reportActionError,
      workspaceTrees,
      workspaces,
    ]
  )

  const handleTeamSpaceAction = React.useCallback(
    (action: SpaceSectionAction, workspaceId?: string) => {
      let selectedTeam = workspaceId
        ? teamWorkspaces.find((workspace) => workspace.id === workspaceId)
        : undefined
      if (!selectedTeam && currentWorkspace && getWorkspaceType(currentWorkspace) === "team") {
        selectedTeam = currentWorkspace
      }
      selectedTeam ??= teamWorkspaces[0]

      if (action === "copy-link") {
        if (!selectedTeam) {
          notify.warning({ title: "暂无可用团队空间" })
          return
        }
        void navigator.clipboard?.writeText(
          `${window.location.origin}?workspace=${selectedTeam.id}`
        )
        notify.info({ title: "团队空间链接已复制" })
        return
      }

      if (action === "open-new-tab") {
        if (!selectedTeam) {
          notify.warning({ title: "暂无可用团队空间" })
          return
        }
        window.open(
          `${window.location.origin}?workspace=${selectedTeam.id}`,
          "_blank",
          "noopener,noreferrer"
        )
        return
      }

      if (action === "create-team") {
        navigate("/team-spaces/new")
        return
      }

      if (action === "invite-members" || action === "manage-members") {
        if (!selectedTeam) {
          navigate("/team-spaces/new")
          return
        }
        navigate(`/team-spaces/${selectedTeam.id}/members`)
        return
      }

      notify.info({ title: "该团队空间操作暂未开放" })
    },
    [currentWorkspace, navigate, teamWorkspaces]
  )

  const handleTeamWorkspaceAction = React.useCallback(
    (action: TeamWorkspaceAction, item: SidebarEntry) => {
      handleTeamSpaceAction(action, item.workspaceId)
    },
    [handleTeamSpaceAction]
  )

  const openEntry = React.useCallback(
    (item: SidebarEntry) => {
      if (item.kind === "folder") {
        setCollapsedEntryIds((current) => {
          const next = new Set(current)
          if (next.has(item.id)) {
            next.delete(item.id)
          } else {
            next.add(item.id)
          }
          return next
        })
        return
      }

      if (item.object?.kind === "file" && item.workspaceId) {
        navigate(`/workspace/${item.workspaceId}/objects/${item.object.id}`)
      }
    },
    [navigate]
  )

  const navSecondary = navigation.secondary.map((item) => ({
    title: item.title,
    url: item.path,
    icon: <item.icon />,
  }))

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={`Ineffable · ${getLogoName(logoVariant)}`}
            >
              <Link to={defaultPath} className="flex w-full justify-start">
                <IneffableLogo variant={logoVariant} className="h-8 w-auto max-w-[132px]" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-0">
        <PrimaryNav
          items={effectivePrimaryNavItems}
          onSelectEntry={setSelectedEntryId}
        />
        <SidebarSeparator />
        <SpaceSection
          title="团队空间"
          entries={teamSpaceEntries}
          emptyLabel="还没有团队空间，可从右侧加号创建。"
          isLoading={isTreeLoading && Boolean(teamWorkspaces.length)}
          error={treeError}
          canCreate
          createMode="team"
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
          onOpenEntry={openEntry}
          onCreateTeam={() => navigate("/team-spaces/new")}
          onCreate={(kind) => {
            const workspace = getSectionWorkspace(teamWorkspaces)
            if (!workspace) {
              return
            }

            void createObject({ workspace, kind })
          }}
          onAction={handleObjectAction}
          onTeamAction={handleTeamWorkspaceAction}
        />
        <SpaceSection
          title="个人空间"
          entries={personalSpaceEntries}
          emptyLabel="还没有文件，可从右侧加号新建。"
          isLoading={isTreeLoading && Boolean(personalWorkspaces.length)}
          error={treeError}
          canCreate={Boolean(personalWorkspaces.length)}
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
          onOpenEntry={openEntry}
          onCreate={(kind) => {
            const workspace = getSectionWorkspace(personalWorkspaces)
            if (!workspace) {
              return
            }

            void createObject({ workspace, kind })
          }}
          onAction={handleObjectAction}
        />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceAccountSwitcher
              user={{
                name: currentUser?.display_name || currentUser?.email || "工作区用户",
                email: currentUser?.email || "未登录",
                avatar: currentUser?.avatar_url || "",
              }}
              pendingInvitationCount={pendingInvitationCount}
              onLogout={() => {
                void logout()
              }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
