import { mergeInputProgress, type InputProgress } from "./input-progress.ts"
import { reconcileHumanInputAnswers } from "./human-input-timeline.ts"
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

export type QueuedInputIdentity = { messageId: string; runId: string | null; pendingId?: number }

function visibleTimelineEntries(entries: ChatEntry[], queuedInputs: readonly QueuedInputIdentity[] = []) {
  const queued = new Map(queuedInputs.map((input) => [`message:${input.messageId}`, input]))
  return entries.filter((entry) => {
    if (entry.role !== "user") return true
    if (entry.inputProgress?.phase === "accepted") return true
    const pending = queued.get(timelineIdentity(entry))
    if (pending && (!entry.inputProgress?.run_id || entry.inputProgress.run_id === pending.runId)) return false
    return entry.inputProgress?.kind !== "pre_input" || !["queued", "cancelled"].includes(entry.inputProgress.phase)
  })
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
  | { type: "pending-inputs"; inputs: QueuedInputIdentity[] }
  | { type: "input-progress"; progress: InputProgress; content?: string }
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
  action: ConversationTimelineAction,
  queuedInputs: readonly QueuedInputIdentity[] = []
) {
  if (action.type === "pending-inputs") return visibleTimelineEntries(current, action.inputs)
  if (action.type === "input-progress") {
    const progress = action.progress
    const identity = `message:${progress.message_id}`
    const next = current.map((entry) => entry.role === "user" && timelineIdentity(entry) === identity
      ? { ...entry, timelineSeq: progress.message_seq ?? entry.timelineSeq,
          inputProgress: mergeInputProgress(entry.inputProgress, progress), deliveryStatus: "received" as const }
      : entry)
    if (!next.some((entry) => timelineIdentity(entry) === identity) && action.content != null) {
      next.push({ id: identity, timelineUnitId: identity, role: "user", content: action.content,
        timelineSeq: progress.message_seq, inputProgress: progress, deliveryStatus: "received" })
    }
    return visibleTimelineEntries(next, queuedInputs)
  }
  const previousUsers = new Map(current.filter((entry) => entry.role === "user").map((entry) => [timelineIdentity(entry), entry]))
  action = { ...action, entries: action.entries.map((entry) => {
    if (entry.role !== "user") return entry
    const previous = previousUsers.get(timelineIdentity(entry))
    return previous?.role === "user" ? { ...entry, inputProgress: mergeInputProgress(previous.inputProgress, entry.inputProgress) } : entry
  }) }
  if (action.type === "hydrate") {
    return reconcileHumanInputAnswers(sortTimeline(visibleTimelineEntries(action.entries, queuedInputs)))
  }

  const handoff = action.type === "canonical-patch" ? action.handoff : null
  const handoffConfirmed = handoff
    ? hasCanonicalAssistantHandoff(action.entries, handoff)
    : true
  const candidates =
    handoff && !handoffConfirmed
      ? action.entries.filter(
          (entry) =>
            entry.role !== "assistant" || entry.runId !== handoff.runId
        )
      : action.entries
  const localBoundaries = new Map(current.flatMap((entry) =>
    isLocalAssistantEntry(entry) && entry.humanInputBoundarySeq != null
      ? [[timelineIdentity(entry), entry.humanInputBoundarySeq] as const] : []
  ))
  const incoming = candidates.filter((entry) => {
    const boundary = localBoundaries.get(timelineIdentity(entry))
    return boundary == null || entry.role !== "assistant" ||
      (entry.canonicalMessageSeqEnd ?? -1) > boundary
  })
  const incomingIdentities = new Set(incoming.map(timelineIdentity))
  const incomingAssistantRunIds = new Set(
    incoming.flatMap((entry) =>
      entry.role === "assistant" && entry.runId ? [entry.runId] : []
    )
  )

  const retained = current.filter((entry) => {
    if (incomingIdentities.has(timelineIdentity(entry))) {
      if (isLocalAssistantEntry(entry) && entry.humanInputBoundarySeq != null &&
          !incoming.some((candidate) => candidate.role === "assistant" &&
            candidate.timelineUnitId === entry.timelineUnitId &&
            (candidate.canonicalMessageSeqEnd ?? -1) > entry.humanInputBoundarySeq!)) return true
      return false
    }
    if (
      action.type === "canonical-patch" &&
      isLocalAssistantEntry(entry) &&
      entry.runId &&
      incomingAssistantRunIds.has(entry.runId)
    ) {
      if (entry.humanInputBoundarySeq != null && !incoming.some((candidate) =>
        candidate.role === "assistant" && candidate.timelineUnitId === entry.timelineUnitId &&
        (candidate.canonicalMessageSeqEnd ?? -1) > entry.humanInputBoundarySeq!
      )) return true
      return Boolean(
        handoff && entry.runId === handoff.runId && !handoffConfirmed
      )
    }
    return true
  })

  return reconcileHumanInputAnswers(sortTimeline(visibleTimelineEntries([...retained, ...incoming], queuedInputs)))
}
