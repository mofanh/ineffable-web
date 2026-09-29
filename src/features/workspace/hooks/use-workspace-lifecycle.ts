import { clearApiResourceCache, invalidateApiResourceCache } from "@/lib/app/use-api-resource"
import { captureAuthSession } from "@/lib/api/auth-session-runtime"
import * as React from "react"
import { matchPath, useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useAuthSession } from "@/features/auth/app-session"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { normalizeAppError } from "@/lib/app/api-errors"
import { changeWorkspaceLifecycle } from "../api/workspace-lifecycle"

export function useWorkspaceLifecycle() {
  const { t } = useTranslation()
  const { accessToken, currentSessionId, refreshAppData } = useAuthSession()
  const location = useLocation(), navigate = useNavigate()
  const scope = `${currentSessionId}:${location.key}`
  const latest = React.useRef(scope); latest.current = scope
  React.useLayoutEffect(() => { latest.current = scope; return () => { latest.current = "unmounted" } }, [scope])
  const busy = React.useRef(false)
  const [pending, setPending] = React.useState(false)
  const run = React.useCallback(async (id: string, name: string, action: "archive" | "restore" | "leave", done?: () => void) => {
    if (!accessToken || !currentSessionId || busy.current) return
    const sameSession = captureAuthSession(accessToken)
    busy.current = true; setPending(true)
    try {
      if (!await confirm({ title: t(`workspaceLifecycle.${action}Title`, { name }), description: t(`workspaceLifecycle.${action}Hint`), confirmLabel: t(`workspaceLifecycle.${action}`), variant: action === "restore" ? "default" : "destructive" })) return
      if (latest.current !== scope) return
      await changeWorkspaceLifecycle(accessToken, id, action, currentSessionId)
      if (!sameSession()) return
      invalidateApiResourceCache(["archived-workspaces", currentSessionId])
      for (const status of ["active", "archived"]) invalidateApiResourceCache(["workspace-directory", currentSessionId, status])
      clearApiResourceCache(["workspace-access", currentSessionId, id])
      invalidateApiResourceCache(["workspace-access", currentSessionId, id])
      invalidateApiResourceCache(["workspace-members", currentSessionId, id])
      if (latest.current === scope) {
        notify.success({ title: t("workspaceLifecycle.saved") })
        done?.()
        const target = matchPath("/workspace/:workspaceId/*", location.pathname) ?? matchPath("/team-spaces/:workspaceId/members", location.pathname)
        if (action === "leave" && target?.params.workspaceId === id) navigate("/team-spaces", { replace: true })
      }
      // Global facts still need reconciliation after a route change; only local navigation is fenced.
      const refreshed = await refreshAppData({ fresh: true })
      if (!refreshed && sameSession()) notify.error({ title: t("workspaceLifecycle.refreshFailed") })
    } catch (error) {
      if (latest.current === scope) {
        const failure = normalizeAppError(error)
        const reason = (failure.cause as { reason?: string } | undefined)?.reason
        const reasonKeys: Record<string, string> = {
          workspace_suspended: "interaction.suspendedSpace",
          workspace_owner_changed: "interaction.ownerChanged",
          workspace_quota_exceeded: "interaction.spaceQuota",
          workspace_last_owner: "workspaceLifecycle.lastOwner",
        }
        notify.error({ title: t("workspaceLifecycle.failed"), description: reason && reasonKeys[reason] ? t(reasonKeys[reason]) : failure.message })
        invalidateApiResourceCache(["workspace-access", currentSessionId, id])
      }
    } finally { busy.current = false; if (latest.current !== "unmounted") setPending(false) }
  }, [accessToken, currentSessionId, location.pathname, navigate, refreshAppData, scope, t])
  return { run, pending }
}
