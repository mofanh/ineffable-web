import type { ToolCallView } from "@/features/chat/chat-pane-state"
import { parseLeadingJsonObject } from "../model/leading-json-object.ts"

export const WORKSPACE_WEB_PLUGIN_ID = "ineffable.web.workspace"

export type WorkspaceArtifactReference = {
  artifactId: string
  workspaceId: string
  objectId: string
  versionId: string | null
  path: string
  mimeType: string
  sizeBytes: number | null
  source: string
}

type JsonObject = Record<string, unknown>

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function inferredMimeType(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase()
  if (extension === "md" || extension === "markdown") return "text/markdown"
  if (["ts", "tsx", "js", "jsx", "rs", "py", "sh", "sql"].includes(extension ?? "")) {
    return "text/plain"
  }
  if (extension === "json") return "application/json"
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) {
    return extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`
  }
  return "application/octet-stream"
}

export function extractWorkspaceArtifact(
  tool: ToolCallView
): WorkspaceArtifactReference | null {
  if (
    tool.status !== "succeeded" ||
    (tool.name !== "publish_sandbox_file" && tool.name !== "workspace_write_file")
  ) {
    return null
  }
  const parsed = parseLeadingJsonObject(tool.output)
  const result = objectValue(parsed?.result) ?? parsed
  if (!result) return null
  const object = objectValue(result?.object) ?? result
  const workspaceId = stringValue(object?.workspace_id ?? result?.workspace_id)
  const objectId = stringValue(
    result?.object_id ?? object?.id ?? result?.id
  )
  const path = stringValue(object?.path ?? result?.path)
  if (!workspaceId || !objectId || !path) return null
  const versionId =
    stringValue(result?.version_id ?? object?.current_version_id) || null
  const mimeType =
    stringValue(result?.mime_type ?? object?.mime_type) || inferredMimeType(path)
  return {
    artifactId: `${workspaceId}:${objectId}:${versionId ?? "current"}`,
    workspaceId,
    objectId,
    versionId,
    path,
    mimeType,
    sizeBytes: numberValue(result?.size_bytes ?? object?.size_bytes),
    source: tool.name,
  }
}

export function workspaceArtifactHref(reference: WorkspaceArtifactReference) {
  return `/workspace/${encodeURIComponent(reference.workspaceId)}/objects/${encodeURIComponent(reference.objectId)}`
}
