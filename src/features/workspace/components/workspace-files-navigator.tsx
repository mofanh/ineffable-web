import { useWorkspaceLifecycle } from "../hooks/use-workspace-lifecycle"
import { useActionScope } from "@/lib/app/use-action-scope"
import { referenceMarkdown } from "@/lib/workspace-file-reference"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"

import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useWorkspaceAccess } from "@/features/workspace/hooks/use-workspace-access"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  useAuthSession,
  useWorkspaceSession,
} from "@/features/auth/app-session"
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceObject,
  getWorkspaceObjectContent,
  renameMoveWorkspaceObject,
  type Workspace,
  type WorkspaceObject,
} from "@/features/workspace/api/workspace-api"
import { statWorkspacePath } from "@/features/workspace/api/workspace-api"
import { listWorkspaceDirectoryDeduped } from "@/features/workspace/api/workspace-resource-api"
import { downloadWorkspaceFile } from "@/features/workspace/api/workspace-download"
import { workspaceFileCapabilities } from "@/features/workspace/model/file-capabilities"
import { downloadBlob, downloadTextFile } from "@/features/workspace/model/download"
import {
  buildWorkspaceEntries,
  getCopyName,
  getUniqueName,
  getWorkspaceType,
  type SidebarEntry,
  type WorkspaceTreeMap,
} from "@/features/workspace/model/workspace-tree"
import {
  dispatchWorkspaceObjectsChanged,
  WORKSPACE_OBJECTS_CHANGED_EVENT,
  type WorkspaceObjectsChangedEvent,
} from "@/lib/workspace-events"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import {
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
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

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
  | "copy-reference"
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
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { access } = useWorkspaceAccess(item.workspaceId, open)
  const canWrite = access?.can_write === true

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          aria-label={t("sidebar.actions.itemActions", { name: item.title })}
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          <MoreHorizontalIcon />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-56">
        {item.object?.kind === "file" && <DropdownMenuItem disabled={!item.object.current_version_id} onClick={() => onAction("copy-reference", item)}>
          <LinkIcon /><span>{t("fileReferences.copy")}</span>
        </DropdownMenuItem>}
        <DropdownMenuItem onClick={() => onAction("copy-link", item)}>
          <LinkIcon />
          <span>{t("sidebar.actions.copyLink")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>{t("sidebar.actions.openNewTab")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {canWrite && item.kind === "folder" ? (
          <>
            <DropdownMenuItem onClick={() => onAction("new-file", item)}>
              <FilePlusIcon />
              <span>{t("sidebar.actions.newFile")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("new-folder", item)}>
              <FolderPlusIcon />
              <span>{t("sidebar.actions.newFolder")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {canWrite && !item.isWorkspaceRoot && item.object && workspaceFileCapabilities(item.object).duplicate ? (
          <DropdownMenuItem onClick={() => onAction("duplicate", item)}>
            <CopyIcon />
            <span>{t("sidebar.actions.duplicate")}</span>
          </DropdownMenuItem>
        ) : null}
        {canWrite && !item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("rename", item)}>
            <PencilIcon />
            <span>{t("sidebar.actions.rename")}</span>
          </DropdownMenuItem>
        ) : null}
        {canWrite && !item.isWorkspaceRoot ? (
          <DropdownMenuItem onClick={() => onAction("move", item)}>
            <FolderInputIcon />
            <span>{t("sidebar.actions.move")}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => onAction("export", item)}>
          <DownloadIcon />
          <span>{t("sidebar.actions.export")}</span>
        </DropdownMenuItem>
        {canWrite && !item.isWorkspaceRoot ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onAction("delete", item)}
            >
              <Trash2Icon />
              <span>{t("sidebar.actions.delete")}</span>
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
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { run, pending } = useWorkspaceLifecycle()
  const resource = useWorkspaceAccess(item.workspaceId, open)
  const access = resource.access
  const lastOwner = access?.last_owner


  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          aria-label={t("sidebar.actions.itemActions", { name: item.title })}
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
          <span>{t("sidebar.actions.copyLink")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("open-new-tab", item)}>
          <ExternalLinkIcon />
          <span>{t("sidebar.actions.openNewTab")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {access?.can_manage_members && <DropdownMenuItem onClick={() => onAction("invite-members", item)}>
          <UserPlusIcon />
          <span>{t("sidebar.actions.inviteMembers")}</span>
        </DropdownMenuItem>}
        <DropdownMenuItem onClick={() => onAction("manage-members", item)}>
          <UsersIcon />
          <span>{t("sidebar.actions.manageMembers")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {resource.error && <DropdownMenuItem onSelect={event => { event.preventDefault(); void resource.reload() }}>{t("common.retry")}</DropdownMenuItem>}
        {access?.can_archive && <DropdownMenuItem disabled={pending} onClick={() => void run(item.workspaceId!, item.title, "archive")}><Trash2Icon /><span>{t("workspaceLifecycle.archive")}</span></DropdownMenuItem>}
        <DropdownMenuItem disabled={pending || !access?.can_leave} title={lastOwner ? t("workspaceLifecycle.lastOwner") : undefined} onClick={() => void run(item.workspaceId!, item.title, "leave")}><span>{lastOwner ? t("workspaceLifecycle.transferFirst") : t("workspaceLifecycle.leave")}</span></DropdownMenuItem>
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
  const { t } = useTranslation()
  const depthClass =
    item.depth === 2 ? "pl-12" : item.depth === 1 ? "pl-7" : undefined

  return (
    <ContextMenu><ContextMenuTrigger asChild disabled={item.object?.kind !== "file"}>
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
        <span>{item.more ? t("common.loadMore") : item.title}</span>
      </SidebarMenuButton>
      {item.isWorkspaceRoot && item.accent === "team" && onTeamAction ? (
        <TeamWorkspaceMenu item={item} onAction={onTeamAction} />
      ) : item.workspaceId && !item.more ? (
        <WorkspaceObjectMenu item={item} onAction={onAction} />
      ) : null}
    </SidebarMenuItem></ContextMenuTrigger>
    {item.object?.kind === "file" && <ContextMenuContent>
      <ContextMenuItem disabled={!item.object.current_version_id} onSelect={() => onAction("copy-reference", item)}>{t("fileReferences.copy")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction("copy-link", item)}>{t("sidebar.actions.copyLink")}</ContextMenuItem>
    </ContextMenuContent>}
    </ContextMenu>
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
  emptyLabel?: string | null
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
  const { t } = useTranslation()

  return (
    <SidebarGroup className="gap-1.5 py-2">
      <div className="flex h-8 items-center gap-1 px-2">
        <SidebarGroupLabel className="h-auto min-w-0 flex-1 px-0 py-1 text-xs font-semibold tracking-normal text-sidebar-foreground/55">
          {createMode === "team" ? <Link to="/team-spaces" className="hover:text-sidebar-foreground">{title}</Link> : title}
        </SidebarGroupLabel>
        {actionMenu}
        {canCreate && createMode === "team" ? (
          <button
            type="button"
            aria-label={t("sidebar.sections.create", { section: title })}
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
                aria-label={t("sidebar.sections.createInside", { section: title })}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/65 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PlusIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={() => onCreate("file")}>
                <FilePlusIcon />
                <span>{t("sidebar.actions.newFile")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreate("folder")}>
                <FolderPlusIcon />
                <span>{t("sidebar.actions.newFolder")}</span>
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
          ) : isLoading || error || emptyLabel !== null ? (
            <SidebarMenuItem>
              <div className="mx-2 rounded-lg border border-dashed border-sidebar-border px-3 py-3 text-xs leading-5 text-sidebar-foreground/45">
                {isLoading
                  ? t("sidebar.sections.loading")
                  : error || emptyLabel || t("sidebar.sections.empty")}
              </div>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function WorkspaceFilesNavigator({ workspace, canWrite }: { workspace: Workspace; canWrite: boolean }) {
  const { t } = useTranslation()
  const { accessToken, currentSessionId, currentUser } = useAuthSession()
  const { currentWorkspace } = useWorkspaceSession()
  // The route's authorized access result also covers archived/deep-linked roots
  // absent from the active-workspace navigation snapshot.
  const workspaces = React.useMemo(() => [workspace], [workspace])
  const location = useLocation()
  const navigate = useNavigate()
  const captureActionScope = useActionScope(`${currentSessionId}:${location.key}`)
  const [selectedEntryId, setSelectedEntryId] = React.useState("")
  const [workspaceTrees, setWorkspaceTrees] = React.useState<WorkspaceTreeMap>({})
  const [directoryPages, setDirectoryPages] = React.useState<Record<string, Record<string, string | null>>>({})
  const directoryGeneration = React.useRef(0)
  const directoryScope = `${currentSessionId}:${currentUser?.id ?? ""}:${workspaces.map(w => w.id).join(",")}`
  const directoryScopeRef = React.useRef(directoryScope)
  directoryScopeRef.current = directoryScope

  const [collapsedEntryIds, setCollapsedEntryIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [isTreeLoading, setIsTreeLoading] = React.useState(false)
  const [treeError, setTreeError] = React.useState<string | null>(null)
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

  React.useEffect(() => {
    const match = location.pathname.match(/^\/workspace\/[^/]+\/objects\/([^/]+)/)
    if (match?.[1]) {
      setSelectedEntryId(decodeURIComponent(match[1]))
    } else setSelectedEntryId("")
  }, [location.pathname])

  const refreshWorkspaceTrees = React.useCallback(
    async (options?: { workspaceIds?: string[]; showLoading?: boolean }) => {
      const isCurrent = captureActionScope()
      if (!isCurrent()) return
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

      const generation = ++directoryGeneration.current
      const scope = directoryScopeRef.current
      const results = await Promise.allSettled(
        targetWorkspaces.map(async (workspace) => {
          const tree = await listWorkspaceDirectoryDeduped(accessToken, workspace.id)
          return [workspace.id, tree] as const
        })
      )

      if (!isCurrent() || generation !== directoryGeneration.current || scope !== directoryScopeRef.current) return
      const nextPages: Record<string, Record<string, string | null>> = {}
      const collapsed = new Set<string>()
      const nextTrees: WorkspaceTreeMap = {}
      let failed = false

      for (const result of results) {
        if (result.status === "fulfilled") {
          const [workspaceId, page] = result.value
          nextTrees[workspaceId] = page.objects
          nextPages[workspaceId] = { "": page.next_cursor }
          page.objects.filter(o => o.kind === "folder").forEach(o => collapsed.add(o.id))
        } else {
          failed = true
        }
      }

      setDirectoryPages(current => workspaceIds ? { ...current, ...nextPages } : nextPages)
      setCollapsedEntryIds(current => new Set([...current, ...collapsed]))
      setWorkspaceTrees((current) =>
        workspaceIds ? { ...current, ...nextTrees } : nextTrees
      )
      setTreeError(failed ? t("workspace.sidebarFeedback.treeFailed") : null)
      setIsTreeLoading(false)
    },
    [accessToken, captureActionScope, t, workspaces]
  )

  React.useEffect(() => {
    // Every effect lifetime needs a current observer, including StrictMode's
    // setup/cleanup/setup. The shared API coalesces in-flight reads; generation
    // and action scope, not a loaded-key latch, fence stale observers.
    void refreshWorkspaceTrees()
  }, [directoryScope, refreshWorkspaceTrees])

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
          pages: directoryPages[workspace.id],
        })
      ),
    [collapsedEntryIds, directoryPages, teamWorkspaces, workspaceTrees]
  )

  const personalSpaceEntries = React.useMemo(
    () =>
      personalWorkspaces.flatMap((workspace) =>
        buildWorkspaceEntries(workspace, workspaceTrees[workspace.id] ?? [], {
          includeRoot: personalWorkspaces.length > 1,
          collapsedEntryIds,
          pages: directoryPages[workspace.id],
        })
      ),
    [collapsedEntryIds, directoryPages, personalWorkspaces, workspaceTrees]
  )

  const getSectionWorkspace = React.useCallback(
    (sectionWorkspaces: Workspace[]) => {
      if (!sectionWorkspaces.length) {
        notify.warning({ title: t("workspace.sidebarFeedback.noWorkspace") })
        return null
      }

      if (sectionWorkspaces.length === 1) {
        return sectionWorkspaces[0]
      }

      const input = window.prompt(
        t("workspace.sidebarFeedback.chooseWorkspace", {
          names: sectionWorkspaces.map((workspace) => workspace.name).join("\n"),
        }),
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
    [t]
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
      const isCurrent = captureActionScope()
      const name = window.prompt(
        kind === "file"
          ? t("workspace.sidebarFeedback.fileName")
          : t("workspace.sidebarFeedback.folderName")
      )
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

        if (isCurrent()) setSelectedEntryId(response.object.id)
        if (isCurrent() && response.object.kind === "file") {
          void navigate(`/workspace/${workspace.id}/objects/${response.object.id}`)
        }
        void refreshWorkspaceTrees({
          workspaceIds: [workspace.id],
          showLoading: false,
        })
        if (!isCurrent()) return
        notify.success({
          title:
            kind === "file"
              ? t("workspace.sidebarFeedback.fileCreated")
              : t("workspace.sidebarFeedback.folderCreated"),
          description: response.object.name,
        })
      } catch (error) {
        if (!isCurrent()) return
        reportActionError(
          error,
          t("workspace.sidebarFeedback.createFailed"),
          t("workspace.sidebarFeedback.createFailedTitle")
        )
      }
    },
    [accessToken, captureActionScope, navigate, refreshWorkspaceTrees, reportActionError, t]
  )

  const duplicateObject = React.useCallback(
    async (item: SidebarEntry) => {
      if (!accessToken || !item.object || !item.workspaceId) {
        return
      }

      const isCurrent = captureActionScope()
      const source = item.object
      const scope = directoryScopeRef.current
      const objects: WorkspaceObject[] = []
      const parentPath = source.path.split("/").slice(0, -1).join("/")
      let cursor: string | undefined
      do {
        const page = await listWorkspaceDirectoryDeduped(accessToken, item.workspaceId, parentPath, cursor)
        if (!isCurrent() || scope !== directoryScopeRef.current) return
        objects.push(...page.objects)
        cursor = page.next_cursor ?? undefined
      } while (cursor)
      const preferredName = getUniqueName(
        objects,
        source.parent_id,
        getCopyName(source.name)
      )

      // Validate and read the complete bounded text tree before any create.
      // Unsupported binary descendants cannot leave a half-created directory.
      type CopyNode = { object: WorkspaceObject; content?: string; children: CopyNode[] }
      let count = 0, bytes = 0, createdCount = 0
      const readNode = async (object: WorkspaceObject): Promise<CopyNode> => {
        if (!isCurrent() || scope !== directoryScopeRef.current) throw new Error(t("workspace.sidebarFeedback.copyInterrupted"))
        if (++count > 2000) throw new Error(t("workspace.sidebarFeedback.copyBudget"))
        const node: CopyNode = { object, children: [] }
        if (object.kind === "file") {
          if (!workspaceFileCapabilities(object).text) throw new Error(t("workspace.sidebarFeedback.copyUnsupported", { name: object.name }))
          const response = await getWorkspaceObjectContent(accessToken, item.workspaceId!, object.id)
          bytes += new TextEncoder().encode(response.content).byteLength
          if (bytes > 16 * 1024 * 1024) throw new Error(t("workspace.sidebarFeedback.copyBudget"))
          node.content = response.content
        } else {
          let cursor: string | undefined
          const seen = new Set<string>()
          do {
            const page = await listWorkspaceDirectoryDeduped(accessToken, item.workspaceId!, object.path, cursor)
            if (!isCurrent() || scope !== directoryScopeRef.current) throw new Error(t("workspace.sidebarFeedback.copyInterrupted"))
            for (const child of page.objects) node.children.push(await readNode(child))
            cursor = page.next_cursor ?? undefined
            if (cursor && seen.has(cursor)) throw new Error(t("workspace.sidebarFeedback.copyBudget"))
            if (cursor) seen.add(cursor)
          } while (cursor)
        }
        return node
      }
      const snapshot = await readNode(source)
      const createNode = async (node: CopyNode, parentId: string | null, name: string): Promise<string> => {
        if (!isCurrent() || scope !== directoryScopeRef.current) throw new Error(t("workspace.sidebarFeedback.copyInterrupted"))
        const response = node.object.kind === "file"
          ? await createWorkspaceFile(accessToken, item.workspaceId!, { name, parent_id: parentId, content: node.content!, mime_type: node.object.mime_type || "text/plain" })
          : await createWorkspaceFolder(accessToken, item.workspaceId!, { name, parent_id: parentId })
        createdCount += 1
        for (const child of node.children) await createNode(child, response.object.id, child.object.name)
        return response.object.id
      }
      try {
        const id = await createNode(snapshot, source.parent_id ?? null, preferredName)
        if (isCurrent() && scope === directoryScopeRef.current) setSelectedEntryId(id)
      } catch (error) {
        if (createdCount) {
          dispatchWorkspaceObjectsChanged({ workspaceId: item.workspaceId, action: "create_file", source: "user" })
          throw new Error(t("workspace.sidebarFeedback.copyPartial", { count: createdCount, name: preferredName }), { cause: error })
        }
        throw error
      }
    },
    [accessToken, captureActionScope, t]
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
      const isCurrent = captureActionScope()

      try {
        if (action === "copy-reference") {
          if (!item.object?.current_version_id || !navigator.clipboard) throw new Error(t("fileReferences.copyFailed"))
          const text = referenceMarkdown({ workspaceId: workspace.id, objectId: item.object.id, versionId: item.object.current_version_id, label: `${workspace.name}/${item.object.path}` }, window.location.origin)
          await navigator.clipboard.writeText(text)
          if (!isCurrent()) return
          notify.success({ title: t("fileReferences.copied") })
          return
        }
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
            : `${window.location.origin}/workspace/${item.workspaceId}/objects?${new URLSearchParams({ path: item.object?.path ?? "" })}`
        if (action === "copy-link") {
          await navigator.clipboard?.writeText(url)
          if (!isCurrent()) return
          notify.info({ title: t("workspace.sidebarFeedback.linkCopied") })
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
            notify.info({ title: t("workspace.sidebarFeedback.workspaceExported") })
            return
          }

          if (item.object.kind === "file") {
            const blob = await downloadWorkspaceFile(accessToken, item.workspaceId, item.object.id)
            if (!isCurrent()) return
            downloadBlob(item.object.name, blob)
            notify.info({ title: t("workspace.sidebarFeedback.fileExported") })
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
          notify.info({ title: t("workspace.sidebarFeedback.folderExported") })
          return
        }

        if (!item.object) {
          return
        }

        if (action === "duplicate") {
          await duplicateObject(item)
          if (!isCurrent()) return
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          if (!isCurrent()) return
          notify.success({ title: t("workspace.sidebarFeedback.copyCreated") })
          return
        }

        if (action === "rename") {
          const name = window.prompt(
            t("workspace.sidebarFeedback.renamePrompt"),
            item.object.name
          )
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
          if (isCurrent()) setSelectedEntryId(response.object.id)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          if (!isCurrent()) return
          notify.success({
            title: t("workspace.sidebarFeedback.renamed"),
            description: response.object.name,
          })
          return
        }

        if (action === "move") {
          const targetPath = window.prompt(
            t("workspace.sidebarFeedback.movePrompt"),
            ""
          )
          if (targetPath === null) {
            return
          }

          const normalizedPath = targetPath.trim().replace(/^\/+|\/+$/g, "")
          const targetFolder = normalizedPath
            ? (await statWorkspacePath(accessToken, item.workspaceId, normalizedPath)).object : null
          if (!isCurrent()) return
          if (normalizedPath && targetFolder?.kind !== "folder") {
            notify.error({
              title: t("workspace.sidebarFeedback.moveFailed"),
              description: t("workspace.sidebarFeedback.folderNotFound"),
            })
            return
          }

          const response = await renameMoveWorkspaceObject(
            accessToken,
            item.workspaceId,
            item.object.id,
            { parent_id: targetFolder?.id ?? null }
          )
          if (isCurrent()) setSelectedEntryId(response.object.id)
          await refreshWorkspaceTrees({
            workspaceIds: [item.workspaceId],
            showLoading: false,
          })
          if (!isCurrent()) return
          notify.success({
            title: t("workspace.sidebarFeedback.moved"),
            description: response.object.path,
          })
          return
        }

        if (action === "delete") {
          const confirmed = await confirm({
            title: t("workspace.sidebarFeedback.deleteTitle", {
              name: item.object.name,
            }),
            description: t("workspace.sidebarFeedback.deleteDescription"),
            confirmLabel: t("workspace.feedback.delete"),
            variant: "destructive",
          })
          if (!confirmed || !isCurrent()) {
            return
          }

          await deleteWorkspaceObject(accessToken, item.workspaceId, item.object.id)
          dispatchWorkspaceObjectsChanged({
            workspaceId: item.workspaceId,
            objectId: item.object.id,
            path: item.object.path,
            action: "delete",
            source: "user",
          })
          if (!isCurrent()) return
          notify.success({ title: t("workspace.sidebarFeedback.deleted") })
        }
      } catch (error) {
        if (!isCurrent()) return
        reportActionError(
          error,
          t("workspace.sidebarFeedback.actionFailed"),
          t("workspace.sidebarFeedback.actionFailedTitle")
        )
      }
    },
    [
      accessToken,
      captureActionScope,
      createObject,
      duplicateObject,
      refreshWorkspaceTrees,
      reportActionError,
      t,
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
          notify.warning({ title: t("workspace.sidebarFeedback.noTeamSpace") })
          return
        }
        void navigator.clipboard?.writeText(
          `${window.location.origin}/workspace/${selectedTeam.id}/objects`
        )
        notify.info({ title: t("workspace.sidebarFeedback.teamLinkCopied") })
        return
      }

      if (action === "open-new-tab") {
        if (!selectedTeam) {
          notify.warning({ title: t("workspace.sidebarFeedback.noTeamSpace") })
          return
        }
        window.open(
          `${window.location.origin}/workspace/${selectedTeam.id}/objects`,
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

      notify.info({ title: t("workspace.sidebarFeedback.unavailable") })
    },
    [currentWorkspace, navigate, t, teamWorkspaces]
  )

  const handleTeamWorkspaceAction = React.useCallback(
    (action: TeamWorkspaceAction, item: SidebarEntry) => {
      handleTeamSpaceAction(action, item.workspaceId)
    },
    [handleTeamSpaceAction]
  )

  const loadDirectory = React.useCallback(async (workspaceId: string, path: string, parentId: string | null, cursor?: string) => {
    if (!accessToken) return
    const isCurrent = captureActionScope()
    const scope = directoryScopeRef.current
    const generation = directoryGeneration.current
    try {
      const page = await listWorkspaceDirectoryDeduped(accessToken, workspaceId, path, cursor)
      if (!isCurrent() || scope !== directoryScopeRef.current || generation !== directoryGeneration.current) return
      setWorkspaceTrees(current => {
        const retained = (current[workspaceId] ?? []).filter(object => cursor || object.parent_id !== parentId)
        const objects = new Map(retained.map(object => [object.id, object]))
        page.objects.forEach(object => objects.set(object.id, object))
        return { ...current, [workspaceId]: [...objects.values()] }
      })
      setDirectoryPages(current => ({ ...current, [workspaceId]: { ...current[workspaceId], [path]: page.next_cursor } }))
      setCollapsedEntryIds(current => new Set([...current, ...page.objects.filter(o => o.kind === "folder").map(o => o.id)]))
    } catch (error) {
      if (isCurrent() && scope === directoryScopeRef.current && generation === directoryGeneration.current) reportActionError(error, t("workspace.sidebarFeedback.treeFailed"), t("workspace.sidebarFeedback.treeFailed"))
    }
  }, [accessToken, captureActionScope, reportActionError, t])

  const openEntry = React.useCallback(
    (item: SidebarEntry) => {
      if (item.more && item.workspaceId) {
        const parentId = workspaceTrees[item.workspaceId]?.find(o => o.path === item.more?.path)?.id ?? null
        void loadDirectory(item.workspaceId, item.more.path, parentId, item.more.cursor)
        return
      }
      if (item.kind === "folder") {
        if (collapsedEntryIds.has(item.id) && item.workspaceId) {
          void loadDirectory(item.workspaceId, item.object?.path ?? "", item.object?.id ?? null)
        }
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
    [navigate, collapsedEntryIds, loadDirectory, workspaceTrees]
  )

  return <div data-slot="workspace-files-navigation" className="min-w-0 py-2">
    <SpaceSection
      title={workspaces[0]?.name ?? ""}
      entries={teamWorkspaces.length ? teamSpaceEntries : personalSpaceEntries}
      emptyLabel={t("sidebar.sections.emptyPersonal")}
      isLoading={isTreeLoading}
      error={treeError}
      canCreate={canWrite}
      selectedEntryId={selectedEntryId}
      onSelectEntry={setSelectedEntryId}
      onOpenEntry={openEntry}
      onCreate={kind => { const workspace = getSectionWorkspace(workspaces); if (workspace) void createObject({ workspace, kind }) }}
      onAction={handleObjectAction}
      onTeamAction={handleTeamWorkspaceAction}
    />
  </div>
}
