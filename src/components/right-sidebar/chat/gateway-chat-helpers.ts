import {
  createEmptyAgentPane,
  hasAgentPaneContent,
} from "@/components/right-sidebar/chat/chat-pane-state"
import type {
  GatewayChatFinalResult,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"
import type { AssistantEntry, SubagentView } from "@/components/right-sidebar/chat/gateway-chat-types"

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

export function getToolCallId(event: GatewayChatStreamEvent) {
  return (
    getMetadataValue(event.metadata, "tool_call_id") ||
    `${event.event}-${event.seq ?? Date.now()}`
  )
}

export function getToolName(event: GatewayChatStreamEvent) {
  return getMetadataValue(event.metadata, "tool_name") || "unknown_tool"
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

export function getFinalFingerprint(result: GatewayChatFinalResult) {
  return JSON.stringify({
    output: result.output ?? null,
    session_key: result.session_key ?? null,
    agent_id: result.agent_id ?? null,
  })
}

export function isSessionKeyEvent(eventName: string) {
  return eventName === "session_key" || eventName.endsWith("session_key")
}

export function extractSessionKeyFromEvent(event: GatewayChatStreamEvent) {
  const metadataSessionKey = getMetadataValue(event.metadata, "session_key")
  if (metadataSessionKey) {
    return metadataSessionKey
  }

  return (event.content ?? "").trim()
}

export function isTextDeltaEvent(eventName: string) {
  return eventName === "text_delta" || eventName.endsWith("text_delta")
}

export function isReasoningEvent(eventName: string) {
  return eventName === "reasoning_delta" || eventName.endsWith("reasoning_delta")
}

export function isToolEvent(eventName: string) {
  return (
    eventName === "tool_call_start" ||
    eventName === "tool_call_delta" ||
    eventName === "tool_call_done" ||
    eventName === "tool_result"
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
