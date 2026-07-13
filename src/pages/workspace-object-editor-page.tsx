import * as React from "react"
import MarkdownIt from "markdown-it"
import {
  CopyIcon,
  CopyPlusIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FilePenIcon,
  FolderInputIcon,
  HistoryIcon,
  Maximize2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"

import { useAppHeader } from "@/app/shell/app-header-context"
import { AppDialog } from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { useAppSession } from "@/features/auth/app-session"
import {
  createWorkspaceFile,
  deleteWorkspaceObject,
  getWorkspaceObjectContent,
  getWorkspaceObjectVersionContent,
  listWorkspaceObjectVersions,
  listWorkspaceTree,
  renameMoveWorkspaceObject,
  restoreWorkspaceObjectVersion,
  updateWorkspaceObjectContent,
  type WorkspaceObject,
  type WorkspaceObjectVersion,
} from "@/features/workspace/api/workspace-api"
import { downloadTextFile } from "@/features/workspace/model/download"
import { getCopyName, getUniqueName, getWorkspaceType } from "@/features/workspace/model/workspace-tree"
import {
  dispatchWorkspaceObjectsChanged,
  WORKSPACE_OBJECTS_CHANGED_EVENT,
  type WorkspaceObjectsChangedEvent,
} from "@/lib/workspace-events"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { cn } from "@/lib/utils"
import { defaultPath } from "@/routes/navigation"

const markdownIt = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

const WorkspaceCodeEditor = React.lazy(async () => ({
  default: (
    await import("@/features/workspace/components/workspace-code-editor")
  ).WorkspaceCodeEditor,
}))

const DOCUMENT_CLASS =
  "mx-auto w-full max-w-4xl px-6 py-12 text-foreground md:px-10 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:mb-6 [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-3 [&_p]:text-base [&_p]:leading-7 [&_ul]:my-4 [&_ol]:my-4 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:my-2 [&_li]:text-base [&_li]:leading-7 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-4 [&_pre]:text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-4"

function getFileKind(object: WorkspaceObject | null) {
  const name = object?.name.toLowerCase() ?? ""
  const mimeType = object?.mime_type?.toLowerCase() ?? ""

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return "markdown"
  }
  if (name.endsWith(".html") || name.endsWith(".htm") || mimeType.includes("html")) {
    return "html"
  }
  if (name.endsWith(".json") || mimeType.includes("json")) {
    return "json"
  }

  return "text"
}

function formatRelativeEditedAt(value: string | undefined, now: number) {
  if (!value) {
    return "刚刚更新"
  }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return "刚刚更新"
  }

  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (diffSeconds < 60) {
    return "刚刚更新"
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前更新`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前更新`
  }

  if (diffHours < 48) {
    return "昨天更新"
  }

  return `${new Date(timestamp).toLocaleDateString("zh-CN")} 更新`
}

function getActorInitial(actorId: string | undefined, fallback = "U") {
  const trimmed = actorId?.trim()
  if (!trimmed) {
    return fallback
  }

  return trimmed.slice(0, 1).toUpperCase()
}

function getWorkspaceLabel(workspace: ReturnType<typeof useAppSession>["workspaces"][number] | undefined) {
  if (!workspace) {
    return "工作区"
  }

  return getWorkspaceType(workspace) === "personal" ? "个人空间" : workspace.name
}

function FilePreview({
  object,
  content,
  compact,
}: {
  object: WorkspaceObject | null
  content: string
  compact: boolean
}) {
  const fileKind = getFileKind(object)
  const renderedMarkdown = React.useMemo(() => markdownIt.render(content), [content])

  if (fileKind === "markdown") {
    return (
      <article
        className={cn(
          DOCUMENT_CLASS,
          compact && "max-w-3xl py-8 [&_h1]:mb-5 [&_h1]:text-3xl [&_li]:my-1.5 [&_li]:text-sm [&_li]:leading-6"
        )}
        dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
      />
    )
  }

  if (fileKind === "html") {
    return (
      <div className="h-full min-h-[560px] p-4">
        <iframe
          title={object?.name ?? "HTML 预览"}
          srcDoc={content}
          sandbox=""
          className="h-full min-h-[560px] w-full rounded-lg border bg-white"
        />
      </div>
    )
  }

  const displayContent =
    fileKind === "json"
      ? (() => {
          try {
            return JSON.stringify(JSON.parse(content), null, 2)
          } catch {
            return content
          }
        })()
      : content

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <pre className="min-h-[420px] overflow-auto rounded-lg border bg-muted/30 p-5 font-mono text-sm leading-6 text-foreground">
        {displayContent || "这个文件还是空的。点击右上角编辑按钮开始写入内容。"}
      </pre>
    </div>
  )
}

