import { invalidateApiResourceCache } from "@/lib/app/use-api-resource"
import { captureAuthSession } from "@/lib/api/auth-session-runtime"
import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
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
  async function run(id: string, name: string, action: "archive" | "restore" | "leave", done?: () => void) {
    if (!accessToken || !currentSessionId || busy.current) return
    const sameSession = captureAuthSession(accessToken)
    busy.current = true; setPending(true)
    try {
      if (!await confirm({ title: t(`workspaceLifecycle.${action}Title`, { name }), description: t(`workspaceLifecycle.${action}Hint`), confirmLabel: t(`workspaceLifecycle.${action}`), variant: action === "restore" ? "default" : "destructive" })) return
      if (latest.current !== scope) return
      await changeWorkspaceLifecycle(accessToken, id, action, currentSessionId)
      if (!sameSession()) return
      invalidateApiResourceCache(["archived-workspaces", currentSessionId])
      if (latest.current === scope) {
        notify.success({ title: t("workspaceLifecycle.saved") })
        done?.()
        if (action !== "restore" && location.pathname.includes(id)) navigate("/team-spaces/archived", { replace: true })
      }
      // Global facts still need reconciliation after a route change; only local navigation is fenced.
      const refreshed = await refreshAppData({ fresh: true })
      if (!refreshed && sameSession()) notify.error({ title: t("workspaceLifecycle.refreshFailed") })
    } catch (error) {
      if (latest.current === scope) notify.error({ title: t("workspaceLifecycle.failed"), description: normalizeAppError(error).message })
    } finally { busy.current = false; setPending(false) }
  }
  return { run, pending }
}
