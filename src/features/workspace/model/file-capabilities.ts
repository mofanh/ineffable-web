import type { WorkspaceObject } from "@/features/workspace/api/workspace-api"

/** File representation is separate from Workspace write permission. */
export function workspaceFileCapabilities(object: Pick<WorkspaceObject, "kind" | "mime_type">) {
  const mime = object.mime_type?.split(";", 1)[0].trim().toLowerCase()
  const text = !mime || mime.startsWith("text/") || ["application/json", "application/xml", "application/javascript", "application/sql"].includes(mime) || mime.endsWith("+json") || mime.endsWith("+xml")
  return { download: object.kind === "file", duplicate: object.kind === "folder" || text, text: object.kind === "file" && text }
}
