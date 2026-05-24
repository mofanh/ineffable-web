import * as React from "react"
import CodeMirror from "@uiw/react-codemirror"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { CopyPlusIcon, HistoryIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
import { useParams } from "react-router-dom"
import type { Extension } from "@codemirror/state"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAppSession } from "@/features/auth/app-session"
import {
  createWorkspaceFile,
  getWorkspaceObjectContent,
  getWorkspaceObjectVersionContent,
  listWorkspaceObjectVersions,
  restoreWorkspaceObjectVersion,
  updateWorkspaceObjectContent,
  type WorkspaceObject,
  type WorkspaceObjectVersion,
} from "@/features/workspace/api/workspace-api"
import {
  WORKSPACE_OBJECTS_CHANGED_EVENT,
  type WorkspaceObjectsChangedEvent,
} from "@/lib/workspace-events"
import { cn } from "@/lib/utils"

function getLanguageExtensions(object: WorkspaceObject | null): Extension[] {
  const name = object?.name.toLowerCase() ?? ""
  const mimeType = object?.mime_type?.toLowerCase() ?? ""

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return [markdown()]
  }
  if (name.endsWith(".html") || name.endsWith(".htm") || mimeType.includes("html")) {
    return [html()]
  }
  if (name.endsWith(".json") || mimeType.includes("json")) {
    return [json()]
  }
  if (
    name.endsWith(".js") ||
    name.endsWith(".jsx") ||
    name.endsWith(".ts") ||
    name.endsWith(".tsx") ||
    mimeType.includes("javascript")
  ) {
    return [javascript({ jsx: true, typescript: name.endsWith(".ts") || name.endsWith(".tsx") })]
  }

  return []
}

function formatVersion(version: WorkspaceObjectVersion | null) {
  return version ? `v${version.version_no}` : "No version"
}

