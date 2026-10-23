import * as React from "react"
import { useTranslation } from "react-i18next"
import { AppDialog, FormField } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/app/notice"
import { useApiResource } from "@/lib/app/use-api-resource"
import { dispatchWorkspaceObjectsChanged } from "@/lib/workspace-events"
import { captureAuthSession } from "@/lib/api/auth-session-runtime"
import { listWorkspaceObjectVersions, prepareDefaultWorkspaceRule, type Workspace, type WorkspaceRuleSelection } from "@/lib/api/api-client"
import { WorkspaceFileMenu } from "./workspace-file-menu"

export function WorkspaceRuleField({ accessToken, workspaces, value, disabled, onChange }: {
  accessToken: string; workspaces: Workspace[]; value: WorkspaceRuleSelection | null | undefined; disabled?: boolean
  onChange: (rule: WorkspaceRuleSelection | null | undefined) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const automatic = value === undefined
  const workspaceId = value?.workspace_id, objectId = value?.object_id
  const file = useApiResource({
    enabled: value !== null,
    cacheKey: ["workspace-rule-label", accessToken, automatic ? "automatic" : "selected", workspaceId ?? "", objectId ?? ""],
    load: React.useCallback(async () => {
      if (automatic) {
        const isCurrentSession = captureAuthSession(accessToken)
        const { object } = await prepareDefaultWorkspaceRule(accessToken)
        const result = await listWorkspaceObjectVersions(accessToken, object.workspace_id, object.id)
        if (isCurrentSession()) dispatchWorkspaceObjectsChanged({ workspaceId: result.object.workspace_id, objectId: result.object.id, path: result.object.path, versionId: result.object.current_version_id, action: "create_file", source: "system" })
        return result
      }
      return workspaceId && objectId ? listWorkspaceObjectVersions(accessToken, workspaceId, objectId) : null
    }, [accessToken, automatic, workspaceId, objectId]),
    errorMessage: t("chat.rule.unavailable"),
  })
  const personal = workspaces.find(space => space.workspace_type === "personal" && space.status === "active")
  const effective = automatic ? file.data?.object ? { workspace_id: file.data.object.workspace_id, object_id: file.data.object.id } : undefined : value
  return <FormField group label={t("chat.rule.title")} description={t("chat.rule.description")}>
    <div className="space-y-2" data-workspace-rule-field>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-all text-sm text-muted-foreground">{automatic ? t("chat.rule.automatic") : effective ? (file.data ? `${workspaces.find(space => space.id === effective.workspace_id)?.name ?? effective.workspace_id}/${file.data.object.path}` : file.error ? t("chat.rule.unavailable") : t("common.loading")) : t("chat.rule.none")}</span>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { setQuery(""); setOpen(true) }}>{t("chat.rule.choose")}</Button>
        {effective && <>
          <a className="text-sm underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`/workspace/${effective.workspace_id}/objects/${effective.object_id}`}>{t("chat.rule.edit")}</a>
          {file.data && <a className="text-sm underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`/workspace/${effective.workspace_id}/objects?${new URLSearchParams({ path: file.data.object.path.split("/").slice(0, -1).join("/") })}`}>{t("chat.rule.directory")}</a>}
        </>}
        {value !== undefined && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => { onChange(undefined) }}>{t("chat.rule.useDefault")}</Button>}
        {value !== null && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => { onChange(null) }}>{t("chat.rule.clear")}</Button>}
      </div>
      {file.error && <Notice tone="error"><p>{file.error.message}</p><p className="mt-1">{t("chat.rule.repairHint")}</p><Button type="button" size="sm" variant="outline" onClick={() => void file.reload()}>{t("common.retry")}</Button></Notice>}
      <AppDialog open={open && !disabled} onOpenChange={setOpen} title={t("chat.rule.choose")} description={t("chat.rule.fileHint")}>
        <div className="space-y-3">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("chat.rule.search")} aria-label={t("chat.rule.search")} />
          <WorkspaceFileMenu accessToken={accessToken} workspaces={workspaces} currentWorkspaceId={workspaceId ?? personal?.id} query={query} onSelect={ref => { onChange({ workspace_id: ref.workspaceId, object_id: ref.objectId }); setOpen(false) }} />
        </div>
      </AppDialog>
    </div>
  </FormField>
}
