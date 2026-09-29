import * as React from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { File, Folder } from "lucide-react"
import { DataState } from "@/components/app"
import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/features/auth/app-session"
import { listWorkspaceDirectoryDeduped } from "../api/workspace-resource-api"
import { useApiResource } from "@/lib/app/use-api-resource"

export function WorkspaceDirectory({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { accessToken } = useAuthSession()
  const [params, setParams] = useSearchParams()
  const path = params.get("path") ?? "", cursor = params.get("cursor") ?? undefined
  const resource = useApiResource({
    load: React.useCallback(() => listWorkspaceDirectoryDeduped(accessToken!, workspaceId, path, cursor), [accessToken, workspaceId, path, cursor]),
  })
  return <div className="space-y-3">
    <DataState state={resource.state} error={resource.error} onRetry={resource.reload} empty={resource.data?.objects.length === 0} emptyTitle={t("interaction.emptyDirectory")}>
      <div className="divide-y rounded-xl border">{resource.data?.objects.map(file => <Link key={file.id} to={file.kind === "folder" ? `?${new URLSearchParams({ path: file.path })}` : `/workspace/${workspaceId}/objects/${file.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-accent">
        {file.kind === "folder" ? <Folder className="size-4 shrink-0" /> : <File className="size-4 shrink-0" />}<span className="min-w-0 break-words">{file.name}</span>
      </Link>)}</div>
      <div className="flex gap-2">{cursor && <Button variant="ghost" onClick={() => setParams({ path })}>{t("fileReferences.firstPage")}</Button>}{resource.data?.next_cursor && <Button variant="ghost" onClick={() => setParams({ path, cursor: resource.data!.next_cursor! })}>{t("common.loadMore")}</Button>}</div>
    </DataState>
  </div>
}
