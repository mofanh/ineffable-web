import * as React from "react"
import { useAuthSession } from "@/features/auth/app-session"
import { useApiResource } from "@/lib/app/use-api-resource"
import { getWorkspaceAccess } from "../api/workspace-lifecycle"

export function useWorkspaceAccess(workspaceId: string | undefined, enabled = true) {
  const { accessToken, currentSessionId } = useAuthSession()
  const resource = useApiResource({
    enabled: enabled && Boolean(accessToken && workspaceId),
    cacheKey: ["workspace-access", currentSessionId, workspaceId],
    staleTime: 0,
    load: React.useCallback(() => getWorkspaceAccess(accessToken!, workspaceId!), [accessToken, workspaceId]),
  })
  const { reload } = resource
  React.useEffect(() => {
    if (!enabled) return
    const refresh = () => { if (document.visibilityState === "visible") void reload() }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [enabled, reload])
  // Authority errors must not leave cached write permissions in use.
  const access = resource.data && resource.error
    ? { ...resource.data, can_write: false, can_manage_members: false, can_archive: false, can_restore: false, can_leave: false }
    : resource.data
  return { ...resource, access }
}
