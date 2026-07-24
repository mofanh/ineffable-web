import {
  createApiError,
  parseApiError,
  requestApi,
} from "@/lib/api/base-client"

export type SandboxPreviewSessionTicket = {
  launch_url: string
  expires_at: string
}

export async function createSandboxPreviewSession(
  accessToken: string,
  exposureId: string
) {
  const response = await requestApi(
    `/gateway/v1/sandbox/exposures/${exposureId}/session`,
    {
      method: "POST",
      accessToken,
    }
  )

  if (!response.ok) {
    throw createApiError(await parseApiError(response), response.status)
  }

  return (await response.json()) as SandboxPreviewSessionTicket
}
