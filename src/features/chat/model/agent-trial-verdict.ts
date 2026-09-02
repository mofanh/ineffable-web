import type { ChatEntry } from "@/features/chat/gateway-chat-types"
import type { AgentEvolutionProjection } from "@/features/chat/api/chat-api"

export function findEligibleTrialAnswer(
  entries: ChatEntry[],
  projection: AgentEvolutionProjection | null
) {
  const binding = projection?.trial_binding
  const fingerprint = binding?.active_fingerprint?.trim()
  const trialStartedAt = binding ? Date.parse(binding.updated_at) : Number.NaN
  if (
    binding?.mode !== "trial" ||
    !fingerprint ||
    !Number.isFinite(trialStartedAt)
  ) {
    return null
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    const answerCreatedAt = entry.role === "assistant" && entry.createdAt
      ? Date.parse(entry.createdAt)
      : Number.NaN
    if (
      entry.role !== "assistant" ||
      entry.status !== "done" ||
      entry.definitionFingerprint !== fingerprint ||
      !Number.isFinite(answerCreatedAt) ||
      answerCreatedAt < trialStartedAt
    ) {
      continue
    }
    const hasAnswer = entry.pane.blockOrder.some((blockId) => {
      const block = entry.pane.blocks[blockId]
      return block?.type === "text" && Boolean(block.content.trim())
    })
    if (hasAnswer) return entry
  }

  return null
}
