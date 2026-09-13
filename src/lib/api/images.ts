import { createApiError, parseApiError, requestApi, requestApiJson } from "./base-client"

import { imageReferences, type ImageReference } from "../image-reference"
export { imageReferences, type ImageReference } from "../image-reference"

export async function uploadImage(accessToken: string, workspaceId: string, file: File, signal?: AbortSignal) {
  const response = await requestApi(`/gateway/v1/workspaces/${encodeURIComponent(workspaceId)}/images`, {
    method: "POST", accessToken, workspaceId, body: file, signal,
    headers: { "Content-Type": "application/octet-stream" },
  })
  if (!response.ok) throw createApiError(await parseApiError(response), response.status)
  const result = await response.json() as { image?: unknown }
  const image = imageReferences([result.image])[0]
  if (!image) throw createApiError("image_invalid_reference")
  return image
}

export async function getImageReference(accessToken: string, versionId: string) {
  const result = await requestApiJson<{ image: unknown }>(`/gateway/v1/workspace-object-versions/${encodeURIComponent(versionId)}/image`, { accessToken })
  const image = imageReferences([result.image])[0]
  if (!image) throw createApiError("image_invalid_reference")
  return image
}

export async function loadImageBlob(accessToken: string, image: ImageReference, signal: AbortSignal, preview = false) {
  const response = await requestApi(`/gateway/v1/workspace-object-versions/${encodeURIComponent(image.version_id)}/${preview ? "image-preview" : "raw"}`, {
    accessToken, workspaceId: image.workspace_id, signal,
  })
  if (!response.ok) throw createApiError(await parseApiError(response), response.status)
  const blob = await response.blob()
  if (blob.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
    throw createApiError("image_invalid_content")
  }
  return blob
}
