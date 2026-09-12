import { canonicalMessagesToGatewayEvents } from "../model/canonical-message-event"
import { updateAssistantSegment, updateUserInputTool, transcriptSegment } from "../model/assistant-segments"
import {
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  findUserInputTool,
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

function projectConversationOutputFragment(
  entry: AssistantEntry | undefined,
  event: GatewayChatStreamEvent,
  runId: string | null
): AssistantEntry {
  const base = entry ?? createAssistantEntry("streaming", runId)
  const current = { ...base, eventCoverage: Math.max(base.eventCoverage ?? 0, event.seq ?? 0) }
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

export function projectConversationOutputEvent(
  entry: AssistantEntry | undefined,
  event: GatewayChatStreamEvent,
  runId: string | null
): AssistantEntry {
  const identity = transcriptSegment(event.metadata)
  if (!identity && !entry?.segments) return projectConversationOutputFragment(entry, event, runId)
  const base = entry ?? createAssistantEntry("streaming", runId)
  const key = identity?.id ?? "unattributed"
  const previous = base.segments?.[key]
  if (identity && event.metadata?.canonical_reconciliation === true) {
    const sequence = Number(event.metadata.canonical_message_seq)
    if (Number.isSafeInteger(sequence) && sequence <= (previous?.canonicalMessageSeqEnd ?? -1) && !previous?.canonicalDraft) return base
    let draft = previous?.canonicalDraft ?? createAssistantEntry("streaming", runId)
    const firstForMessage = sequence !== draft.canonicalMessageSeqEnd
    const metadata = { ...event.metadata }
    if (event.event === "tool.call.completed") {
      metadata.transcript_occurrence_id = getToolCallId(event)
      if (!firstForMessage) {
        metadata.reasoning_content = ""
        metadata.canonical_message = { ...(metadata.canonical_message as Record<string, unknown>), content: "", reasoning_content: "" }
      }
    }
    const converted = canonicalMessagesToGatewayEvents([{
      role: event.role, messageType: event.event === "tool.result" ? "tool_result" : event.event === "tool.call.completed" ? "tool_call" : "output",
      content: event.content ?? "", metadata, runId, reasoningContent: firstForMessage && typeof metadata.reasoning_content === "string" ? metadata.reasoning_content : null,
    }], { stream: "history", phase: "history", defaultRunId: runId })
    for (const projected of converted) draft = projectConversationOutputFragment(draft, projected, runId)
    draft = { ...draft, segmentIdentity: identity, canonicalMessageSeqEnd: sequence, eventCoverage: event.seq }
    if (event.metadata.transcript_segment_complete === true) {
      draft.pane = finalizePane(draft.pane)
      return updateAssistantSegment(base, key, draft)
    }
    return { ...base, eventCoverage: Math.max(base.eventCoverage ?? 0, event.seq ?? 0),
      segments: { ...(base.segments ?? (base.pane.blockOrder.length || base.subagentOrder.length ? { legacy: { ...base, segments: undefined } } : {})), [key]: { ...(previous ?? createAssistantEntry("streaming", runId)), segmentIdentity: identity, canonicalDraft: draft } } }
  }
  const fragment = projectConversationOutputFragment(previous, event, runId)
  fragment.segmentIdentity = identity ?? undefined
  return updateAssistantSegment(base, key, fragment)
}

export function projectConversationUserInputNeed(
  entry: AssistantEntry | undefined,
  event: GatewayChatStreamEvent,
  need: UserInputNeed
): AssistantEntry {
  const resolvedToolId = isToolEvent(event.event)
    ? buildToolView(entry?.pane ?? createAssistantEntry("streaming", need.runId).pane, event, getToolCallId, getToolName).toolId
    : null
  const projected = isToolEvent(event.event)
    ? projectConversationOutputEvent(entry, event, need.runId)
    : entry ?? createAssistantEntry("streaming", need.runId)
  const projectedToolId = isToolEvent(event.event)
    ? resolvedToolId!
    : findUserInputTool(projected.pane, need.needId, need.runId)?.id ?? `need:${need.runId}:${need.needId}`
  const existing = projected.pane.tools[projectedToolId]

  const result: AssistantEntry = {
    ...projected,
    runId: projected.runId ?? need.runId,
    pane: upsertToolInPane(projected.pane, projectedToolId, {
      id: projectedToolId,
      protocolId: existing?.protocolId ?? need.needId,
      needId: need.needId,
      name: "request_user_input",
      input: existing?.input || JSON.stringify({ questions: need.questions }),
      output: existing?.output || "",
      status: "waiting",
      runId: need.runId,
      sessionKey: need.sessionKey,
      responseMessageId: existing?.responseMessageId,
    }),
  }
  return updateUserInputTool(projected, result.pane.tools[projectedToolId])
}
