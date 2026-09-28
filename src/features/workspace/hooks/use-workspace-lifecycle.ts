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
    busy.current = true; setPending(true)
    try {
      if (!await confirm({ title: t(`workspaceLifecycle.${action}Title`, { name }), description: t(`workspaceLifecycle.${action}Hint`), confirmLabel: t(`workspaceLifecycle.${action}`), variant: action === "restore" ? "default" : "destructive" })) return
      if (latest.current !== scope) return
      await changeWorkspaceLifecycle(accessToken, id, action, currentSessionId)
      if (latest.current !== scope) return
      notify.success({ title: t("workspaceLifecycle.saved") })
      done?.()
      if (action !== "restore" && location.pathname.includes(id)) navigate("/team-spaces/archived", { replace: true })
      try { await refreshAppData() } catch (error) {
        if (latest.current === scope) notify.error({ title: t("workspaceLifecycle.refreshFailed"), description: normalizeAppError(error).message })
      }
    } catch (error) {
      if (latest.current === scope) notify.error({ title: t("workspaceLifecycle.failed"), description: normalizeAppError(error).message })
    } finally { busy.current = false; setPending(false) }
  }
  return { run, pending }
}
