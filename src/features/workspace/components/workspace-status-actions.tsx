import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import type { WorkspaceAccess } from "../api/workspace-lifecycle"
import type { useWorkspaceLifecycle } from "../hooks/use-workspace-lifecycle"

export function WorkspaceStatusActions({ access, run, pending }: { access: WorkspaceAccess } & ReturnType<typeof useWorkspaceLifecycle>) {
  const { t } = useTranslation()
  const { workspace } = access
  if (workspace.workspace_type !== "team") return null
  const archived = workspace.status === "archived"
  return <>
    <DropdownMenuSeparator />
    <DropdownMenuItem asChild><Link to={`/team-spaces/${workspace.id}/members`}>{t("team.members.title")}</Link></DropdownMenuItem>
    {access.can_archive && <DropdownMenuItem disabled={pending} onClick={() => void run(workspace.id, workspace.name, "archive")}>{t("workspaceLifecycle.archive")}</DropdownMenuItem>}
    {access.can_restore && <DropdownMenuItem disabled={pending} onClick={() => void run(workspace.id, workspace.name, "restore")}>{t("workspaceLifecycle.restore")}</DropdownMenuItem>}
    {access.can_leave && <DropdownMenuItem disabled={pending} onClick={() => void run(workspace.id, workspace.name, "leave")}>{t("workspaceLifecycle.leave")}</DropdownMenuItem>}
    {access.last_owner && <DropdownMenuLabel className="max-w-64 whitespace-normal text-xs font-normal text-muted-foreground">{t(archived ? "interaction.archivedOwner" : "workspaceLifecycle.lastOwner")}</DropdownMenuLabel>}
  </>
}
