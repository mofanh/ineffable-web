import {
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  finalizePane,
  resumeTrailingThinkBlock,
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
import type { UserInputNeed } from "@/features/chat/model/chat-parsing"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { projectDeclaredWebNode } from "@/features/chat/runtime/plugin-web-node-projection"

function projectPaneEvent(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent,
  resumeFromHistory = false
) {
  const content = event.content ?? ""
  const shouldResumeTrailingThink =
    resumeFromHistory &&
    (isReasoningEvent(event.event) ||
      (isTextDeltaEvent(event.event) && !content.includes("<think>")))
  const basePane = shouldResumeTrailingThink
    ? resumeTrailingThinkBlock(pane)
    : pane
  let nextPane: AgentPaneState
  if (isTextDeltaEvent(event.event)) {
    nextPane = applyTextDeltaToPane(basePane, content)
  } else if (isReasoningEvent(event.event)) {
    nextPane = applyReasoningDeltaToPane(basePane, content)
  } else if (event.event === "assistant.snapshot") {
    nextPane = applyMessageToPane(basePane, content)
  } else {
    nextPane = appendUpdateToPane(basePane, content)
  }
  return projectDeclaredWebNode(nextPane, event)
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
  return projectDeclaredWebNode(upsertToolInPane(pane, toolId, tool), event)
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
        : projectPaneEvent(current.pane, event, current.status === "done"),
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
      : projectPaneEvent(existing, event, existing.status === "done")),
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

export function projectConversationUserInputNeed(
  entry: AssistantEntry | undefined,
  event: GatewayChatStreamEvent,
  need: UserInputNeed
): AssistantEntry {
  const projected = isToolEvent(event.event)
    ? projectConversationOutputEvent(entry, event, need.runId)
    : entry ?? createAssistantEntry("streaming", need.runId)
  const existing = projected.pane.tools[need.needId]

  return {
    ...projected,
    runId: projected.runId ?? need.runId,
    pane: upsertToolInPane(projected.pane, need.needId, {
      id: need.needId,
      name: "request_user_input",
      input: existing?.input || JSON.stringify({ questions: need.questions }),
      output: existing?.output || "",
      status: "waiting",
      runId: need.runId,
      sessionKey: need.sessionKey,
      answer: existing?.answer,
    }),
  }
}
