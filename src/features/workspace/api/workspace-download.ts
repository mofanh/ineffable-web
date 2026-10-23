import { requestApi, createApiError, parseApiError } from "@/lib/api/base-client"
import { captureAuthSession } from "@/lib/api/auth-session-runtime"

export async function downloadWorkspaceFile(accessToken: string, workspaceId: string, objectId: string) {
  const isCurrent = captureAuthSession(accessToken)
  const response = await requestApi(`/gateway/v1/workspace-objects/${encodeURIComponent(objectId)}/download`, { accessToken, workspaceId })
  if (!response.ok) throw createApiError(await parseApiError(response), response.status)
  const blob = await response.blob()
  if (!isCurrent()) throw createApiError("Authentication session changed", 409)
  return blob
}
