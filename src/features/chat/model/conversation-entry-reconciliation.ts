import type { AssistantEntry, ChatEntry } from "../gateway-chat-types.ts"

function isLocalAssistantEntry(entry: ChatEntry): entry is AssistantEntry {
  return entry.role === "assistant" && entry.id.startsWith("assistant-")
}

function timelineIdentity(entry: ChatEntry) {
  return entry.timelineUnitId?.trim() || entry.id
}

function timelineSequence(entry: ChatEntry) {
  return Number.isSafeInteger(entry.timelineSeq) ? entry.timelineSeq! : null
}

function sortTimeline(entries: ChatEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index, seq: timelineSequence(entry) }))
    .sort((left, right) => {
      if (left.seq != null && right.seq != null && left.seq !== right.seq) {
        return left.seq - right.seq
      }
      if (left.seq != null && right.seq == null) return -1
      if (left.seq == null && right.seq != null) return 1
      return left.index - right.index
    })
    .map(({ entry }) => entry)
}

export type CanonicalAssistantHandoff = {
  runId: string
  messageSeqEnd: number
}

export function hasCanonicalAssistantHandoff(
  entries: ChatEntry[],
  handoff: CanonicalAssistantHandoff
) {
  return entries.some(
    (entry) =>
      entry.role === "assistant" &&
      entry.runId === handoff.runId &&
      (entry.canonicalMessageSeqEnd ?? -1) >= handoff.messageSeqEnd
  )
}

export type ConversationTimelineAction =
  | { type: "hydrate"; entries: ChatEntry[] }
  | {
      type: "canonical-patch"
      entries: ChatEntry[]
      handoff?: CanonicalAssistantHandoff | null
    }
  | { type: "prepend-history"; entries: ChatEntry[] }

/**
 * The only canonical/history merge boundary for a conversation timeline.
 * Identity and ordering come from the Gateway transcript contract. Live units
 * remain provisional until a canonical unit explicitly confirms their run.
 */
export function reduceConversationTimeline(
  current: ChatEntry[],
  action: ConversationTimelineAction
) {
  if (action.type === "hydrate") {
    return sortTimeline(action.entries)
  }

  const handoff = action.type === "canonical-patch" ? action.handoff : null
  const handoffConfirmed = handoff
    ? hasCanonicalAssistantHandoff(action.entries, handoff)
    : true
  const incoming =
    handoff && !handoffConfirmed
      ? action.entries.filter(
          (entry) =>
            entry.role !== "assistant" || entry.runId !== handoff.runId
        )
      : action.entries
  const incomingIdentities = new Set(incoming.map(timelineIdentity))
  const incomingAssistantRunIds = new Set(
    incoming.flatMap((entry) =>
      entry.role === "assistant" && entry.runId ? [entry.runId] : []
    )
  )

  const retained = current.filter((entry) => {
    if (incomingIdentities.has(timelineIdentity(entry))) return false
    if (
      isLocalAssistantEntry(entry) &&
      entry.runId &&
      incomingAssistantRunIds.has(entry.runId)
    ) {
      return Boolean(
        handoff && entry.runId === handoff.runId && !handoffConfirmed
      )
    }
    return true
  })

  return sortTimeline([...retained, ...incoming])
}
