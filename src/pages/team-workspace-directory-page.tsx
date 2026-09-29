import * as React from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AppPage, DataState } from "@/components/app"
import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/features/auth/app-session"
import { listWorkspaceDirectoryEntries } from "@/features/workspace/api/workspace-lifecycle"
import { useApiResource } from "@/lib/app/use-api-resource"

export default function TeamWorkspaceDirectoryPage() {
  const { t } = useTranslation()
  const { accessToken, currentSessionId } = useAuthSession()
  const [params] = useSearchParams()
  const status = params.get("status") === "archived" ? "archived" : "active"
  const resource = useApiResource({
    enabled: Boolean(accessToken), cacheKey: ["workspace-directory", currentSessionId, status], staleTime: 0,
    load: React.useCallback(() => listWorkspaceDirectoryEntries(accessToken!, status), [accessToken, status]),
  })
  return <AppPage title={t("shell.breadcrumbs.teamSpaces")} actions={<Button asChild><Link to="/team-spaces/new">{t("shell.breadcrumbs.createSpace")}</Link></Button>}>
    <nav aria-label={t("interaction.spaceFilter")} className="flex gap-2">
      {(["active", "archived"] as const).map(value => <Button key={value} variant={status === value ? "secondary" : "ghost"} asChild><Link aria-current={status === value ? "page" : undefined} to={value === "active" ? "/team-spaces" : "/team-spaces?status=archived"}>{t(value === "active" ? "interaction.activeSpaces" : "workspaceLifecycle.archived")}</Link></Button>)}
    </nav>
    {resource.error && resource.data && <p role="alert" className="text-sm text-destructive">{resource.error.message}</p>}
    <DataState state={resource.state} error={resource.error} onRetry={resource.reload} empty={resource.data?.entries.length === 0} emptyTitle={t(status === "archived" ? "workspaceLifecycle.empty" : "sidebar.sections.emptyTeam")}>
      <div className="divide-y rounded-xl border">{resource.data?.entries.map(({workspace, role}) => <div key={workspace.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Link to={`/workspace/${workspace.id}/objects`} className="min-w-0 flex-1 break-words font-medium hover:underline">{workspace.name}</Link>
        <span className="text-xs text-muted-foreground">{t(`team.role.${role}`)}</span>
      </div>)}</div>
    </DataState>
  </AppPage>
}
