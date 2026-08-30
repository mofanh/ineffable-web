import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

export type CanonicalRenderableMessage = {
  role?: string | null
  messageType?: string | null
  content: string
  metadata?: Record<string, unknown> | null
  scope?: string | null
  runId?: string | null
  conversationId?: string | null
  createdAt?: string | null
}

type CanonicalMessageEventContext = {
  seq: number
  stream: string
  phase: string
  defaultRunId?: string | null
  conversationId?: string | null
  tsMs?: number
}

function stripInlineThinkBlocks(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function inferMessageType(message: CanonicalRenderableMessage) {
  const explicit = message.messageType?.trim()
  if (explicit) return explicit

  switch (message.role?.trim()) {
    case "tool_call":
      return "tool_call"
    case "tool":
    case "tool_result":
      return "tool_result"
    case "system":
      return "system"
    case "user":
      return "input"
    default:
      return "output"
  }
}

export function canonicalMessageToGatewayEvent(
  message: CanonicalRenderableMessage,
  context: CanonicalMessageEventContext
): GatewayChatStreamEvent {
  const messageType = inferMessageType(message)
  const metadata = message.metadata ? { ...message.metadata } : {}
  const conversationId = message.conversationId ?? context.conversationId ?? null
  if (conversationId && metadata.conversation_id === undefined) {
    metadata.conversation_id = conversationId
  }

  const runId = message.runId ?? context.defaultRunId ?? null
  if (runId && metadata.conversation_run_id === undefined) {
    metadata.conversation_run_id = runId
  }

  let event = "assistant.snapshot"
  let role = message.role ?? "assistant"
  if (messageType === "tool_call") {
    event = "tool.call.completed"
    role = "tool_call"
  } else if (messageType === "tool_result") {
    event = "tool.result"
    role = "tool"
  } else if (messageType === "output") {
    role = "assistant"
  } else if (messageType === "system") {
    role = "system"
  } else if (messageType === "input") {
    role = "user"
  }

  const createdAtMs = message.createdAt ? Date.parse(message.createdAt) : Number.NaN
  return {
    run_id: runId ?? undefined,
    seq: context.seq,
    ts_ms: Number.isFinite(createdAtMs)
      ? createdAtMs
      : context.tsMs ?? Date.now(),
    stream: context.stream,
    event,
    phase: context.phase,
    scope:
      message.scope ??
      (typeof metadata.scope === "string" ? metadata.scope : null),
    role,
    content:
      messageType === "output" || role === "assistant"
        ? stripInlineThinkBlocks(message.content)
        : message.content,
    metadata,
  }
}
