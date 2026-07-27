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

export type GatewayChatStreamEnvelope =
  | {
      type: "event"
      event: GatewayChatStreamEvent
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

export function normalizeGatewayEnvelope(
  raw: unknown
): GatewayChatStreamEnvelope | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Record<string, unknown>
  const type = candidate.type

  if (type === "event") {
    const event = candidate.event

    if (!event || typeof event !== "object") {
      return null
    }

    return {
      type: "event",
      event: event as GatewayChatStreamEvent,
    }
  }

  if (type === "error") {
    return {
      type,
      error: String(candidate.error ?? "Gateway stream failed"),
    }
  }

  if ("event" in candidate && typeof candidate.event === "string") {
    return {
      type: "event",
      event: candidate as GatewayChatStreamEvent,
    }
  }

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
