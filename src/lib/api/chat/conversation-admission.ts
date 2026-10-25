export type ConversationInputStatus = "queued" | "guided_injected" | "consuming" | "consumed" | "cancelled"

export type ConversationAdmissionSummary = {
  conversation_id: string
  queued_count: number
  consuming_count: number
  queue_paused: boolean
  generation: number
  revision: number
}

export function normalizeConversationAdmission(raw: unknown): ConversationAdmissionSummary | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (typeof value.conversation_id !== "string" || !value.conversation_id || typeof value.queue_paused !== "boolean") return null
  for (const key of ["queued_count", "consuming_count", "generation", "revision"] as const) {
    if (typeof value[key] !== "number" || !Number.isSafeInteger(value[key]) || value[key] < 0) return null
  }
  return {
    conversation_id: value.conversation_id, queued_count: value.queued_count as number, consuming_count: value.consuming_count as number,
    queue_paused: value.queue_paused, generation: value.generation as number, revision: value.revision as number,
  }
}

// Claim removes a queued item before its first lifecycle event is observable.
// The durable consuming fact keeps observation/Stop available across that gap.
export function hasUnsettledConversationInput(admission: ConversationAdmissionSummary | null | undefined): boolean {
  return Boolean(admission && (admission.consuming_count > 0 || (admission.queued_count > 0 && !admission.queue_paused)))
}
