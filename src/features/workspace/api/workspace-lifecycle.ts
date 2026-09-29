import { requestApiJson } from "@/lib/api/base-client"
import type { Workspace, WorkspaceMembership } from "@/lib/api/api-client"

export type WorkspaceAccess = {
  workspace: Workspace
  membership: WorkspaceMembership
  can_write: boolean
  can_manage_members: boolean
  can_archive: boolean
  can_restore: boolean
  can_leave: boolean
  last_owner: boolean
}
export function getWorkspaceAccess(accessToken: string, workspaceId: string) {
  return requestApiJson<WorkspaceAccess>(`/gateway/v1/workspaces/${encodeURIComponent(workspaceId)}/access`, { accessToken })
}
export function listWorkspaceDirectoryEntries(accessToken: string, status: string) {
  return requestApiJson<{ entries: { workspace: Workspace; role: string }[] }>(`/gateway/v1/workspaces/directory?${new URLSearchParams({ status })}`, { accessToken })
}

export function changeWorkspaceLifecycle(accessToken: string, workspaceId: string, action: "archive" | "restore" | "leave", expectedSessionId: string) {
  return requestApiJson(`/gateway/v1/workspaces/${workspaceId}/${action}`, { method: "POST", accessToken, expectedSessionId })
}
