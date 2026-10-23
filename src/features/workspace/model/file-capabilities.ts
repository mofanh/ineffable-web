import type { WorkspaceObject } from "@/features/workspace/api/workspace-api"

/** Match Gateway text-write MIME types; write permission is checked separately. */
export function workspaceFileCapabilities(object: Pick<WorkspaceObject, "kind" | "mime_type">) {
  const mime = object.mime_type?.trim().toLowerCase()
  const text = !mime || mime.startsWith("text/") || ["application/json", "application/xml", "application/javascript", "application/x-yaml", "application/yaml"].includes(mime)
  return { download: object.kind === "file", duplicate: object.kind === "folder" || text, text: object.kind === "file" && text }
}
