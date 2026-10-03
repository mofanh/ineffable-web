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
