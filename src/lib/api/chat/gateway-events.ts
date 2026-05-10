export type GatewayChatStreamEvent = {
  run_id?: string
  seq?: number
  ts_ms?: number
  stream?: string
  event: string
  phase?: string | null
  scope?: string | null
  role?: string | null
  content?: string | null
  metadata?: Record<string, unknown> | null
}

export type GatewayForwardMessage = {
  scope?: string | null
  role?: string | null
  content: string
  metadata?: Record<string, unknown> | null
}

export type GatewayChatFinalResult = {
  output?: string
  session_key?: string
  agent_id?: string
  forward_messages?: GatewayForwardMessage[]
  send_result?: unknown
}

export type GatewayChatStreamEnvelope =
  | {
      type: "event"
      event: GatewayChatStreamEvent
    }
  | {
      type: "final"
      result: GatewayChatFinalResult
    }
  | {
      type: "error"
      error: string
    }
  | {
      type: "queued"
      queue_len: number
      pending_id?: number | null
      seq?: number | null
      conversation_id?: string | null
      message_id?: string | null
    }

export type FrontendChannelMessage = {
  channel: string
  to: string | null
  content: string
  metadata?: Record<string, unknown> | null
  timestamp_ms: number
}

function getStringValue(
  value: Record<string, unknown> | null | undefined,
  key: string
) {
  const next = value?.[key]
  return typeof next === "string" ? next : ""
}

function parseToolEnvelopeContent(content: string) {
  const [header, ...rest] = content.split("\n")
  if (!header.startsWith("tool=")) {
    return null
  }

  let toolName = ""
  let toolCallId = ""
  for (const part of header.split(/\s+/)) {
    if (part.startsWith("tool=")) {
      toolName = part.slice("tool=".length).trim()
    } else if (part.startsWith("call_id=")) {
      toolCallId = part.slice("call_id=".length).trim()
    }
  }

  if (!toolName && !toolCallId) {
    return null
  }

  return {
    toolName,
    toolCallId,
    body: rest.join("\n"),
  }
}

export function canonicalizeGatewayEvent(
  event: GatewayChatStreamEvent
): GatewayChatStreamEvent {
  const metadata =
    event.metadata && typeof event.metadata === "object"
      ? ({ ...event.metadata } as Record<string, unknown>)
      : null

  const inferredRole =
    (typeof event.role === "string" && event.role.trim()) ||
    getStringValue(metadata, "gateway_role") ||
    getStringValue(metadata, "role")
  const parsedTool = parseToolEnvelopeContent(event.content ?? "")

  if (metadata && parsedTool) {
    if (parsedTool.toolName && !getStringValue(metadata, "tool_name")) {
      metadata.tool_name = parsedTool.toolName
    }
    if (parsedTool.toolCallId && !getStringValue(metadata, "tool_call_id")) {
      metadata.tool_call_id = parsedTool.toolCallId
    }
  }

  let eventName = event.event
  let content = event.content ?? null
  const hasExplicitToolCallEvent =
    eventName === "tool_call_start" ||
    eventName === "tool_call_delta" ||
    eventName === "tool_call_done"
  const hasExplicitToolResultEvent = eventName === "tool_result"

  if (inferredRole === "tool_call") {
    if (!hasExplicitToolCallEvent) {
      eventName = "tool_call_done"
    }
    if (parsedTool) {
      const fullArguments =
        getStringValue(metadata, "full_arguments") || parsedTool.body || content || ""
      if (metadata && fullArguments) {
        metadata.full_arguments = fullArguments
      }
      content = parsedTool.body || content
    }
  } else if (inferredRole === "tool") {
    if (!hasExplicitToolResultEvent) {
      eventName = "tool_result"
    }
    if (parsedTool) {
      content = parsedTool.body || content
    }
  }

  return {
    ...event,
    event: eventName,
    role: inferredRole || event.role || null,
    content,
    metadata,
  }
}

