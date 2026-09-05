export type ConversationOperationIdentity = {
  conversationId: string | null
  runId: string | null
  executionEpoch: number | null
  generation: number
}

/** UI fencing only; lifecycle remains owned by Gateway's canonical projection. */
export function matchesConversationOperation(
  expected: ConversationOperationIdentity,
  current: ConversationOperationIdentity
) {
  return expected.conversationId === current.conversationId &&
    expected.generation === current.generation &&
    (!expected.runId || expected.runId === current.runId) &&
    (expected.executionEpoch == null || expected.executionEpoch === current.executionEpoch)
}
