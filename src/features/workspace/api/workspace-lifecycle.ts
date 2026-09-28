import { requestApi, requestApiJson, createApiError, parseApiError } from "@/lib/api/base-client"
import type { Workspace } from "@/lib/api/api-client"

export function listArchivedWorkspaces(accessToken: string) {
  return requestApiJson<{ workspaces: Workspace[] }>("/gateway/v1/workspaces/archived", { accessToken })
}
export function changeWorkspaceLifecycle(accessToken: string, workspaceId: string, action: "archive" | "restore" | "leave", expectedSessionId: string) {
  return requestApiJson(`/gateway/v1/workspaces/${workspaceId}/${action}`, { method: "POST", accessToken, expectedSessionId })
}
export async function downloadArchivedFile(accessToken: string, workspaceId: string, versionId: string, expectedSessionId: string) {
  const response = await requestApi(`/gateway/v1/workspace-object-versions/${versionId}/raw`, { accessToken, workspaceId, expectedSessionId })
  if (!response.ok) throw createApiError(await parseApiError(response), response.status)
  return response.blob()
}
