import * as React from "react"
import { useTranslation } from "react-i18next"
import { FolderIcon, FileIcon } from "lucide-react"
import { AppPage, DataState, Notice } from "@/components/app"
import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/features/auth/app-session"
import { listArchivedWorkspaces, downloadArchivedFile } from "@/features/workspace/api/workspace-lifecycle"
import { useWorkspaceLifecycle } from "@/features/workspace/hooks/use-workspace-lifecycle"
import { listWorkspaceDirectory, listWorkspaceMembers, type Workspace, type WorkspaceObject } from "@/lib/api/api-client"
import { useApiResource } from "@/lib/app/use-api-resource"
import { notify } from "@/lib/app/notifications"
import { normalizeAppError } from "@/lib/app/api-errors"
import { WorkspaceFileTags } from "@/features/chat/components/workspace-file-tags"

export default function ArchivedWorkspacesPage() {
  const { t } = useTranslation()
  const { accessToken, currentSessionId } = useAuthSession()
  const resource = useApiResource({ enabled: Boolean(accessToken), cacheKey: ["archived-workspaces", currentSessionId], staleTime: 0, load: React.useCallback(() => listArchivedWorkspaces(accessToken!), [accessToken]) })
  const [selected, setSelected] = React.useState<string>()
  const workspace = resource.data?.workspaces.find(space => space.id === selected)
  return <AppPage title={t("workspaceLifecycle.archived")} description={t("workspaceLifecycle.readOnly")}>
    <DataState state={resource.state} error={resource.error} empty={resource.data?.workspaces.length === 0} emptyTitle={t("workspaceLifecycle.empty")} onRetry={resource.reload}>
      <div className="flex flex-wrap gap-2">{resource.data?.workspaces.map(space => <Button key={space.id} variant={selected === space.id ? "secondary" : "outline"} className="max-w-full" onClick={() => setSelected(space.id)}><span className="truncate">{space.name}</span></Button>)}</div>
      {workspace && <ArchivedFiles key={`${currentSessionId}:${workspace.id}`} workspace={workspace} onRestored={resource.reload} />}
    </DataState>
  </AppPage>
}

function ArchivedFiles({ workspace, onRestored }: { workspace: Workspace; onRestored: () => void }) {
  const { t } = useTranslation()
  const { accessToken, currentUser, currentSessionId } = useAuthSession()
  const { run, pending } = useWorkspaceLifecycle()
  const [path, setPath] = React.useState("")
  const [cursor, setCursor] = React.useState<string>()
  const [preview, setPreview] = React.useState<WorkspaceObject>()
  const [downloading, setDownloading] = React.useState(false)
  const alive = React.useRef(true)
  React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const members = useApiResource({ enabled: Boolean(accessToken), load: React.useCallback(() => listWorkspaceMembers(accessToken!, workspace.id), [accessToken, workspace.id]) })
  const files = useApiResource({ enabled: Boolean(accessToken), load: React.useCallback(() => listWorkspaceDirectory(accessToken!, workspace.id, path, cursor), [accessToken, workspace.id, path, cursor]) })
  const owner = members.data?.members.some(member => member.user_id === currentUser?.id && member.role === "owner" && member.status === "active")
  const lastOwner = owner && members.data?.members.filter(member => member.role === "owner" && member.status === "active").length === 1
  async function download(file: WorkspaceObject) {
    if (!accessToken || !currentSessionId || !file.current_version_id || downloading) return
    setDownloading(true)
    try {
      const blob = await downloadArchivedFile(accessToken, workspace.id, file.current_version_id, currentSessionId)
      if (!alive.current) return
      const url = URL.createObjectURL(blob), link = document.createElement("a")
      link.href = url; link.download = file.name; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (alive.current) notify.error({ title: t("workspaceLifecycle.failed"), description: normalizeAppError(error).message })
    } finally { if (alive.current) setDownloading(false) }
  }
  return <section className="space-y-4 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 truncate font-medium">{workspace.name}</h2><div className="flex gap-2">
      {owner && <Button disabled={pending} onClick={() => void run(workspace.id, workspace.name, "restore", onRestored)}>{t("workspaceLifecycle.restore")}</Button>}
      <Button variant="outline" disabled={pending || !members.data || lastOwner} title={lastOwner ? t("workspaceLifecycle.lastOwner") : undefined} onClick={() => void run(workspace.id, workspace.name, "leave", onRestored)}>{lastOwner ? t("workspaceLifecycle.transferFirst") : t("workspaceLifecycle.leave")}</Button>
    </div></div>
    <Notice>{t("workspaceLifecycle.readOnly")}</Notice>
    <div className="flex items-center gap-2"><span className="min-w-0 truncate text-sm text-muted-foreground">/{path}</span>{path && <Button variant="ghost" onClick={() => { setPath(path.split("/").slice(0, -1).join("/")); setCursor(undefined); setPreview(undefined) }}>{t("fileReferences.up")}</Button>}</div>
    <DataState state={files.state} error={files.error} onRetry={files.reload} empty={files.data?.objects.length === 0} emptyTitle={t("fileReferences.empty")}>
      {files.data?.objects.map(file => <div key={file.id} className="flex items-center gap-2 border-b py-2 last:border-0">
        {file.kind === "folder" ? <FolderIcon className="size-4 shrink-0" /> : <FileIcon className="size-4 shrink-0" />}
        <Button variant="ghost" className="min-w-0 flex-1 justify-start" onClick={() => { if (file.kind === "folder") { setPath(file.path); setCursor(undefined); setPreview(undefined) } else setPreview(file) }}><span className="truncate">{file.name}</span></Button>
        {file.kind !== "folder" && <Button variant="outline" size="sm" disabled={downloading || !file.current_version_id} onClick={() => void download(file)}>{t("workspaceLifecycle.download")}</Button>}
      </div>)}
      <div className="flex gap-2">{cursor && <Button variant="ghost" onClick={() => setCursor(undefined)}>{t("fileReferences.firstPage")}</Button>}{files.data?.next_cursor && <Button variant="ghost" onClick={() => setCursor(files.data!.next_cursor!)}>{t("common.loadMore")}</Button>}</div>
    </DataState>
    {preview?.current_version_id && <WorkspaceFileTags references={[{ workspaceId: workspace.id, objectId: preview.id, versionId: preview.current_version_id, label: `${workspace.name}/${preview.path}` }]} accessToken={accessToken ?? undefined} />}
  </section>
}
