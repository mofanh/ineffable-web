import type { AssistantEntry, ChatEntry, UserEntry } from "../gateway-chat-types"
import type { AgentReport, InputProgress } from "./input-progress"

type ReportInput = UserEntry & { inputProgress: InputProgress & { agent_report: AgentReport } }

export function isAgentReportInput(entry: ChatEntry): entry is ReportInput {
  return entry.role === "user" && !!entry.inputProgress?.agent_report &&
    (entry.timelineUnitId ?? entry.id) === `message:${entry.inputProgress.message_id}`
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
  return entry.runId === progress.run_id && entry.timelineUnitId === `run:${entry.runId}:anchor:${progress.message_seq! + 1}` &&
    (progress.kind !== "guided" || boundaryEpoch(entry, "first") === progress.agent_report.delivery_epoch)
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
export function projectAgentReportTurns(entries: ChatEntry[]): ChatEntry[] {
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
