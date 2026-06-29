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
import {
  BadgeCheckIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  CreditCardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FilePlusIcon,
  FileTextIcon,
  FolderInputIcon,
  FolderPlusIcon,
  LinkIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

const primaryNavItems: Array<{
  id: string
  title: string
  icon: LucideIcon
  path: string
}> = []

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
          aria-label={`${item.title} actions`}
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
          <span>Copy Link</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>Open in New Tab</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {item.kind === "folder" ? (
          <>
            <DropdownMenuItem onClick={() => onAction("new-file", item)}>
              <FilePlusIcon />
              <span>New File</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("new-folder", item)}>
              <FolderPlusIcon />
              <span>New Folder</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("duplicate", item)}>
            <CopyIcon />
            <span>Duplicate</span>
          </DropdownMenuItem>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("rename", item)}>
            <PencilIcon />
            <span>Rename</span>
          </DropdownMenuItem>
        ) : null}
        {!item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("move", item)}>
            <FolderInputIcon />
            <span>Move To...</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onAction("export", item)}>
          <DownloadIcon />
          <span>Export</span>
        </DropdownMenuItem>
        {!item.isWorkspaceRoot ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onAction("delete", item)}
            >
              <Trash2Icon />
              <span>Delete</span>
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
          aria-label={`${item.title} actions`}
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
          <span>Copy Link</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>Open in New Tab</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("invite-members", item)}>
          <UserPlusIcon />
          <span>Invite Members</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("manage-members", item)}>
          <UsersIcon />
          <span>Manage Members</span>
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
  onSelectEntry,
}: {
  onSelectEntry: (entryId: string) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <SidebarGroup className="pt-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path.split("?")[0]

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  isActive={isActive}
                  tooltip={item.title}
                  onClick={() => {
                    onSelectEntry(item.id)
                    navigate(item.path)
                  }}
                >
                  <Icon className="text-sidebar-foreground/70" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
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
    <SidebarGroup className="gap-2">
      <div className="flex h-8 items-center gap-1 px-2">
        <SidebarGroupLabel className="h-auto min-w-0 flex-1 px-0 py-1 text-sm font-normal tracking-[0.12em] text-sidebar-foreground/50">
          {title}
        </SidebarGroupLabel>
        {actionMenu}
        {canCreate && createMode === "team" ? (
          <button
            type="button"
            aria-label={`Create ${title}`}
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
                aria-label={`Create in ${title}`}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/65 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PlusIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={() => onCreate("file")}>
                <FilePlusIcon />
                <span>New File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("folder")}>
                <FolderPlusIcon />
                <span>New Folder</span>
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
              <div className="px-2 py-1.5 text-sm text-sidebar-foreground/45">
                {isLoading ? "Loading..." : error || emptyLabel || "Empty"}
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
        <DropdownMenuItem>
          <PackageIcon />
          <span>Integrations</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <SettingsIcon />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <SparklesIcon />
            <span>Upgrade to Pro</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/account">
              <BadgeCheckIcon />
              <span>Account</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/billing">
              <CreditCardIcon />
              <span>Billing</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/notifications">
              <BellIcon />
              <span>Notifications</span>
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
            <span>Sign out</span>
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
      setTreeError(failed ? "Failed to load files" : null)
      setIsTreeLoading(false)
    },
    [accessToken, workspaces]
  )

  React.useEffect(() => {
    if (!accessToken || !workspaces.length) {
      setWorkspaceTrees({})
      setTreeError(null)
      setIsTreeLoading(false)
      return
    }

    let cancelled = false

    void refreshWorkspaceTrees().then(() => {
      if (cancelled) {
        return
      }
    })

    return () => {
      cancelled = true
    }
  }, [accessToken, refreshWorkspaceTrees, workspaces])

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
  }, [accessToken, workspaces])

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
        window.alert("No workspace available.")
        return null
      }

      if (sectionWorkspaces.length === 1) {
        return sectionWorkspaces[0]
      }

      const input = window.prompt(
        `Workspace name:\n${sectionWorkspaces.map((workspace) => workspace.name).join("\n")}`,
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

      const name = window.prompt(kind === "file" ? "File name" : "Folder name")
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
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Create failed")
      }
    },
    [accessToken, navigate, refreshWorkspaceTrees]
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
          return
        }

        if (action === "rename") {
          const name = window.prompt("Rename", item.object.name)
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
          return
        }

        if (action === "move") {
          const targetPath = window.prompt(
            "Move to folder path. Leave blank for workspace root.",
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
            window.alert("Target folder not found.")
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
          return
        }

        if (action === "delete") {
          const confirmed = window.confirm(`Delete "${item.object.name}"?`)
          if (!confirmed) {
            return
          }

          await deleteWorkspaceObject(accessToken, item.workspaceId, item.object.id)
          setSelectedEntryId(item.workspaceId)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Action failed")
      }
    },
    [
      accessToken,
      createObject,
      duplicateObject,
      refreshWorkspaceTrees,
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
          window.alert("No team space available.")
          return
        }
        void navigator.clipboard?.writeText(
          `${window.location.origin}?workspace=${selectedTeam.id}`
        )
        return
      }

      if (action === "open-new-tab") {
        if (!selectedTeam) {
          window.alert("No team space available.")
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

      window.alert("Team Space actions are coming next.")
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
              <Link to={defaultPath} className="flex w-full justify-center">
                <IneffableLogo variant={logoVariant} className="h-8 max-w-[132px] w-auto" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-0">
        <PrimaryNav
          onSelectEntry={setSelectedEntryId}
        />
        <SidebarSeparator />
        <SpaceSection
          title="Team Spaces"
          entries={teamSpaceEntries}
          emptyLabel="No team spaces"
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
          title="Personal Space"
          entries={personalSpaceEntries}
          emptyLabel="No files"
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
                name: currentUser?.display_name || currentUser?.email || "Workspace User",
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
