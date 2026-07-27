import type { Conversation } from "@/lib/api/api-client"

export type ConversationRuntimeStatus =
  | "running"
  | "awaiting_human"
  | "suspended"
  | "completed_unread"
  | "failed"

export type ConversationRunLifecycle =
  | "active"
  | "awaiting_human"
  | "suspended"
  | "completed"
  | "failed"
  | "idle"

export type ConversationRunObservation = {
  runId: string
  lifecycle: ConversationRunLifecycle
}

export function getLiveRunResumeCursor(
  backendLiveRunId: string | null,
  pendingRunId: string | null | undefined,
  pendingAfterSeq: number | null | undefined
) {
  if (!backendLiveRunId) {
    return null
  }

  return {
    runId: backendLiveRunId,
    afterSeq:
      pendingRunId === backendLiveRunId ? (pendingAfterSeq ?? null) : null,
  }
}

const AWAITING_HUMAN_STATUSES = new Set(["awaiting_human"])
const SUSPENDED_STATUSES = new Set(["suspended"])
const FAILED_STATUSES = new Set(["error", "failed"])
const COMPLETED_STATUSES = new Set(["cancelled", "completed", "succeeded"])

export function getConversationRunLifecycle(
  conversation: Conversation
): ConversationRunLifecycle {
  const run = conversation.current_run
  if (!run) {
    return "idle"
  }

  const status = run.status.trim().toLowerCase()
  if (run.is_live) {
    return "active"
  }
  if (AWAITING_HUMAN_STATUSES.has(status)) {
    return "awaiting_human"
  }
  if (SUSPENDED_STATUSES.has(status)) {
    return "suspended"
  }
  if (FAILED_STATUSES.has(status)) {
    return "failed"
  }
  if (COMPLETED_STATUSES.has(status)) {
    return "completed"
  }
  return "idle"
}

export function observeConversationRuns(
  conversations: Conversation[]
): Record<string, ConversationRunObservation> {
  return Object.fromEntries(
    conversations.flatMap((conversation) => {
      const run = conversation.current_run
      if (!run) {
        return []
      }

      return [
        [
          conversation.id,
          {
            runId: run.id,
            lifecycle: getConversationRunLifecycle(conversation),
          },
        ],
      ]
    })
  )
}

export function findNewlyTerminalConversationIds(
  previous: Record<string, ConversationRunObservation>,
  conversations: Conversation[],
  selectedConversationId: string | null
) {
  return conversations.flatMap((conversation) => {
    if (conversation.id === selectedConversationId || !conversation.current_run) {
      return []
    }

    const before = previous[conversation.id]
    if (!before || before.runId !== conversation.current_run.id) {
      return []
    }

    const after = getConversationRunLifecycle(conversation)
    const wasInProgress =
      before.lifecycle === "active" ||
      before.lifecycle === "awaiting_human" ||
      before.lifecycle === "suspended"
    const isTerminal = after === "completed" || after === "failed"
    return wasInProgress && isTerminal ? [conversation.id] : []
  })
}

export function getConversationRuntimeStatus(
  conversation: Conversation,
  hasUnreadCompletion: boolean
): ConversationRuntimeStatus | null {
  const lifecycle = getConversationRunLifecycle(conversation)
  if (lifecycle === "active") {
    return "running"
  }
  if (lifecycle === "awaiting_human") {
    return "awaiting_human"
  }
  if (lifecycle === "suspended") {
    return "suspended"
  }
  if (lifecycle === "failed") {
    return "failed"
  }
  if (hasUnreadCompletion && lifecycle === "completed") {
    return "completed_unread"
  }
  return null
}
