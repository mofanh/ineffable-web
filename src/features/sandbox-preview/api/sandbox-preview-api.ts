import { requestApiJson } from "@/lib/api/base-client"
import { getCurrentAuthSessionId } from "@/lib/api/auth-session-runtime"

export type SandboxPreviewSessionTicket = { launch_url: string; expires_at: string }
const pending = new Map<string, Promise<SandboxPreviewSessionTicket>>()

export function createSandboxPreviewSession(accessToken: string, exposureId: string) {
  const sessionId = getCurrentAuthSessionId()
  const key = JSON.stringify([sessionId, exposureId])
  const existing = pending.get(key)
  if (existing) return existing
  const request = requestApiJson<SandboxPreviewSessionTicket>(`/gateway/v1/sandbox/exposures/${encodeURIComponent(exposureId)}/session`, { method: "POST", accessToken, expectedSessionId: sessionId ?? undefined })
  pending.set(key, request)
  const release = () => { if (pending.get(key) === request) pending.delete(key) }
  void request.then(release, release)
  return request
}
