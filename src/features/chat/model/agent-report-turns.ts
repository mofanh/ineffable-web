import type { AssistantEntry, ChatEntry, UserEntry } from "../gateway-chat-types"
import type { AgentReport, InputProgress } from "./input-progress"

type ReportInput = UserEntry & { inputProgress: InputProgress & { agent_report: AgentReport } }

export function isAgentReportInput(entry: ChatEntry): entry is ReportInput {
  return entry.role === "user" && !!entry.inputProgress?.agent_report &&
    (entry.timelineUnitId ?? entry.id) === `message:${entry.inputProgress.message_id}`
}

export function needsReportSource(entry: ChatEntry) {
  return entry.role === "user" && entry.awaitingReportSource === true && entry.inputProgress?.agent_report === undefined
}

/** Only call for canonical history or Finalizer events. */
export function canonicalReplyTo(metadata?: Record<string, unknown> | null) {
  const id = metadata?.response_to_message_id
  const seq = metadata?.response_to_message_seq
  return typeof id === "string" && id.length > 0 && typeof seq === "number" && Number.isSafeInteger(seq)
    ? { id, seq } : undefined
}

export function reportSectionNodeId(section: AssistantEntry, partIndex: number, nodeId: string) {
  return partIndex === 0 ? nodeId : `${section.timelineUnitId ?? section.id}/${nodeId}`
}

function boundaryEpoch(entry: AssistantEntry, side: "first" | "last") {
  let epoch = entry.segmentIdentity?.execution_epoch
  for (const segment of Object.values(entry.segments ?? {})) {
    const value = segment.segmentIdentity?.execution_epoch
    if (value !== undefined) epoch = epoch === undefined ? value :
      side === "first" ? Math.min(epoch, value) : Math.max(epoch, value)
  }
  return epoch
}

function followsReport(entry: AssistantEntry, input: ReportInput) {
  const progress = input.inputProgress
  if (entry.runId !== progress.run_id || entry.timelineUnitId !== `run:${entry.runId}:anchor:${progress.message_seq! + 1}`) return false
  if (progress.kind !== "guided") return true
  const first = boundaryEpoch(entry, "first")
  const delivery = progress.agent_report.delivery_epoch
  if (first === undefined || delivery === null || first < delivery) return false
  if (first === delivery) return true
  // A resumed worker can finish an input accepted before its current epoch.
  // Only the Finalizer's exact input owner can bridge that boundary.
  const segments = entry.segments ? Object.values(entry.segments) : [entry]
  return segments.some(part => part.segmentIdentity?.execution_epoch === first &&
    Number.isSafeInteger(part.canonicalMessageSeqEnd) && !part.canonicalDraft &&
    part.canonicalReplyTo?.id === progress.message_id && part.canonicalReplyTo?.seq === progress.message_seq)
}

function continuesRun(input: ReportInput, previous?: AssistantEntry | ReportInput) {
  const progress = input.inputProgress
  if (!previous || progress.kind !== "guided" || progress.agent_report.delivery_epoch === null) return false
  if (previous.role === "user") {
    const priorEpoch = previous.inputProgress.kind === "guided" ? previous.inputProgress.agent_report.delivery_epoch
      : previous.inputProgress.execution_epoch
    return previous.inputProgress.run_id === progress.run_id && priorEpoch === progress.agent_report.delivery_epoch &&
      previous.inputProgress.message_seq! < progress.message_seq!
  }
  return previous.runId === progress.run_id && previous.timelineSeq != null &&
    previous.timelineSeq <= progress.message_seq! &&
    previous.timelineUnitId === `run:${previous.runId}:anchor:${previous.timelineSeq}` &&
    boundaryEpoch(previous, "last") === progress.agent_report.delivery_epoch
}

/** Project already ordered timeline units for display only. Receipts keep their
 * canonical identities in the reducer, including while a transcript page is missing. */
export function projectAgentReportTurns(entries: ChatEntry[], interactingRows?: ReadonlyMap<string, string>): ChatEntry[] {
  if (!entries.some(isAgentReportInput)) return entries
  const visible: ChatEntry[] = []
  let parts: (AssistantEntry | ReportInput)[] = []
  let answer: AssistantEntry | undefined
  const flush = () => {
    if (parts.length > 1 && answer) {
      const first = parts[0]
      visible.push({ ...answer, id: first.timelineUnitId ?? first.id, timelineUnitId: first.timelineUnitId,
        reportTurn: parts.map(part => part.role === "assistant" ? part :
          { role: "agent-report", id: part.id, report: part.inputProgress.agent_report }) })
    } else visible.push(...parts)
    parts = []
    answer = undefined
  }
  for (const entry of entries) {
    // A late receipt may join two already visible rows. Keep the row a reader
    // is interacting with at its mounted position until focus/selection leaves.
    const protectedRole = interactingRows?.get(entry.timelineUnitId ?? entry.id)
    if (protectedRole === "assistant") flush()
    if (protectedRole === "agent-report" && isAgentReportInput(entry)) {
      flush()
      visible.push(entry)
      continue
    }
    const previous = parts.at(-1)
    if (isAgentReportInput(entry) && entry.inputProgress.phase === "accepted" &&
        entry.inputProgress.run_id && Number.isSafeInteger(entry.inputProgress.message_seq)) {
      if (!continuesRun(entry, previous)) flush()
      parts.push(entry)
    } else if (entry.role === "assistant") {
      if (!previous || previous.role !== "user" || !followsReport(entry, previous)) flush()
      parts.push(entry)
      answer = entry
    } else {
      flush()
      visible.push(entry)
    }
  }
  flush()
  return visible
}
