import {
  buildApiHeaders,
  createApiError,
  parseApiError,
  toApiUrl,
} from "@/lib/api/base-client"

export type SandboxPreviewSessionTicket = {
  launch_url: string
  expires_at: string
}

export async function createSandboxPreviewSession(
  accessToken: string,
  exposureId: string
) {
  const response = await fetch(
    toApiUrl(`/gateway/v1/sandbox/exposures/${exposureId}/session`),
    {
      method: "POST",
      headers: buildApiHeaders({ accessToken }),
    }
  )

  if (!response.ok) {
    throw createApiError(await parseApiError(response), response.status)
  }

  return (await response.json()) as SandboxPreviewSessionTicket
}