export function WorkspaceObjectEditorPage() {
  const { workspaceId, objectId } = useParams()
  const { accessToken } = useAppSession()
  const [object, setObject] = React.useState<WorkspaceObject | null>(null)
  const [version, setVersion] = React.useState<WorkspaceObjectVersion | null>(null)
  const [content, setContent] = React.useState("")
  const [savedContent, setSavedContent] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<"idle" | "saved" | "conflict">("idle")
  const [versions, setVersions] = React.useState<WorkspaceObjectVersion[]>([])
  const [previewVersion, setPreviewVersion] =
    React.useState<WorkspaceObjectVersion | null>(null)
  const [previewContent, setPreviewContent] = React.useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false)

  const isDirty = content !== savedContent
  const languageExtensions = React.useMemo(() => getLanguageExtensions(object), [object])

  const loadVersions = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId) {
      return
    }

    const response = await listWorkspaceObjectVersions(accessToken, workspaceId, objectId)
    setVersions(response.versions)
  }, [accessToken, objectId, workspaceId])

  const loadContent = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId) {
      return
    }

    setIsLoading(true)
    setError(null)
    setSaveState("idle")

    try {
      const response = await getWorkspaceObjectContent(accessToken, workspaceId, objectId)
      setObject(response.object)
      setVersion(response.version)
      setContent(response.content)
      setSavedContent(response.content)
      setPreviewVersion(null)
      setPreviewContent(null)
      await loadVersions()
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load file")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, loadVersions, objectId, workspaceId])

  React.useEffect(() => {
    void loadContent()
  }, [loadContent])

  React.useEffect(() => {
    const handleWorkspaceObjectsChanged = (event: Event) => {
      const detail = (event as WorkspaceObjectsChangedEvent).detail
      if (!detail || detail.workspaceId !== workspaceId) {
        return
      }

      const affectsCurrentObject =
        detail.objectId === objectId ||
        (Boolean(detail.path) && Boolean(object?.path) && detail.path === object?.path)
      if (!affectsCurrentObject) {
        return
      }

      if (detail.versionId && detail.versionId === version?.id) {
        return
      }

      if (isDirty) {
        setSaveState("conflict")
        setError(
          "This file has a newer version. Reload before saving again, or save your local content as a new file."
        )
        return
      }

      void loadContent()
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
  }, [isDirty, loadContent, object?.path, objectId, version?.id, workspaceId])

  const saveContent = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !objectId || !object || !version || !isDirty) {
      return
    }

    setIsSaving(true)
    setError(null)
    setSaveState("idle")

    try {
      const response = await updateWorkspaceObjectContent(
        accessToken,
        workspaceId,
        objectId,
        {
          content,
          mime_type: object.mime_type || "text/plain",
          expected_version_id: version.id,
        }
      )
      setObject(response.object)
      setVersion(response.version)
      setSavedContent(content)
      setSaveState("saved")
      await loadVersions()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Save failed"
      setError(message)
      if (message.toLowerCase().includes("conflict")) {
        setSaveState("conflict")
      }
    } finally {
      setIsSaving(false)
    }
  }, [accessToken, content, isDirty, loadVersions, object, objectId, version, workspaceId])

  const previewHistoricalVersion = React.useCallback(
    async (targetVersion: WorkspaceObjectVersion) => {
      if (!accessToken || !workspaceId) {
        return
      }

      setIsPreviewLoading(true)
      setError(null)
      try {
        const response = await getWorkspaceObjectVersionContent(
          accessToken,
          workspaceId,
          targetVersion.id
        )
        setPreviewVersion(targetVersion)
        setPreviewContent(response.content)
      } catch (previewError) {
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Failed to load version content"
        )
      } finally {
        setIsPreviewLoading(false)
      }
    },
    [accessToken, workspaceId]
  )

  const restoreHistoricalVersion = React.useCallback(
    async (targetVersion: WorkspaceObjectVersion) => {
      if (!accessToken || !workspaceId || !objectId || !version) {
        return
      }

      const confirmed = window.confirm(`Restore v${targetVersion.version_no}?`)
      if (!confirmed) {
        return
      }

      setIsSaving(true)
      setError(null)
      setSaveState("idle")
      try {
        const response = await restoreWorkspaceObjectVersion(
          accessToken,
          workspaceId,
          objectId,
          {
            version_id: targetVersion.id,
            expected_version_id: version.id,
          }
        )
        const contentResponse = await getWorkspaceObjectContent(
          accessToken,
          workspaceId,
          objectId
        )
        setObject(response.object)
        setVersion(response.version)
        setContent(contentResponse.content)
        setSavedContent(contentResponse.content)
        setPreviewVersion(null)
        setPreviewContent(null)
        setSaveState("saved")
        await loadVersions()
      } catch (restoreError) {
        const message =
          restoreError instanceof Error ? restoreError.message : "Restore failed"
        setError(message)
        if (message.toLowerCase().includes("conflict")) {
          setSaveState("conflict")
        }
      } finally {
        setIsSaving(false)
      }
    },
    [accessToken, loadVersions, objectId, version, workspaceId]
  )

  const saveAsFile = React.useCallback(async () => {
    if (!accessToken || !workspaceId || !object) {
      return
    }

    const defaultName = object.name.includes(".")
      ? object.name.replace(/(\.[^.]+)$/, " copy$1")
      : `${object.name} copy`
    const name = window.prompt("Save as", defaultName)
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
      window.location.assign(`/workspace/${workspaceId}/objects/${response.object.id}`)
    } catch (saveAsError) {
      setError(saveAsError instanceof Error ? saveAsError.message : "Save as failed")
    } finally {
      setIsSaving(false)
    }
  }, [accessToken, content, object, workspaceId])

  if (!workspaceId || !objectId) {
    return (
      <div className="flex min-h-[calc(100svh-5rem)] items-center justify-center text-sm text-muted-foreground">
        Select a workspace file to edit.
      </div>
    )
  }

  return (
    <section className="flex min-h-[calc(100svh-5rem)] flex-col overflow-hidden rounded-lg border bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">
              {object?.name || (isLoading ? "Loading file..." : "Workspace file")}
            </h1>
            <Badge variant={isDirty ? "secondary" : "outline"} className="shrink-0">
              {isDirty ? "Unsaved" : saveState === "saved" ? "Saved" : formatVersion(version)}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {object?.path || "Text file"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadContent()}
            disabled={isLoading || isSaving}
          >
            <RefreshCwIcon />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void saveContent()}
            disabled={!isDirty || isLoading || isSaving || !version}
          >
            <SaveIcon />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>
      </header>

      {error ? (
        <div
          className={cn(
            "border-b px-4 py-2 text-sm",
            saveState === "conflict"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {saveState === "conflict"
                ? "This file has a newer version. Reload before saving again, or save your local content as a new file."
                : error}
            </span>
            {saveState === "conflict" ? (
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadContent()}
                >
                  <RefreshCwIcon />
                  Reload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void saveAsFile()}
                >
                  <CopyPlusIcon />
                  Save As
                </Button>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading file...
          </div>
        ) : (
          <CodeMirror
            value={content}
            height="100%"
            basicSetup={{
              foldGutter: true,
              lineNumbers: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
            extensions={languageExtensions}
            onChange={setContent}
            className="h-full text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
          />
        )}
        <aside className="min-h-0 border-t bg-muted/20 md:border-l md:border-t-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-sm font-medium">
              <HistoryIcon className="size-4 text-muted-foreground" />
              Versions
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              {versions.length ? (
                <div className="space-y-1">
                  {versions.map((item) => {
                    const isCurrent = version?.id === item.id
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-md border bg-background p-2 text-xs",
                          isCurrent && "border-primary/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">v{item.version_no}</span>
                          {isCurrent ? <Badge variant="outline">Current</Badge> : null}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">
                          {item.created_by_actor_type}:{item.created_by_actor_id}
                        </div>
                        <div className="mt-2 flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => void previewHistoricalVersion(item)}
                          >
                            Preview
                          </Button>
                          {!isCurrent ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => void restoreHistoricalVersion(item)}
                            >
                              <RotateCcwIcon />
                              Restore
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-1 py-2 text-sm text-muted-foreground">
                  No versions yet.
                </div>
              )}
            </div>
            <div className="max-h-64 shrink-0 overflow-auto border-t bg-background p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                {previewVersion
                  ? `Preview v${previewVersion.version_no}`
                  : "Select a version to preview"}
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {isPreviewLoading ? "Loading..." : previewContent ?? ""}
              </pre>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
