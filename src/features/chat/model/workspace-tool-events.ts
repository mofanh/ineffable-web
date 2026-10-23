import { imageReferences } from "@/lib/image-reference"
import { objectValue, stringValue } from "@/features/chat/model/chat-parsing"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { dispatchWorkspaceObjectsChanged, type WorkspaceObjectsChangedDetail } from "@/lib/workspace-events"

// Both realtime and restored results carry the same service-owned mutation facts.
// Tool labels, command arguments and arbitrary stdout never decide side effects.
export function notifyWorkspaceOutputEvent(event: GatewayChatStreamEvent) {
  if (event.event !== "model.images" && event.event !== "tool.result") return
  const changed = new Set<string>()
  const changes = event.metadata?.workspace_changes
  if (event.event === "tool.result" && event.metadata?.settlement_status === "succeeded" && Array.isArray(changes)) {
    for (const change of changes) {
      const value = objectValue(change)
      const workspaceId = stringValue(value?.workspace_id)
      const objectId = stringValue(value?.object_id)
      const action = stringValue(value?.action)
      if (!workspaceId || !objectId || !["write_file", "create_folder", "rename_move", "delete"].includes(action)) continue
      changed.add(workspaceId)
      dispatchWorkspaceObjectsChanged({ workspaceId, objectId, path: stringValue(value?.path) || null,
        versionId: stringValue(value?.version_id) || null, action: action as WorkspaceObjectsChangedDetail["action"], source: "agent" })
    }
  }
  for (const image of imageReferences(event.metadata?.images)) {
    if (changed.has(image.workspace_id)) continue
    changed.add(image.workspace_id)
    dispatchWorkspaceObjectsChanged({ workspaceId: image.workspace_id, objectId: image.object_id,
      versionId: image.version_id, action: "create_file", source: "agent" })
  }
}
