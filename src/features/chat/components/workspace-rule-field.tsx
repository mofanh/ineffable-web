import * as React from "react"
import { useTranslation } from "react-i18next"
import { AppDialog, AsyncButton, FormField } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/app/notice"
import { useApiResource } from "@/lib/app/use-api-resource"
import { normalizeAppError } from "@/lib/app/api-errors"
import { listWorkspaceObjectVersions, type Workspace, type WorkspaceRuleSelection } from "@/lib/api/api-client"
import { WorkspaceFileMenu } from "./workspace-file-menu"
import { prepareWorkspaceRule } from "../model/workspace-rule-template"

export function WorkspaceRuleField({ accessToken, workspaces, value, disabled, onChange, onBusyChange }: {
  accessToken: string; workspaces: Workspace[]; value: WorkspaceRuleSelection | null; disabled?: boolean
  onChange: (rule: WorkspaceRuleSelection | null) => void; onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const mounted = React.useRef(true)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const workspaceId = value?.workspace_id, objectId = value?.object_id
  const file = useApiResource({
    cacheKey: ["workspace-rule-label", accessToken, workspaceId ?? "", objectId ?? ""],
    load: React.useCallback(() => workspaceId && objectId ? listWorkspaceObjectVersions(accessToken, workspaceId, objectId) : Promise.resolve(null), [accessToken, workspaceId, objectId]),
    errorMessage: t("chat.rule.unavailable"),
  })
  const personal = workspaces.find(space => space.workspace_type === "personal" && space.status === "active")
  async function createTemplate() {
    if (!personal || creating || disabled) return
    setCreating(true); onBusyChange(true); setError(undefined)
    try {
      const object = await prepareWorkspaceRule(accessToken, personal.id, t("chat.rule.template", { workspace: personal.id }))
      if (mounted.current) onChange({ workspace_id: personal.id, object_id: object.id })
    } catch (cause) { if (mounted.current) setError(normalizeAppError(cause).message) }
    finally { if (mounted.current) { setCreating(false); onBusyChange(false) } }
  }
  return <FormField label={t("chat.rule.title")} description={t("chat.rule.description")}>
    <div className="space-y-2" data-workspace-rule-field>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-all text-sm text-muted-foreground">{value ? (file.data ? `${workspaces.find(space => space.id === workspaceId)?.name ?? workspaceId}/${file.data.object.path}` : file.error ? t("chat.rule.unavailable") : t("common.loading")) : t("chat.rule.none")}</span>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { setQuery(""); setOpen(true) }}>{t("chat.rule.choose")}</Button>
        {value && <>
          <a className="text-sm underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`/workspace/${value.workspace_id}/objects/${value.object_id}`}>{t("chat.rule.edit")}</a>
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => { setError(undefined); onChange(null) }}>{t("chat.rule.clear")}</Button>
        </>}
        {!value && personal && <AsyncButton type="button" size="sm" variant="ghost" isLoading={creating} disabled={disabled} onClick={() => void createTemplate()}>{t("chat.rule.create")}</AsyncButton>}
      </div>
      {(error || file.error) && <Notice tone="error">{error || t("chat.rule.unavailable")}</Notice>}
      <AppDialog open={open && !disabled} onOpenChange={setOpen} title={t("chat.rule.choose")} description={t("chat.rule.fileHint")}>
        <div className="space-y-3">
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("chat.rule.search")} aria-label={t("chat.rule.search")} />
          <WorkspaceFileMenu accessToken={accessToken} workspaces={workspaces} currentWorkspaceId={workspaceId ?? personal?.id} query={query} onSelect={ref => { setError(undefined); onChange({ workspace_id: ref.workspaceId, object_id: ref.objectId }); setOpen(false) }} />
        </div>
      </AppDialog>
    </div>
  </FormField>
}
