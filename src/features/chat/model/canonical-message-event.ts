import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

export type CanonicalRenderableMessage = {
  role?: string | null
  messageType?: string | null
  content: string
  reasoningContent?: string | null
  metadata?: Record<string, unknown> | null
  scope?: string | null
  runId?: string | null
  conversationId?: string | null
  createdAt?: string | null
}

export function hasCanonicalAssistantOutput(
  messages: CanonicalRenderableMessage[]
) {
  return messages.some((message) => {
    const messageType = inferMessageType(message)
    return messageType === "output" && Boolean(message.content.trim())
  })
}

type CanonicalMessageEventContext = {
  startSeq?: number
  stream: string
  phase: string
  defaultRunId?: string | null
  conversationId?: string | null
  tsMs?: number
}

type CanonicalToolCall = { id: string; name: string; input: unknown }

function stripInlineThinkBlocks(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function inferMessageType(message: CanonicalRenderableMessage) {
  const explicit = message.messageType?.trim()
  if (explicit) return explicit
  switch (message.role?.trim()) {
    case "tool_call": return "tool_call"
    case "tool":
    case "tool_result": return "tool_result"
    case "system": return "system"
    case "user": return "input"
    default: return "output"
  }
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function canonicalToolCalls(metadata: Record<string, unknown>) {
  const canonicalMessage =
    metadata.canonical_message && typeof metadata.canonical_message === "object"
      ? (metadata.canonical_message as Record<string, unknown>)
      : null
  const rawCalls = Array.isArray(metadata.tool_calls)
    ? metadata.tool_calls
    : Array.isArray(canonicalMessage?.tool_calls)
      ? canonicalMessage.tool_calls
      : []
  return rawCalls.flatMap((raw): CanonicalToolCall[] => {
    if (!raw || typeof raw !== "object") return []
    const call = raw as Record<string, unknown>
    if (typeof call.id !== "string" || typeof call.name !== "string") return []
    return [{ id: call.id, name: call.name, input: call.input ?? {} }]
  })
}

function renderArguments(input: unknown) {
  if (typeof input === "string") return input
  try { return JSON.stringify(input ?? {}) } catch { return "{}" }
}

function messageTimestamp(message: CanonicalRenderableMessage, fallback?: number) {
  const createdAtMs = message.createdAt ? Date.parse(message.createdAt) : Number.NaN
  return Number.isFinite(createdAtMs) ? createdAtMs : fallback ?? Date.now()
}

export function canonicalMessagesToGatewayEvents(
  messages: CanonicalRenderableMessage[],
  context: CanonicalMessageEventContext
): GatewayChatStreamEvent[] {
  const events: GatewayChatStreamEvent[] = []
  const pendingOccurrences = new Map<string, string[]>()
  const occurrenceCounts = new Map<string, number>()
  let seq = context.startSeq ?? 1

  messages.forEach((message, messageIndex) => {
    const messageType = inferMessageType(message)
    const baseMetadata = message.metadata ? { ...message.metadata } : {}
    const conversationId = message.conversationId ?? context.conversationId ?? null
    const runId = message.runId ?? context.defaultRunId ?? null
    if (conversationId && baseMetadata.conversation_id === undefined) {
      baseMetadata.conversation_id = conversationId
    }
    if (runId && baseMetadata.conversation_run_id === undefined) {
      baseMetadata.conversation_run_id = runId
    }
    const scope = message.scope ??
      (typeof baseMetadata.scope === "string" ? baseMetadata.scope : null)
    const tsMs = messageTimestamp(message, context.tsMs)
    const pushEvent = (
      event: string,
      role: string,
      content: string | null,
      metadata: Record<string, unknown>
    ) => {
      events.push({ run_id: runId ?? undefined, seq, ts_ms: tsMs,
        stream: context.stream, event, phase: context.phase, scope, role,
        content, metadata })
      seq += 1
    }

    if (message.reasoningContent?.trim()) {
      pushEvent("model.reasoning.delta", "assistant", message.reasoningContent,
        { ...baseMetadata })
    }

    if (messageType === "tool_call") {
      const calls = canonicalToolCalls(baseMetadata)
      const directCallId = metadataString(baseMetadata, "tool_call_id")
      const directToolName = metadataString(baseMetadata, "tool_name")
      const normalizedCalls = calls.length ? calls : directCallId
        ? [{ id: directCallId, name: directToolName ?? "",
            input: baseMetadata.full_arguments ?? {} }]
        : []
      normalizedCalls.forEach((call, callIndex) => {
        const occurrenceCount = occurrenceCounts.get(call.id) ?? 0
        occurrenceCounts.set(call.id, occurrenceCount + 1)
        const explicitOccurrence = normalizedCalls.length === 1
          ? metadataString(baseMetadata, "transcript_occurrence_id")
          : null
        const occurrence = explicitOccurrence ?? (occurrenceCount === 0
          ? call.id
          : `${runId ?? conversationId ?? "conversation"}:${context.stream}:${messageIndex}:${callIndex}`)
        const queue = pendingOccurrences.get(call.id) ?? []
        queue.push(occurrence)
        pendingOccurrences.set(call.id, queue)
        pushEvent("tool.call.completed", "tool_call", message.content, {
          ...baseMetadata,
          tool_calls: [call],
          tool_call_id: call.id,
          tool_name: call.name,
          full_arguments: renderArguments(call.input),
          transcript_occurrence_id: occurrence,
        })
      })
      return
    }

    if (messageType === "tool_result") {
      const callId = metadataString(baseMetadata, "tool_call_id") ?? ""
      const explicitOccurrence = metadataString(baseMetadata, "transcript_occurrence_id")
      const queue = pendingOccurrences.get(callId) ?? []
      const occurrence = explicitOccurrence ?? queue.shift() ??
        `${runId ?? conversationId ?? "conversation"}:${context.stream}:${messageIndex}:result`
      if (queue.length) pendingOccurrences.set(callId, queue)
      else pendingOccurrences.delete(callId)
      pushEvent("tool.result", "tool", message.content, {
        ...baseMetadata,
        transcript_occurrence_id: occurrence,
      })
      return
    }

    const role = messageType === "system" ? "system"
      : messageType === "input" ? "user" : "assistant"
    pushEvent("assistant.snapshot", role,
      messageType === "output" || role === "assistant"
        ? stripInlineThinkBlocks(message.content) : message.content,
      baseMetadata)
  })
  return events
}
