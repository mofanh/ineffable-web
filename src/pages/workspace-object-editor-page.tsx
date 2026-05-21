import * as React from "react"
import CodeMirror from "@uiw/react-codemirror"
import { html } from "@codemirror/lang-html"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { markdown } from "@codemirror/lang-markdown"
import { SaveIcon, RefreshCwIcon } from "lucide-react"
import { useParams } from "react-router-dom"
import type { Extension } from "@codemirror/state"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAppSession } from "@/contexts/app-session"
import {
  getWorkspaceObjectContent,
  updateWorkspaceObjectContent,
  type WorkspaceObject,
  type WorkspaceObjectVersion,
} from "@/lib/api/gateway-client"
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

  const isDirty = content !== savedContent
  const languageExtensions = React.useMemo(() => getLanguageExtensions(object), [object])

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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load file")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken, objectId, workspaceId])

  React.useEffect(() => {
    void loadContent()
  }, [loadContent])

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
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Save failed"
      setError(message)
      if (message.toLowerCase().includes("conflict")) {
        setSaveState("conflict")
      }
    } finally {
      setIsSaving(false)
    }
  }, [accessToken, content, isDirty, object, objectId, version, workspaceId])

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
          {saveState === "conflict"
            ? "This file has a newer version. Reload before saving again, or use Save As in the next step."
            : error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
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
      </div>
    </section>
  )
}
