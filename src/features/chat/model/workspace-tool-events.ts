import { imageReferences } from "@/lib/image-reference"
import { objectValue, stringValue } from "@/features/chat/model/chat-parsing"
import { transcriptSegment } from "./assistant-segments"
import { projectConversationMessageEvents } from "./chat-history"
import type { ConversationMessageRecord } from "@/features/chat/api/chat-api"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { dispatchWorkspaceObjectsChanged, type WorkspaceObjectsChangedDetail } from "@/lib/workspace-events"

const OBSERVATION_LIMIT = 1024

function notifyChange(detail: WorkspaceObjectsChangedDetail, identity: string | null, observed?: Set<string>) {
  if (identity && observed) {
    if (observed.has(identity)) return
    observed.add(identity)
    if (observed.size > OBSERVATION_LIMIT) observed.delete(observed.values().next().value!)
  }
  dispatchWorkspaceObjectsChanged({ ...detail, source: "agent", revalidate: true })
}

// Realtime and canonical recovery share the service-owned facts and decoder.
// Historical facts only invalidate: a past delete must never delete today's file.
export function notifyWorkspaceOutputMessages(messages: ConversationMessageRecord[], observed: Set<string>) {
  for (const event of projectConversationMessageEvents(messages)) notifyWorkspaceOutputEvent(event, observed)
}

export function notifyWorkspaceOutputEvent(event: GatewayChatStreamEvent, observed?: Set<string>) {
  if (event.event !== "model.images" && event.event !== "tool.result" &&
      !(event.event === "assistant.snapshot" && event.role === "assistant")) return
  const changes = event.metadata?.workspace_changes
  if (event.event === "tool.result" && event.metadata?.settlement_status === "succeeded" && Array.isArray(changes)) {
    const segment = transcriptSegment(event.metadata)
    const callId = stringValue(event.metadata?.tool_call_id)
    for (const change of changes) {
      const value = objectValue(change)
      const workspaceId = stringValue(value?.workspace_id)
      const objectId = stringValue(value?.object_id)
      const action = stringValue(value?.action)
      const versionId = stringValue(value?.version_id) || null
      if (!workspaceId || !objectId || !["write_file", "create_folder", "rename_move", "delete"].includes(action)) continue
      // Tool IDs may repeat across turns. Only the fixed segment + call identity
      // (or an immutable written version) can deduplicate live/canonical handoff.
      const occurrence = segment && callId && event.run_id
        ? [event.run_id, segment.id, callId]
        : action === "write_file" && versionId ? [versionId] : null
      const identity = occurrence ? JSON.stringify([workspaceId, objectId, action, ...occurrence]) : null
      notifyChange({ workspaceId, objectId, path: stringValue(value?.path) || null,
        versionId, action: action as WorkspaceObjectsChangedDetail["action"] }, identity, observed)
    }
  }
  const images = new Set<string>()
  for (const image of imageReferences(event.metadata?.images)) {
    const identity = JSON.stringify([image.workspace_id, image.object_id, "image", image.version_id])
    if (images.has(identity)) continue
    images.add(identity)
    notifyChange({ workspaceId: image.workspace_id, objectId: image.object_id,
      versionId: image.version_id, action: "create_file" }, identity, observed)
  }
}
