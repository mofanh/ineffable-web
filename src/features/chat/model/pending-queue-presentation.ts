/** Controlled Gateway codes only. Provider error text stays in run details. */
export function pendingQueueReasonKey(status: string | null, code?: string | null): string {
  // Gateway reports completed as a blocker only when a later Stop paused its queue.
  if (status === "cancelled" || status === "completed") return "chat.composer.queueStopped"
  if (status === "awaiting_human") return "chat.composer.queueAwaitingHuman"
  if (status === "streaming" || status === "suspended" || status === "resuming") return "chat.composer.queueWaiting"
  switch (code) {
    case "context_storage_overflow": return "chat.composer.queueStorageOverflow"
    case "context_protected_overflow": return "chat.composer.queueInputOverflow"
    case "context_request_overflow": return "chat.composer.queueRequestOverflow"
    case "context_compaction_failed":
    case "context_history_invalid":
    case "context_history_read_failed": return "chat.composer.queueContextFailed"
    default: return "chat.composer.queueBlocked"
  }
}

export function pendingInputErrorKey(cause: unknown): string | null {
  const reason = cause && typeof cause === "object" && "reason" in cause ? cause.reason : null
  switch (reason) {
    case "scheduling_global_capacity_exceeded": return "chat.composer.schedulingGlobalFull"
    case "scheduling_user_capacity_exceeded": return "chat.composer.schedulingUserFull"
    case "scheduling_conversation_capacity_exceeded": return "chat.composer.schedulingConversationFull"
    case "retained_global_capacity_exceeded": return "chat.composer.retainedGlobalFull"
    case "retained_user_capacity_exceeded": return "chat.composer.retainedUserFull"
    case "retained_conversation_capacity_exceeded": return "chat.composer.retainedConversationFull"
    case "pending_input_payload_exceeded": return "chat.composer.pendingPayloadFull"
    default: return null
  }
}

export function pendingHoldReasonKey(reason: string, code?: string | null): string {
  switch (reason) {
    case "paused": return "chat.composer.queueStopped"
    case "outcome_unknown": return "chat.composer.queueOutcomeUnknown"
    case "identity_missing":
    case "unavailable": return "chat.composer.queueUnavailable"
    default: return pendingQueueReasonKey(reason, code)
  }
}
