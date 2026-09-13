export type ImageReference = {
  workspace_id: string
  object_id: string
  version_id: string
  mime_type: "image/png" | "image/jpeg" | "image/webp"
  width: number
  height: number
  size_bytes: number
}

export function imageReferences(value: unknown): ImageReference[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ImageReference => {
    if (!item || typeof item !== "object") return false
    const id = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
    return [item.workspace_id, item.object_id, item.version_id].every((value) => typeof value === "string" && id.test(value))
      && ["image/png", "image/jpeg", "image/webp"].includes(item.mime_type)
      && Number.isInteger(item.width) && item.width > 0 && Number.isInteger(item.height) && item.height > 0
      && item.width * item.height <= 16_000_000 && Number.isInteger(item.size_bytes) && item.size_bytes > 0 && item.size_bytes <= 10 * 1024 * 1024
  }).slice(0, 4)
}

