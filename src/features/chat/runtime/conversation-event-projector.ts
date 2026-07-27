import {
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  finalizePane,
  upsertToolInPane,
  type AgentPaneState,
} from "@/features/chat/chat-pane-state"
import {
  createEmptySubagent,
  getSubagentId,
  getSubagentName,
  getToolCallId,
  getToolName,
  isReasoningEvent,
  isSubScope,
  isTextDeltaEvent,
  isToolEvent,
} from "@/features/chat/gateway-chat-helpers"
import { createAssistantEntry } from "@/features/chat/model/chat-history"
import type {
  AssistantEntry,
  SubagentView,
} from "@/features/chat/gateway-chat-types"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

function projectPaneEvent(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent
) {
  const content = event.content ?? ""
  if (isTextDeltaEvent(event.event)) {
    return applyTextDeltaToPane(pane, content)
  }
  if (isReasoningEvent(event.event)) {
    return applyReasoningDeltaToPane(pane, content)
  }
  if (event.event === "assistant.snapshot") {
    return applyMessageToPane(pane, content)
  }
  return appendUpdateToPane(pane, content)
}

function projectToolEvent(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent
) {
  const { toolId, tool } = buildToolView(
    pane,
    event,
    getToolCallId,
    getToolName
  )
  return upsertToolInPane(pane, toolId, tool)
}

export function projectConversationOutputEvent(
  entry: AssistantEntry | undefined,
  event: GatewayChatStreamEvent,
  runId: string | null
): AssistantEntry {
  const current = entry ?? createAssistantEntry("streaming", runId)
  if (!isSubScope(event)) {
    return {
      ...current,
      runId: current.runId ?? runId,
      status: current.status === "error" ? "error" : "streaming",
      pane: isToolEvent(event.event)
        ? projectToolEvent(current.pane, event)
        : projectPaneEvent(current.pane, event),
    }
  }

  const subagentId = getSubagentId(event) || `subagent-${event.seq}`
  const subagentName = getSubagentName(event)
  const existing =
    current.subagents[subagentId] ??
    createEmptySubagent(subagentId, subagentName)
  let nextSubagent = {
    ...existing,
    name: subagentName,
    ...(isToolEvent(event.event)
      ? projectToolEvent(existing, event)
      : projectPaneEvent(existing, event)),
  } as SubagentView

  if (event.event === "subagent.completed") {
    nextSubagent = {
      ...finalizePane(nextSubagent),
      id: nextSubagent.id,
      name: nextSubagent.name,
      status: "done",
    }
  }

  return {
    ...current,
    runId: current.runId ?? runId,
    subagentOrder: current.subagentOrder.includes(subagentId)
      ? current.subagentOrder
      : [...current.subagentOrder, subagentId],
    subagents: {
      ...current.subagents,
      [subagentId]: nextSubagent,
    },
  }
}
