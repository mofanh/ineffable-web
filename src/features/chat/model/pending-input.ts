import type { ChatEntry } from "@/features/chat/gateway-chat-types"

export function isActionablePreInput(input: {
  kind: string
  status: string
}): boolean {
  return input.kind === "pre_input" && input.status === "queued"
}

export function isPendingInputSuccessorRun(
  predecessorRunId: string | null | undefined,
  candidateRunId: string | null | undefined
): boolean {
  const predecessor = predecessorRunId?.trim()
  const candidate = candidateRunId?.trim()
  return Boolean(predecessor && candidate && predecessor !== candidate)
}

export function canonicalUserMessageEntryId(messageId: string): string | null {
  const normalized = messageId.trim()
  return normalized ? `message:${normalized}` : null
}

/** Reconcile an optimistic user bubble with Gateway's canonical message id. */
export function bindOptimisticUserMessage(
  entries: ChatEntry[],
  optimisticId: string,
  messageId: string
): ChatEntry[] {
  const canonicalId = canonicalUserMessageEntryId(messageId)
  if (!canonicalId || optimisticId === canonicalId) {
    return entries
  }
  if (entries.some((entry) => entry.id === canonicalId)) {
    return entries.filter((entry) => entry.id !== optimisticId)
  }
  return entries.map((entry) =>
    entry.id === optimisticId && entry.role === "user"
      ? { ...entry, id: canonicalId, timelineUnitId: canonicalId }
      : entry
  )
}
