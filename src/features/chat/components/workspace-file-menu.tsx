import * as React from "react"
import { useTranslation } from "react-i18next"
import { FileIcon, FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/app/notice"
import { normalizeAppError } from "@/lib/app/api-errors"
import { listWorkspaceDirectory, searchWorkspacePaths, type WorkspaceObject } from "@/lib/api/api-client"
import type { WorkspaceFileReference } from "@/lib/workspace-file-reference"
import { WORKSPACE_OBJECTS_CHANGED_EVENT, type WorkspaceObjectsChangedEvent } from "@/lib/workspace-events"

type Entry = Pick<WorkspaceObject, "id" | "workspace_id" | "path" | "name" | "kind" | "current_version_id">
export type FileMenuHandle = { keyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean }
// In-flight reads only; no stale directory cache and no full-workspace scan.
const flights = new Map<string, Promise<{ objects: Entry[]; next_cursor: string | null }>>()
let activeReads = 0
const readWaiters: (() => void)[] = []
async function boundedRead<T>(read: () => Promise<T>): Promise<T> {
  if (activeReads >= 4) await new Promise<void>(resolve => readWaiters.push(resolve))
  else activeReads++
  try { return await read() } finally {
    const next = readWaiters.shift()
    if (next) next(); else activeReads--
  }
}
function page(token: string, workspace: string, path: string, query: string, cursor?: string) {
  const key = JSON.stringify([token, workspace, path, query, cursor])
  const existing = flights.get(key)
  if (existing) return existing
  const promise = boundedRead(() => query ? searchWorkspacePaths(token, workspace, path, query, cursor).then(result => ({ objects: result.matches.map(match => match.object), next_cursor: result.next_cursor })) : listWorkspaceDirectory(token, workspace, path, cursor))
    .finally(() => { if (flights.get(key) === promise) flights.delete(key) })
  flights.set(key, promise)
  return promise
}

export const WorkspaceFileMenu = React.forwardRef<FileMenuHandle, {
  accessToken: string; workspaces: { id: string; name: string }[]; currentWorkspaceId?: string
  query: string; onSelect: (ref: WorkspaceFileReference) => void
}>(function WorkspaceFileMenu({ accessToken, workspaces, currentWorkspaceId, query, onSelect }, ref) {
  const { t } = useTranslation()
  const [workspaceId, setWorkspaceId] = React.useState(currentWorkspaceId || workspaces[0]?.id || "")
  const [path, setPath] = React.useState("")
  const [pageCursor, setPageCursor] = React.useState<{ query: string; value: string }>()
  const cursor = pageCursor?.query === query ? pageCursor.value : undefined
  const setCursor = (value: string | undefined) => setPageCursor(value ? { query, value } : undefined)
  const [revision, retry] = React.useReducer(n => n + 1, 0)
  const [selected, setSelected] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  const key = JSON.stringify([accessToken, workspaceId, path, query, cursor, revision])
  const [result, setResult] = React.useState<{ key: string; objects: Entry[]; next: string | null; error?: string }>()
  const current = result?.key === key ? result : undefined
  React.useLayoutEffect(() => {
    const list = listRef.current
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !option) return
    const outer = list.getBoundingClientRect(), inner = option.getBoundingClientRect()
    if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top
    else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom
  }, [current, selected])
  React.useEffect(() => {
    const changed = (event: Event) => {
      if ((event as WorkspaceObjectsChangedEvent).detail.workspaceId === workspaceId) { setPageCursor(undefined); retry() }
    }
    window.addEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, changed)
    return () => window.removeEventListener(WORKSPACE_OBJECTS_CHANGED_EVENT, changed)
  }, [workspaceId])
  React.useEffect(() => {
    let active = true
    if (!workspaceId || !workspaces.some(workspace => workspace.id === workspaceId)) return
    const timer = window.setTimeout(() => {
      void page(accessToken, workspaceId, path, query.trim(), cursor).then(result => {
        if (active) { setResult({ key, objects: result.objects, next: result.next_cursor }); setSelected(0) }
      }).catch(error => { if (active) setResult({ key, objects: [], next: null, error: normalizeAppError(error).message }) })
    }, 150)
    return () => { active = false; window.clearTimeout(timer) }
  }, [accessToken, workspaceId, path, query, cursor, key, workspaces])
  function choose(entry: Entry) {
    if (entry.kind === "folder") { setPath(entry.path); setCursor(undefined); return }
    if (!entry.current_version_id) return
    onSelect({ workspaceId, objectId: entry.id, versionId: entry.current_version_id, label: `${workspaces.find(workspace => workspace.id === workspaceId)?.name ?? workspaceId}/${entry.path}` })
  }
  React.useImperativeHandle(ref, () => ({ keyDown(event) {
    if (!current || current.error || !current.objects.length) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      setSelected(index => (index + (event.key === "ArrowDown" ? 1 : -1) + current.objects.length) % current.objects.length)
      return true
    }
    if (event.key === "Enter" || event.key === "Tab") { choose(current.objects[selected] ?? current.objects[0]); return true }
    return false
  } }))
  return <div className="rounded-xl border bg-popover p-2 shadow-lg" data-workspace-file-menu>
    <div className="flex items-center gap-2 pb-2">
      <label className="sr-only" htmlFor="file-reference-space">{t("fileReferences.workspace")}</label>
      <select id="file-reference-space" className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm" value={workspaceId} onChange={event => { setWorkspaceId(event.target.value); setPath(""); setCursor(undefined) }}>
        {[...workspaces].sort((a, b) => Number(b.id === currentWorkspaceId) - Number(a.id === currentWorkspaceId)).map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      {path && <Button type="button" size="sm" variant="ghost" onClick={() => { setPath(path.split("/").slice(0, -1).join("/")); setCursor(undefined) }}>{t("fileReferences.up")}</Button>}
    </div>
    <p className="mb-1 truncate text-xs text-muted-foreground">{path || "/"} · {t("fileReferences.hint")}</p>
    {!workspaces.length ? <Notice>{t("fileReferences.empty")}</Notice> : !current ? <p role="status">{t("common.loading")}</p> : current.error ? <Notice tone="error">{current.error}<Button type="button" variant="ghost" onClick={retry}>{t("common.retry")}</Button></Notice> : <>
      <div ref={listRef} role="listbox" aria-label={t("fileReferences.title")} className="max-h-56 overflow-y-auto">
        {current.objects.map((entry, index) => <button type="button" role="option" aria-selected={index === selected} key={entry.id} disabled={entry.kind !== "folder" && !entry.current_version_id} onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${index === selected ? "bg-accent" : ""}`}>
          {entry.kind === "folder" ? <FolderIcon className="size-4 shrink-0" /> : <FileIcon className="size-4 shrink-0" />}<span className="min-w-0 truncate" title={entry.path}>{entry.path}</span>
        </button>)}
      </div>
      {!current.objects.length && <p className="p-2 text-sm text-muted-foreground">{t("fileReferences.empty")}</p>}
      <div className="flex justify-end gap-2">
        {cursor && <Button type="button" size="sm" variant="ghost" onClick={() => setCursor(undefined)}>{t("fileReferences.firstPage")}</Button>}
        {current.next && <Button type="button" size="sm" variant="ghost" onClick={() => setCursor(current.next!)}>{t("common.loadMore")}</Button>}
      </div>
    </>}
  </div>
})
