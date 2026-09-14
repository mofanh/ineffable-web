import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { AppDialog } from "@/components/app/app-dialog"
import { useApiResource } from "@/lib/app/use-api-resource"
import { DataState } from "@/components/app/data-state"
import { normalizeAppError } from "@/lib/app/api-errors"
import { listWorkspaceDirectory } from "@/lib/api/api-client"
import { getImageReference, type ImageReference } from "@/lib/api/images"

export function WorkspaceImagePicker({ accessToken, workspaceId, onSelect, disabled, renderTrigger }: {
  accessToken: string; workspaceId: string; onSelect: (image: ImageReference) => void; disabled: boolean; renderTrigger?: (open: () => void) => React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [path, setPath] = React.useState("")
  const [cursor, setCursor] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const generation = React.useRef(0)
  React.useEffect(() => () => { generation.current += 1 }, [accessToken, workspaceId])
  const load = React.useCallback(() => listWorkspaceDirectory(accessToken, workspaceId, path, cursor), [accessToken, workspaceId, path, cursor])
  const resource = useApiResource({ enabled: open, load, errorMessage: t("images.loadFailed") })
  async function select(versionId: string) {
    const selectedGeneration = ++generation.current
    setBusy(true); setError(null)
    try {
      const image = await getImageReference(accessToken, versionId)
      if (selectedGeneration !== generation.current) return
      onSelect(image); setOpen(false)
    } catch (error) {
      if (selectedGeneration === generation.current) setError(normalizeAppError(error, { fallbackMessage: t("images.loadFailed") }).message)
    } finally { if (selectedGeneration === generation.current) setBusy(false) }
  }
  return <>
    {renderTrigger ? renderTrigger(() => { if (!disabled) setOpen(true) }) : <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>{t("images.fromWorkspace")}</Button>}
    <AppDialog open={open} title={t("images.fromWorkspace")} onOpenChange={(value) => { if (!value) { generation.current += 1; setBusy(false) } setOpen(value) }}>
      <div className="mb-3 flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={!path || busy} onClick={() => { setPath(path.split("/").slice(0, -1).join("/")); setCursor(undefined) }}>{t("images.parentDirectory")}</Button><span className="truncate text-sm">/{path}</span></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DataState state={resource.state} error={resource.error} onRetry={resource.reload} empty={resource.data?.objects.length === 0} emptyTitle={t("images.emptyDirectory")}>
        <div className="space-y-1">{resource.data?.objects.map((object) => {
          const folder = object.kind === "folder"
          const image = ["image/png", "image/jpeg", "image/webp"].includes(object.mime_type ?? "")
          return <Button key={object.id} type="button" variant="ghost" className="w-full justify-start truncate" disabled={busy || (!folder && (!image || !object.current_version_id))} onClick={() => {
            if (folder) { setPath(object.path); setCursor(undefined) }
            else if (object.current_version_id) void select(object.current_version_id)
          }}>{folder ? "▸ " : ""}{object.name}</Button>
        })}</div>
        {resource.data?.next_cursor ? <Button type="button" variant="outline" size="sm" onClick={() => setCursor(resource.data?.next_cursor ?? undefined)}>{t("images.nextPage")}</Button> : null}
      </DataState>
    </AppDialog>
  </>
}
