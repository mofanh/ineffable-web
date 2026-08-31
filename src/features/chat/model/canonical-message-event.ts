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
    return (messageType === "output" || messageType === "tool_call") &&
      Boolean(message.content.trim())
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function canonicalMessage(metadata: Record<string, unknown>) {
  return objectValue(metadata.canonical_message)
}

function canonicalProjectionMetadata(metadata: Record<string, unknown>) {
  const canonical = canonicalMessage(metadata)
  const extraFields = objectValue(canonical?.extra_fields)
  // Top-level transport metadata is authoritative. The nested fallback keeps
  // older persisted canonical messages renderable after this contract change.
  return { ...(extraFields ?? {}), ...metadata }
}

function canonicalReasoningContent(
  message: CanonicalRenderableMessage,
  metadata: Record<string, unknown>
) {
  if (message.reasoningContent?.trim()) return message.reasoningContent
  const canonicalReasoning = canonicalMessage(metadata)?.reasoning_content
  return typeof canonicalReasoning === "string" && canonicalReasoning.trim()
    ? canonicalReasoning
    : null
}

function reasoningOwnerKey(
  metadata: Record<string, unknown>,
  runId: string | null,
  conversationId: string | null
) {
  const subagentId = metadataString(metadata, "subagent_id") ?? "main"
  return `${runId ?? conversationId ?? "conversation"}:${subagentId}`
}

function reasoningCallIdentity(
  metadata: Record<string, unknown>,
  callId: string,
  runId: string | null,
  conversationId: string | null
) {
  return `${reasoningOwnerKey(metadata, runId, conversationId)}:call:${callId}`
}

function reasoningIdentityKeys(
  metadata: Record<string, unknown>,
  runId: string | null,
  conversationId: string | null
) {
  const owner = reasoningOwnerKey(metadata, runId, conversationId)
  const keys: string[] = []
  const canonicalMessageSeq = metadata.canonical_message_seq
  if (typeof canonicalMessageSeq === "number" ||
      (typeof canonicalMessageSeq === "string" && canonicalMessageSeq.trim())) {
    keys.push(`${owner}:canonical:${canonicalMessageSeq}`)
  }
  const callIds = new Set<string>()
  const directCallId = metadataString(metadata, "tool_call_id")
  if (directCallId) callIds.add(directCallId)
  canonicalToolCalls(metadata).forEach((call) => callIds.add(call.id))
  callIds.forEach((callId) => {
    keys.push(reasoningCallIdentity(metadata, callId, runId, conversationId))
  })
  return keys
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
  const seenReasoningIdentities = new Set<string>()
  let seq = context.startSeq ?? 1

  messages.forEach((message, messageIndex) => {
    const messageType = inferMessageType(message)
    const baseMetadata = canonicalProjectionMetadata(
      message.metadata ? { ...message.metadata } : {}
    )
    const conversationId = message.conversationId ?? context.conversationId ?? null
    const runId = message.runId ?? context.defaultRunId ?? null
    if (conversationId && baseMetadata.conversation_id === undefined) {
      baseMetadata.conversation_id = conversationId
    }
    if (runId && baseMetadata.conversation_run_id === undefined) {
      baseMetadata.conversation_run_id = runId
    }
    const scope = typeof baseMetadata.scope === "string" && baseMetadata.scope.trim()
      ? baseMetadata.scope.trim()
      : message.scope ?? null
    const tsMs = messageTimestamp(message, context.tsMs)
    let projectedWebView = false
    const pushEvent = (
      event: string,
      role: string,
      content: string | null,
      metadata: Record<string, unknown>
    ) => {
      let eventMetadata = metadata
      if (metadata.web_view !== undefined) {
        if (projectedWebView) {
          eventMetadata = { ...metadata }
          delete eventMetadata.web_view
        } else {
          projectedWebView = true
        }
      }
      events.push({ run_id: runId ?? undefined, seq, ts_ms: tsMs,
        stream: context.stream, event, phase: context.phase, scope, role,
        content, metadata: eventMetadata })
      seq += 1
    }

    const reasoningContent = canonicalReasoningContent(message, baseMetadata)
    const reasoningIdentities = reasoningIdentityKeys(
      baseMetadata, runId, conversationId
    )
    const reasoningAlreadyProjected = reasoningIdentities.length > 0 &&
      reasoningIdentities.some((identity) => seenReasoningIdentities.has(identity))
    if (reasoningContent?.trim() && !reasoningAlreadyProjected) {
      pushEvent("model.reasoning.delta", "assistant", reasoningContent,
        { ...baseMetadata })
    }
    if (reasoningContent?.trim()) {
      reasoningIdentities.forEach((identity) => seenReasoningIdentities.add(identity))
    }

    if (messageType === "tool_call") {
      const calls = canonicalToolCalls(baseMetadata)
      const directCallId = metadataString(baseMetadata, "tool_call_id")
      const directToolName = metadataString(baseMetadata, "tool_name")
      // History projection has already expanded a canonical parallel batch into
      // one occurrence per message. Prefer that direct identity; resume keeps
      // the original batch shape and therefore falls back to tool_calls[].
      const occurrenceExpanded = Boolean(
        metadataString(baseMetadata, "transcript_occurrence_id")
      )
      const directCanonicalCall = directCallId
        ? calls.find((call) => call.id === directCallId)
        : null
      const normalizedCalls = directCallId && (occurrenceExpanded || calls.length === 0)
        ? [{ id: directCallId, name: directToolName ?? directCanonicalCall?.name ?? "",
            input: baseMetadata.full_arguments ?? directCanonicalCall?.input ?? {} }]
        : calls
      if (message.content.trim()) {
        pushEvent("assistant.snapshot", "assistant",
          stripInlineThinkBlocks(message.content), { ...baseMetadata })
      }
      if (normalizedCalls.length === 0) {
        const occurrence = metadataString(baseMetadata, "transcript_occurrence_id") ??
          `${runId ?? conversationId ?? "conversation"}:${context.stream}:${messageIndex}:invalid`
        pushEvent("tool.call.completed", "tool_call", message.content, {
          ...baseMetadata,
          tool_call_id: occurrence,
          tool_name: "invalid_tool_call",
          transcript_occurrence_id: occurrence,
          settlement_status: "outcome_unknown",
          success: false,
          projection_error: "canonical tool_call has no valid call identity",
        })
        return
      }
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
      if (callId) {
        seenReasoningIdentities.delete(
          reasoningCallIdentity(baseMetadata, callId, runId, conversationId)
        )
      }
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
