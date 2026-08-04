import {
  createEmptyAgentPane,
  hasAgentPaneContent,
} from "@/features/chat/chat-pane-state"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import type { AssistantEntry, SubagentView } from "@/features/chat/gateway-chat-types"

export const STORAGE_KEYS = {
  peerId: "gateway-chat-peer-id",
  sessionKey: "gateway-chat-session-key",
}

export function readStoredValue(key: string) {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem(key) ?? ""
}

export function createPeerId() {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getInitialPeerId() {
  const stored = readStoredValue(STORAGE_KEYS.peerId).trim()
  return stored || createPeerId()
}

export function getMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : ""
}

function firstToolCall(metadata: Record<string, unknown> | null | undefined) {
  const toolCalls = metadata?.tool_calls
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null
  }

  const first = toolCalls[0]
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null
}

export function getToolCallId(event: GatewayChatStreamEvent) {
  const direct = getMetadataValue(event.metadata, "tool_call_id")
  if (direct) {
    return direct
  }

  const toolCalls = event.metadata?.tool_calls
  if (Array.isArray(toolCalls) && toolCalls.length === 1) {
    const callId = firstToolCall(event.metadata)?.id
    if (typeof callId === "string" && callId) {
      return callId
    }
  }

  return `${event.event}-${event.seq ?? Date.now()}`
}

export function getToolName(event: GatewayChatStreamEvent) {
  const direct = getMetadataValue(event.metadata, "tool_name")
  if (direct) {
    return direct
  }

  const toolCalls = event.metadata?.tool_calls
  if (Array.isArray(toolCalls) && toolCalls.length === 1) {
    const name = firstToolCall(event.metadata)?.name
    if (typeof name === "string" && name) {
      return name
    }
  }

  // Empty (not "unknown_tool") so buildToolView's `|| existing.name` keeps an
  // already-resolved tool name from earlier tool events in the same lifecycle.
  return ""
}

export function isSubScope(event: GatewayChatStreamEvent) {
  const metadataScope = getMetadataValue(event.metadata, "scope")
  const subagentId = getMetadataValue(event.metadata, "subagent_id")

  return event.scope === "sub" || metadataScope === "sub" || Boolean(subagentId)
}

export function getSubagentId(event: GatewayChatStreamEvent) {
  return getMetadataValue(event.metadata, "subagent_id")
}

export function getSubagentName(event: GatewayChatStreamEvent) {
  return getMetadataValue(event.metadata, "subagent_name") || getSubagentId(event) || "Subagent"
}

export function getEventFingerprint(event: GatewayChatStreamEvent) {
  return JSON.stringify({
    run_id: event.run_id ?? null,
    seq: event.seq ?? null,
    stream: event.stream ?? null,
    event: event.event,
    scope: event.scope ?? null,
    role: event.role ?? null,
    content: event.content ?? null,
    metadata: event.metadata ?? null,
  })
}

export function isTextDeltaEvent(eventName: string) {
  return eventName === "model.text.delta"
}

export function isReasoningEvent(eventName: string) {
  return eventName === "model.reasoning.delta"
}

export function isToolEvent(eventName: string) {
  return (
    eventName === "tool.call.started" ||
    eventName === "tool.call.delta" ||
    eventName === "tool.call.completed" ||
    eventName === "tool.result"
  )
}

export function createEmptySubagent(id: string, name: string): SubagentView {
  return {
    ...createEmptyAgentPane(),
    id,
    name,
    status: "streaming",
  }
}

export function hasAssistantEntryContent(entry: AssistantEntry) {
  if (hasAgentPaneContent(entry.pane)) {
    return true
  }

  return entry.subagentOrder.some((subagentId) =>
    hasAgentPaneContent(entry.subagents[subagentId] ?? createEmptySubagent(subagentId, subagentId))
  )
}
