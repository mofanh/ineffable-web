import type { ConversationMessageRecord } from "@/lib/api/gateway-client"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import type { ApprovalEntry } from "@/features/chat/gateway-chat-types"

export function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function parseJsonObject(value: string | null | undefined) {
  if (!value?.trim()) {
    return null
  }

  try {
    return objectValue(JSON.parse(value))
  } catch {
    return null
  }
}

export function approvalNeedFromRaw(
  raw: unknown,
  context?: {
    runId?: string | null
    sessionKey?: string | null
  }
): ApprovalEntry | null {
  const need = objectValue(raw)
  if (!need || need.kind !== "approval") {
    return null
  }

  const payload = objectValue(need.payload)
  const needId = stringValue(need.need_id)
  const approvalId = stringValue(payload?.approval_id) || needId
  const executionSessionId = stringValue(payload?.execution_session_id)
  const action =
    stringValue(need.action) ||
    stringValue(payload?.action) ||
    "run sandbox command"

  if (!needId && !approvalId && !executionSessionId) {
    return null
  }

  return {
    id: `approval-${approvalId || needId || executionSessionId}`,
    role: "approval",
    needId: needId || approvalId || executionSessionId,
    action,
    approvalId: approvalId || null,
    executionSessionId: executionSessionId || null,
    environmentId: stringValue(payload?.environment_id) || null,
    providerId: stringValue(payload?.provider_id) || null,
    runId: context?.runId ?? null,
    sessionKey: context?.sessionKey ?? null,
    status: "pending",
  }
}

export function approvalNeedFromEvent(
  event: GatewayChatStreamEvent
): ApprovalEntry | null {
  const metadata = objectValue(event.metadata)
  const runId = event.run_id || stringValue(metadata?.run_id) || null
  const sessionKey = stringValue(metadata?.session_key) || null
  const context = { runId, sessionKey }
  const metadataPayload = objectValue(metadata?.payload)
  const fromMetadata = approvalNeedFromRaw(
    objectValue(metadata?.pending_need) ??
      objectValue(metadata?.blocking_need) ??
      objectValue(metadataPayload?.pending_need),
    context
  )
  if (fromMetadata) {
    return fromMetadata
  }

  const parsedContent = parseJsonObject(event.content)
  return approvalNeedFromRaw(
    objectValue(parsedContent?.blocking_need) ??
      objectValue(parsedContent?.pending_need),
    context
  )
}

export function approvalNeedFromMessage(
  message: ConversationMessageRecord
): ApprovalEntry | null {
  const metadata = objectValue(message.metadata_json)
  const runId = message.run_id || stringValue(metadata?.run_id) || null
  const sessionKey = stringValue(metadata?.session_key) || null
  const context = { runId, sessionKey }
  const fromMetadata = approvalNeedFromRaw(
    objectValue(metadata?.pending_need) ?? objectValue(metadata?.blocking_need),
    context
  )
  if (fromMetadata) {
    return fromMetadata
  }

  const parsedContent = parseJsonObject(message.content)
  return approvalNeedFromRaw(
    objectValue(parsedContent?.blocking_need) ??
      objectValue(parsedContent?.pending_need),
    context
  )
}

export function parsePendingInputContent(
  event: GatewayChatStreamEvent
): string | null {
  try {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? event.metadata
        : event.content
          ? JSON.parse(event.content)
          : null
    if (meta && typeof meta === "object" && "content" in meta) {
      return String(meta.content).trim() || null
    }
  } catch {
    // ignore parse errors
  }
  return null
}

export function parsePendingInputId(event: GatewayChatStreamEvent): number | null {
  try {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? event.metadata
        : event.content
          ? JSON.parse(event.content)
          : null
    if (meta && typeof meta === "object" && "id" in meta) {
      return Number(meta.id) || null
    }
  } catch {
    // ignore parse errors
  }
  return null
}

export function buildConversationTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "新对话"
  }

  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized
}
