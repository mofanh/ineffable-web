import { normalizeConversationAdmission, type ConversationAdmissionSummary, type ConversationInputStatus } from "./conversation-admission.ts"

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
  message_type?: string | null
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
      type: "receipt"
      queued_in_timeline?: boolean
      status: ConversationInputStatus
      pending_id: number
      conversation_id: string
      message_id: string
      queue_len?: number | null
      seq?: number | null
      input_request_id?: string | null
      admission?: ConversationAdmissionSummary | null
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

  if (["queued", "guided_injected", "consuming", "consumed", "cancelled"].includes(String(candidate.status))) {
    const pendingId = typeof candidate.pending_id === "string" ? Number(candidate.pending_id) : candidate.pending_id
    if (typeof pendingId !== "number" || !Number.isSafeInteger(pendingId) || pendingId <= 0 ||
        typeof candidate.conversation_id !== "string" || !candidate.conversation_id ||
        typeof candidate.message_id !== "string" || !candidate.message_id) return null
    const counter = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
    return {
      queued_in_timeline: candidate.queued_in_timeline === true,
      type: "receipt", status: candidate.status as ConversationInputStatus,
      pending_id: pendingId, conversation_id: candidate.conversation_id, message_id: candidate.message_id,
      input_request_id: typeof candidate.input_request_id === "string" ? candidate.input_request_id : null,
      seq: counter(candidate.seq), queue_len: counter(candidate.queue_len),
      admission: normalizeConversationAdmission(candidate.admission),
    }
  }
  return null
}