function HistoryModal({
  open,
  object,
  version,
  versions,
  previewVersion,
  previewContent,
  isPreviewLoading,
  onClose,
  onPreview,
  onRestore,
}: {
  open: boolean
  object: WorkspaceObject | null
  version: WorkspaceObjectVersion | null
  versions: WorkspaceObjectVersion[]
  previewVersion: WorkspaceObjectVersion | null
  previewContent: string | null
  isPreviewLoading: boolean
  onClose: () => void
  onPreview: (targetVersion: WorkspaceObjectVersion) => void
  onRestore: (targetVersion: WorkspaceObjectVersion) => void
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      title={object?.path || object?.name || "版本历史"}
      description="查看每次保存的内容，并可将历史版本恢复为最新版本。"
      maxWidth="6xl"
    >
      <div className="grid h-[min(720px,calc(85vh-6rem))] min-h-0 grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-h-0 overflow-auto border-b bg-muted/20 p-3 md:border-b-0 md:border-r">
          {versions.length ? (
            <div className="space-y-2">
              {versions.map((item) => {
                const isCurrent = version?.id === item.id
                const isPreview = previewVersion?.id === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPreview(item)}
                    className={cn(
                      "w-full rounded-lg border bg-background p-3 text-left text-sm transition-colors hover:bg-muted",
                      isPreview && "border-primary/50",
                      isCurrent && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">v{item.version_no}</span>
                      {isCurrent ? <Badge variant="outline">当前版本</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("zh-CN")}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {item.created_by_actor_type}:{item.created_by_actor_id}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无保存记录</div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="text-sm font-medium">
              {previewVersion ? `正在预览 v${previewVersion.version_no}` : "选择左侧版本查看内容"}
            </div>
            {previewVersion && previewVersion.id !== version?.id ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onRestore(previewVersion)}>
                <RotateCcwIcon />
                恢复此版本
              </Button>
            ) : null}
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6 text-muted-foreground">
            {isPreviewLoading ? "正在加载版本内容…" : (previewContent ?? "")}
          </pre>
        </div>
      </div>
    </AppDialog>
  )
}

export function WorkspaceObjectEditorPage() {
  const { workspaceId, objectId } = useParams()
  const navigate = useNavigate()
  const { setHeaderContent } = useAppHeader()
  const { accessToken, currentUser, workspaces } = useAppSession()
  const [object, setObject] = React.useState<WorkspaceObject | null>(null)
  const [workspaceObjects, setWorkspaceObjects] = React.useState<WorkspaceObject[]>([])
  const [version, setVersion] = React.useState<WorkspaceObjectVersion | null>(null)
  const [content, setContent] = React.useState("")
  const [savedContent, setSavedContent] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<"idle" | "saved" | "conflict">("idle")
  const [versions, setVersions] = React.useState<WorkspaceObjectVersion[]>([])
  const [previewVersion, setPreviewVersion] = React.useState<WorkspaceObjectVersion | null>(null)
  const [previewContent, setPreviewContent] = React.useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [isFullWidth, setIsFullWidth] = React.useState(false)
  const [isCompact, setIsCompact] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const ignoredWorkspaceEventKeysRef = React.useRef(new Set<string>())

  const workspace = workspaces.find((candidate) => candidate.id === workspaceId)
  const isDirty = content !== savedContent
  const breadcrumbParts = React.useMemo(() => {
    const pathParts = (object?.path || object?.name || "文件").split("/").filter(Boolean)

    return [getWorkspaceLabel(workspace), ...pathParts]
  }, [object?.name, object?.path, workspace])
  const statusLabel = isSaving
    ? "正在保存…"
    : isDirty
      ? "有未保存修改"
      : saveState === "saved"
        ? "刚刚已保存"
        : formatRelativeEditedAt(object?.updated_at, now)

  const reportActionError = React.useCallback((caught: unknown, fallbackMessage: string, title: string) => {
    const appError = normalizeAppError(caught, { fallbackMessage })
    setError(appError.message)
    notify.error({
      title,
      description: appError.message,
    })
    return appError.message
  }, [])

  const loadVersions = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId) {
      return
    }

    const response = await listWorkspaceObjectVersions(accessToken, workspaceId, objectId)
    setVersions(response.versions)
  }, [accessToken, objectId, workspaceId])

  const loadWorkspaceTree = React.useCallback(async () => {
    if (!accessToken || !workspaceId) {
      return
    }

    const response = await listWorkspaceTree(accessToken, workspaceId)
    setWorkspaceObjects(response.objects)
  }, [accessToken, workspaceId])

  const loadContent = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId) {
      return
    }

    setIsLoading(true)
    setError(null)
    setSaveState("idle")

    try {
      const [contentResponse] = await Promise.all([
        getWorkspaceObjectContent(accessToken, workspaceId, objectId),
        loadWorkspaceTree(),
      ])
      setObject(contentResponse.object)
      setVersion(contentResponse.version)
      setContent(contentResponse.content)
      setSavedContent(contentResponse.content)
      setPreviewVersion(null)
      setPreviewContent(null)
      await loadVersions()
    } catch (loadError) {
      reportActionError(loadError, "文件加载失败，请稍后重试。", "文件加载失败")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, loadVersions, loadWorkspaceTree, objectId, reportActionError, workspaceId])

  React.useEffect(() => {
    void loadContent()
  }, [loadContent])

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  React.useEffect(() => {
    const handleWorkspaceObjectsChanged = (event: Event) => {
      const detail = (event as WorkspaceObjectsChangedEvent).detail
      if (!detail || detail.workspaceId !== workspaceId) {
        return
      }

      const eventKey = `${detail.action}:${detail.objectId ?? ""}:${detail.versionId ?? ""}`
      if (ignoredWorkspaceEventKeysRef.current.has(eventKey)) {
        ignoredWorkspaceEventKeysRef.current.delete(eventKey)
        return
      }

      if (detail.action === "rename_move" || detail.action === "delete") {
        void loadWorkspaceTree()
      }

      const affectsCurrentObject =
        detail.objectId === objectId || (Boolean(detail.path) && Boolean(object?.path) && detail.path === object?.path)
      if (!affectsCurrentObject) {
        return
      }

      if (detail.versionId && detail.versionId === version?.id) {
        return
      }

      if (isDirty) {
        setSaveState("conflict")
        setError("检测到更新版本。请重新加载后再保存，或将当前内容另存为新文件。")
        return
      }

      void loadContent()
    }

    window.addEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, handleWorkspaceObjectsChanged)
    return () => {
      window.removeEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, handleWorkspaceObjectsChanged)
    }
  }, [isDirty, loadContent, loadWorkspaceTree, object?.path, objectId, version?.id, workspaceId])

  const saveContent = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId || !object || !version || !isDirty) {
      return
    }

    setIsSaving(true)
    setError(null)
    setSaveState("idle")

    try {
      const response = await updateWorkspaceObjectContent(accessToken, workspaceId, objectId, {
        content,
        mime_type: object.mime_type || "text/plain",
        expected_version_id: version.id,
      })
      setObject(response.object)
      setVersion(response.version)
      setSavedContent(content)
      setSaveState("saved")
      setNow(Date.now())
      await loadVersions()
      ignoredWorkspaceEventKeysRef.current.add(`write_file:${objectId}:${response.version.id}`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId,
        path: response.object.path,
        action: "write_file",
        versionId: response.version.id,
        source: "user",
      })
    } catch (saveError) {
      const message = reportActionError(saveError, "保存失败，请稍后重试。", "保存失败")
      if (message.toLowerCase().includes("conflict")) {
        setSaveState("conflict")
      }
    } finally {
      setIsSaving(false)
    }
  }, [accessToken, content, isDirty, loadVersions, object, objectId, reportActionError, version, workspaceId])

  const previewHistoricalVersion = React.useCallback(
    async (targetVersion: WorkspaceObjectVersion) => {
      if (!accessToken || !workspaceId) {
        return
      }

      setIsPreviewLoading(true)
      setError(null)
      try {
        const response = await getWorkspaceObjectVersionContent(accessToken, workspaceId, targetVersion.id)
        setPreviewVersion(targetVersion)
        setPreviewContent(response.content)
      } catch (previewError) {
        reportActionError(previewError, "版本内容加载失败，请稍后重试。", "版本预览失败")
      } finally {
        setIsPreviewLoading(false)
      }
    },
    [accessToken, reportActionError, workspaceId]
  )

  const restoreHistoricalVersion = React.useCallback(
    async (targetVersion: WorkspaceObjectVersion) => {
      if (!accessToken || !workspaceId || !objectId || !version) {
        return
      }

      const confirmed = await confirm({
        title: `恢复到 v${targetVersion.version_no}？`,
        description: "当前文件内容将被该版本替换，并生成一条新的版本记录。",
        confirmLabel: "恢复版本",
      })
      if (!confirmed) {
        return
      }

      setIsSaving(true)
      setError(null)
      setSaveState("idle")
      try {
        const response = await restoreWorkspaceObjectVersion(accessToken, workspaceId, objectId, {
          version_id: targetVersion.id,
          expected_version_id: version.id,
        })
        const contentResponse = await getWorkspaceObjectContent(accessToken, workspaceId, objectId)
        setObject(response.object)
        setVersion(response.version)
        setContent(contentResponse.content)
        setSavedContent(contentResponse.content)
        setPreviewVersion(null)
        setPreviewContent(null)
        setSaveState("saved")
        await loadVersions()
        ignoredWorkspaceEventKeysRef.current.add(`restore_file:${objectId}:${response.version.id}`)
        dispatchWorkspaceObjectsChanged({
          workspaceId,
          objectId,
          path: response.object.path,
          action: "restore_file",
          versionId: response.version.id,
          source: "user",
        })
        notify.success({
          title: "版本已恢复",
          description: `已将 v${targetVersion.version_no} 恢复为最新内容。`,
        })
      } catch (restoreError) {
        const message = reportActionError(restoreError, "版本恢复失败，请稍后重试。", "版本恢复失败")
        if (message.toLowerCase().includes("conflict")) {
          setSaveState("conflict")
        }
      } finally {
        setIsSaving(false)
      }
    },
    [accessToken, loadVersions, objectId, reportActionError, version, workspaceId]
  )

  const saveAsFile = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    const defaultName = object.name.includes(".")
      ? object.name.replace(/(\.[^.]+)$/, " 副本$1")
      : `${object.name} 副本`
    const name = window.prompt("另存为", defaultName)
    const normalizedName = name?.trim()
    if (!normalizedName) {
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const response = await createWorkspaceFile(accessToken, workspaceId, {
        name: normalizedName,
        parent_id: object.parent_id ?? null,
        content,
        mime_type: object.mime_type || "text/plain",
      })
      ignoredWorkspaceEventKeysRef.current.add(`create_file:${response.object.id}:${response.version.id}`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId: response.object.id,
        path: response.object.path,
        action: "create_file",
        versionId: response.version.id,
        source: "user",
      })
      notify.success({
        title: "文件已创建",
        description: response.object.name,
      })
      navigate(`/workspace/${workspaceId}/objects/${response.object.id}`)
    } catch (saveAsError) {
      reportActionError(saveAsError, "另存文件失败，请稍后重试。", "另存失败")
    } finally {
      setIsSaving(false)
    }
  }, [accessToken, content, navigate, object, reportActionError, workspaceId])

  const duplicateObject = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    try {
      const preferredName = getUniqueName(workspaceObjects, object.parent_id, getCopyName(object.name))
      const response = await createWorkspaceFile(accessToken, workspaceId, {
        name: preferredName,
        parent_id: object.parent_id ?? null,
        content: savedContent,
        mime_type: object.mime_type || "text/plain",
      })
      ignoredWorkspaceEventKeysRef.current.add(`create_file:${response.object.id}:${response.version.id}`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId: response.object.id,
        path: response.object.path,
        action: "create_file",
        versionId: response.version.id,
        source: "user",
      })
      notify.success({
        title: "文件副本已创建",
        description: response.object.name,
      })
      navigate(`/workspace/${workspaceId}/objects/${response.object.id}`)
    } catch (duplicateError) {
      reportActionError(duplicateError, "创建副本失败，请稍后重试。", "创建副本失败")
    }
  }, [accessToken, navigate, object, reportActionError, savedContent, workspaceId, workspaceObjects])

  const renameObject = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    const name = window.prompt("输入新名称", object.name)
    const normalizedName = name?.trim()
    if (!normalizedName || normalizedName === object.name) {
      return
    }

    try {
      const response = await renameMoveWorkspaceObject(accessToken, workspaceId, object.id, { name: normalizedName })
      setObject(response.object)
      await loadWorkspaceTree()
      ignoredWorkspaceEventKeysRef.current.add(`rename_move:${response.object.id}:`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId: response.object.id,
        path: response.object.path,
        action: "rename_move",
        source: "user",
      })
      notify.success({
        title: "文件已重命名",
        description: response.object.name,
      })
    } catch (renameError) {
      reportActionError(renameError, "重命名失败，请稍后重试。", "重命名失败")
    }
  }, [accessToken, loadWorkspaceTree, object, reportActionError, workspaceId])

  const moveObject = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    const targetPath = window.prompt("输入目标文件夹路径，留空将移动到工作区根目录。", "")
    if (targetPath === null) {
      return
    }

    const normalizedPath = targetPath.trim().replace(/^\/+|\/+$/g, "")
    const targetFolder = normalizedPath
      ? workspaceObjects.find(
          (candidate) => candidate.kind === "folder" && candidate.path.toLowerCase() === normalizedPath.toLowerCase()
        )
      : null
    if (normalizedPath && !targetFolder) {
      setError("未找到目标文件夹。")
      notify.error({ title: "移动失败", description: "未找到目标文件夹。" })
      return
    }

    try {
      const response = await renameMoveWorkspaceObject(accessToken, workspaceId, object.id, {
        parent_id: targetFolder?.id ?? null,
      })
      setObject(response.object)
      await loadWorkspaceTree()
      ignoredWorkspaceEventKeysRef.current.add(`rename_move:${response.object.id}:`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId: response.object.id,
        path: response.object.path,
        action: "rename_move",
        source: "user",
      })
      notify.success({
        title: "文件已移动",
        description: response.object.path,
      })
    } catch (moveError) {
      reportActionError(moveError, "移动失败，请稍后重试。", "移动失败")
    }
  }, [accessToken, loadWorkspaceTree, object, reportActionError, workspaceId, workspaceObjects])

  const deleteObject = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    const confirmed = await confirm({
      title: `删除「${object.name}」？`,
      description: "该文件将从工作区中移除，此操作无法撤销。",
      confirmLabel: "删除",
      variant: "destructive",
    })
    if (!confirmed) {
      return
    }

    try {
      await deleteWorkspaceObject(accessToken, workspaceId, object.id)
      ignoredWorkspaceEventKeysRef.current.add(`delete:${object.id}:`)
      dispatchWorkspaceObjectsChanged({
        workspaceId,
        objectId: object.id,
        path: object.path,
        action: "delete",
        source: "user",
      })
      navigate(defaultPath)
    } catch (deleteError) {
      reportActionError(deleteError, "删除失败，请稍后重试。", "删除失败")
    }
  }, [accessToken, navigate, object, reportActionError, workspaceId])

  const copyLink = React.useCallback(async () => {
    if (!workspaceId || !object) {
      return
    }

    const url = `${window.location.origin}/workspace/${workspaceId}/objects/${object.id}`
    await navigator.clipboard?.writeText(url)
    notify.info({ title: "链接已复制" })
  }, [object, workspaceId])

  const openNewTab = React.useCallback(() => {
    if (!workspaceId || !object) {
      return
    }

    const url = `${window.location.origin}/workspace/${workspaceId}/objects/${object.id}`
    window.open(url, "_blank", "noopener,noreferrer")
  }, [object, workspaceId])

  const exportObject = React.useCallback(() => {
    if (!object) {
      return
    }

    downloadTextFile(object.name, savedContent, object.mime_type || "text/plain")
  }, [object, savedContent])

  React.useEffect(() => {
    if (!workspaceId || !objectId) {
      setHeaderContent(null)
      return
    }

    setHeaderContent({
      leading: (
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {breadcrumbParts.map((part, index) => {
            const isLast = index === breadcrumbParts.length - 1
            return (
              <React.Fragment key={`${part}-${index}`}>
                <span className={cn("min-w-0 truncate", isLast && "font-semibold text-foreground")}>{part}</span>
                {!isLast ? <span className="shrink-0 text-muted-foreground/70">/</span> : null}
              </React.Fragment>
            )
          })}
        </div>
      ),
      trailing: (
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "hidden text-xs xl:inline",
              isDirty || saveState === "conflict" ? "text-amber-600" : "text-muted-foreground"
            )}
          >
            {statusLabel}
          </span>
          <div
            title={`最近编辑者：${object?.updated_by_actor_id || currentUser?.display_name || "未知用户"}`}
            className="hidden size-8 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white lg:flex"
          >
            {getActorInitial(object?.updated_by_actor_id, currentUser?.display_name?.[0] ?? "U")}
          </div>
          <Button
            type="button"
            variant={isEditing ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setIsEditing((editing) => !editing)}
            aria-label={isEditing ? "预览文件" : "编辑文件"}
            title={isEditing ? "预览文件" : "编辑文件"}
          >
            <PencilIcon />
          </Button>
          {isEditing && isDirty ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setContent(savedContent)
                  setIsEditing(false)
                }}
                disabled={isSaving}
              >
                <span className="hidden xl:inline">放弃修改</span>
                <span className="sr-only xl:hidden">放弃修改</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveContent()}
                disabled={isLoading || isSaving || !version}
              >
                <SaveIcon />
                <span className="hidden xl:inline">{isSaving ? "保存中" : "保存"}</span>
                <span className="sr-only xl:hidden">{isSaving ? "保存中" : "保存"}</span>
              </Button>
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="文件操作"
                className="rounded-full bg-muted/70"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-lg p-1">
              <DropdownMenuItem className="gap-2 rounded-md" onClick={() => setIsHistoryOpen(true)}>
                <HistoryIcon />
                <span>版本历史</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onClick={copyLink}>
                <CopyIcon />
                <span>复制链接</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onClick={openNewTab}>
                <ExternalLinkIcon />
                <span>在新标签页打开</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 rounded-md" onSelect={(event) => event.preventDefault()}>
                <Maximize2Icon />
                <span>全宽预览</span>
                <Switch checked={isFullWidth} onCheckedChange={setIsFullWidth} className="ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onSelect={(event) => event.preventDefault()}>
                <FilePenIcon />
                <span>紧凑排版</span>
                <Switch checked={isCompact} onCheckedChange={setIsCompact} className="ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 rounded-md" onClick={duplicateObject}>
                <CopyPlusIcon />
                <span>创建副本</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onClick={moveObject}>
                <FolderInputIcon />
                <span>移动到…</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onClick={renameObject}>
                <FilePenIcon />
                <span>重命名</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-md" onClick={exportObject}>
                <DownloadIcon />
                <span>导出文件</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 rounded-md text-destructive focus:text-destructive"
                onClick={deleteObject}
              >
                <Trash2Icon />
                <span>删除文件</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    })

    return () => {
      setHeaderContent(null)
    }
  }, [
    breadcrumbParts,
    copyLink,
    currentUser?.display_name,
    deleteObject,
    duplicateObject,
    exportObject,
    isCompact,
    isDirty,
    isEditing,
    isFullWidth,
    isLoading,
    isSaving,
    moveObject,
    object?.updated_by_actor_id,
    objectId,
    openNewTab,
    renameObject,
    saveContent,
    saveState,
    savedContent,
    setHeaderContent,
    statusLabel,
    version,
    workspaceId,
  ])

  if (!workspaceId || !objectId) {
    return (
      <div className="flex min-h-[calc(100svh-5rem)] items-center justify-center text-sm text-muted-foreground">
        请从左侧工作区选择一个文件。
      </div>
    )
  }

  return (
    <section className="flex min-h-[calc(100svh-5rem)] flex-col overflow-hidden bg-background">
      {error ? (
        <div
          className={cn(
            "mx-2 rounded-lg border px-4 py-3 text-sm sm:mx-6",
            saveState === "conflict"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {saveState === "conflict" ? "检测到更新版本。请重新加载后再保存，或将当前内容另存为新文件。" : error}
            </span>
            {saveState === "conflict" ? (
              <span className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void loadContent()}>
                  <RefreshCwIcon />
                  重新加载
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void saveAsFile()}>
                  <CopyPlusIcon />
                  另存为
                </Button>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-muted-foreground">
            正在加载文件…
          </div>
        ) : isEditing ? (
          <React.Suspense
            fallback={
              <div
                role="status"
                className="flex h-full min-h-[560px] items-center justify-center text-sm text-muted-foreground"
              >
                正在加载编辑器…
              </div>
            }
          >
            <WorkspaceCodeEditor
              object={object}
              value={content}
              onChange={setContent}
            />
          </React.Suspense>
        ) : (
          <div className={cn("mx-auto min-h-full", isFullWidth ? "max-w-none" : "max-w-6xl")}>
            <FilePreview object={object} content={savedContent} compact={isCompact} />
          </div>
        )}
      </div>

      <HistoryModal
        open={isHistoryOpen}
        object={object}
        version={version}
        versions={versions}
        previewVersion={previewVersion}
        previewContent={previewContent}
        isPreviewLoading={isPreviewLoading}
        onClose={() => setIsHistoryOpen(false)}
        onPreview={(targetVersion) => void previewHistoricalVersion(targetVersion)}
        onRestore={(targetVersion) => void restoreHistoricalVersion(targetVersion)}
      />
    </section>
  )
}
