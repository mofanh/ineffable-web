import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export type ConversationEventIdentity = {
  conversationId: string
  runId: string
}

export function getConversationEventIdentity(
  event: GatewayChatStreamEvent
): ConversationEventIdentity | null {
  const metadata = objectValue(event.metadata)
  const conversationId = nonEmptyString(metadata?.conversation_id)
  const runId =
    nonEmptyString(metadata?.conversation_run_id) ??
    nonEmptyString(event.run_id)

  if (!conversationId || !runId) {
    return null
  }

  return { conversationId, runId }
}

export function eventBelongsToConversation(
  event: GatewayChatStreamEvent,
  conversationId: string | null
) {
  const identity = getConversationEventIdentity(event)
  return Boolean(
    identity && conversationId && identity.conversationId === conversationId
  )
}
