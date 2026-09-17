import { imageReferences } from "@/lib/image-reference"
import { getToolName } from "@/features/chat/gateway-chat-helpers"
import {
  objectValue,
  parseJsonObject,
  stringValue,
} from "@/features/chat/model/chat-parsing"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { dispatchWorkspaceObjectsChanged } from "@/lib/workspace-events"

export function notifyWorkspaceOutputEvent(event: GatewayChatStreamEvent) {
  if (event.event === "model.images" || event.event === "tool.result") {
    // The caller already deduplicates envelope identities. Refresh once per
    // workspace in this bounded batch, using persisted typed references only.
    const images = imageReferences(event.metadata?.images)
    const workspaces = new Set<string>()
    for (const image of images) {
      if (workspaces.has(image.workspace_id)) continue
      workspaces.add(image.workspace_id)
      dispatchWorkspaceObjectsChanged({ workspaceId: image.workspace_id, objectId: image.object_id,
        versionId: image.version_id, action: "create_file", source: "agent" })
    }
    if (images.length) return
  }
  if (event.event !== "tool.result") {
    return
  }

  const toolName = getToolName(event)
  const action =
    toolName === "workspace_write_file"
      ? "write_file"
      : toolName === "workspace_create_folder"
        ? "create_folder"
        : null
  if (!action) {
    return
  }

  const result = parseJsonObject(event.content)
  const object = objectValue(result?.object) ?? result
  const workspaceId = stringValue(object?.workspace_id ?? result?.workspace_id)
  if (!workspaceId) {
    return
  }

  dispatchWorkspaceObjectsChanged({
    workspaceId,
    objectId: stringValue(object?.id ?? result?.id) || null,
    path: stringValue(object?.path ?? result?.path) || null,
    action,
    versionId: stringValue(result?.version_id) || null,
    source: "agent",
  })
}