export function normalizeGatewayEnvelope(
  raw: unknown
): GatewayChatStreamEnvelope | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Record<string, unknown>
  const type = candidate.type

  if (type === "delta" || type === "message") {
    const event = candidate.event

    if (!event || typeof event !== "object") {
      return null
    }

    return {
      type: "event",
      event: canonicalizeGatewayEvent(event as GatewayChatStreamEvent),
    }
  }

  if (type === "final") {
    return {
      type,
      result:
        candidate.result && typeof candidate.result === "object"
          ? (candidate.result as GatewayChatFinalResult)
          : {},
    }
  }

  if (
    typeof candidate.output === "string" ||
    Array.isArray(candidate.forward_messages) ||
    typeof candidate.session_key === "string"
  ) {
    return {
      type: "final",
      result: candidate as GatewayChatFinalResult,
    }
  }

  if (type === "error") {
    return {
      type,
      error: String(candidate.error ?? "Gateway stream failed"),
    }
  }

  if ("event" in candidate && typeof candidate.event === "string") {
    const eventName = candidate.event
    const content = typeof candidate.content === "string" ? candidate.content : ""
    if (eventName === "error" || eventName.endsWith("_error")) {
      return {
        type: "error",
        error: content || "Gateway stream failed",
      }
    }

    return {
      type: "event",
      event: canonicalizeGatewayEvent(candidate as GatewayChatStreamEvent),
    }
  }

  // Phase 6: 服务端预输入队列响应
  if (candidate.status === "queued" && typeof candidate.queue_len === "number") {
    const pendingIdRaw = candidate.pending_id
    const pendingId =
      typeof pendingIdRaw === "number"
        ? pendingIdRaw
        : typeof pendingIdRaw === "string"
          ? Number(pendingIdRaw)
          : null

    const seqRaw = candidate.seq
    const seq =
      typeof seqRaw === "number"
        ? seqRaw
        : typeof seqRaw === "string"
          ? Number(seqRaw)
          : null

    return {
      type: "queued",
      queue_len: candidate.queue_len as number,
      pending_id: Number.isFinite(pendingId) ? pendingId : null,
      seq: Number.isFinite(seq) ? seq : null,
      conversation_id:
        typeof candidate.conversation_id === "string" ? candidate.conversation_id : null,
      message_id: typeof candidate.message_id === "string" ? candidate.message_id : null,
    }
  }

  return null
}

export function normalizePolledEnvelope(message: FrontendChannelMessage) {
  let parsed: unknown = message.content
  try {
    parsed = JSON.parse(message.content) as unknown
  } catch {
    parsed = message.content
  }

  const envelope = normalizeGatewayEnvelope(parsed)

  if (envelope) {
    return envelope
  }

  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null

  if (metadata) {
    const nestedEnvelope = normalizeGatewayEnvelope(metadata.envelope)
    if (nestedEnvelope) {
      return nestedEnvelope
    }

    const eventName = typeof metadata.event === "string" ? metadata.event : ""
    if (eventName) {
      return normalizeGatewayEnvelope({
        run_id:
          typeof metadata.run_id === "string"
            ? metadata.run_id
            : message.channel,
        seq:
          typeof metadata.seq === "number"
            ? metadata.seq
            : message.timestamp_ms,
        ts_ms:
          typeof metadata.ts_ms === "number"
            ? metadata.ts_ms
            : message.timestamp_ms,
        stream:
          typeof metadata.stream === "string" ? metadata.stream : "chat",
        event: eventName,
        phase: typeof metadata.phase === "string" ? metadata.phase : null,
        scope: typeof metadata.scope === "string" ? metadata.scope : null,
        role: typeof metadata.role === "string" ? metadata.role : null,
        content: message.content,
        metadata,
      })
    }
  }

  if (parsed && typeof parsed === "object" && "content" in (parsed as object)) {
    return null
  }

  return null
}
