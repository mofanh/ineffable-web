import type { AgentPaneState } from "../chat-pane-state.ts"
import type { AssistantEntry, ChatEntry, UserEntry } from "../gateway-chat-types.ts"

export function humanInputResponseIdentity(
  runId: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): UserEntry["humanInputResponse"] {
  const resolution = metadata?.human_resolution
  if (!runId || !resolution || typeof resolution !== "object") return undefined
  const value = resolution as Record<string, unknown>
  if (!["user_input", "approval"].includes(String(value.kind)) || typeof value.need_id !== "string" || !value.need_id) {
    return undefined
  }
  return { runId, needId: value.need_id, ...(value.kind === "approval" ? { kind: "approval" as const, approved: value.approved === true } : {}) }
}

/** The durable user message owns the answer; the question keeps only its receipt identity. */
export function reconcileHumanInputAnswers(entries: ChatEntry[]): ChatEntry[] {
  const answers = new Map<string, Map<string, string>>()
  for (const entry of entries) {
    if (entry.role !== "user" || !entry.humanInputResponse || entry.humanInputResponse.kind === "approval" || !Number.isSafeInteger(entry.timelineSeq)) continue
    const { runId, needId } = entry.humanInputResponse
    const runAnswers = answers.get(runId) ?? new Map<string, string>()
    runAnswers.set(needId, entry.id)
    answers.set(runId, runAnswers)
  }
  const approvalDecisions = new Map<string, boolean>()
  for (const entry of entries) if (entry.role === "user" && entry.humanInputResponse?.kind === "approval") {
    const { runId, needId, approved } = entry.humanInputResponse
    approvalDecisions.set(`${runId}:${needId}`, approved === true)
  }
  if (!answers.size && !approvalDecisions.size) return entries
  const resolvePane = <T extends AgentPaneState>(pane: T, ownerRunId?: string | null): T => {
    let tools = pane.tools
    for (const [id, tool] of Object.entries(pane.tools)) {
      if (tool.name !== "request_user_input" && !tool.needId) continue
      const runId = tool.runId ?? ownerRunId
      const needId = tool.needId ?? tool.protocolId
      const messageId = runId && needId ? answers.get(runId)?.get(needId) : undefined
      if (!messageId || (tool.responseMessageId === messageId && tool.status === "succeeded")) continue
      if (tools === pane.tools) tools = { ...tools }
      tools[id] = { ...tool, status: "succeeded", responseMessageId: messageId }
    }
    return tools === pane.tools ? pane : { ...pane, tools }
  }
  const resolveAssistant = (entry: AssistantEntry): AssistantEntry => {
    const pane = resolvePane(entry.pane, entry.runId)
    let subagents = entry.subagents
    for (const id of entry.subagentOrder) {
      const subagent = subagents[id]
      if (!subagent) continue
      const resolved = resolvePane(subagent, entry.runId)
      if (resolved === subagent) continue
      if (subagents === entry.subagents) subagents = { ...subagents }
      subagents[id] = resolved
    }
    let segments = entry.segments
    for (const [id, segment] of Object.entries(entry.segments ?? {})) {
      const resolved = resolveAssistant(segment)
      if (resolved === segment) continue
      if (segments === entry.segments) segments = { ...segments }
      segments![id] = resolved
    }
    const canonicalDraft = entry.canonicalDraft ? resolveAssistant(entry.canonicalDraft) : undefined
    if (pane === entry.pane && subagents === entry.subagents && segments === entry.segments && canonicalDraft === entry.canonicalDraft) return entry
    return { ...entry, pane, subagents, segments, canonicalDraft }
  }
  let changed = false
  const result = entries.map((entry) => {
    if (entry.role === "approval") {
      const decision = entry.runId ? approvalDecisions.get(`${entry.runId}:${entry.needId}`) : undefined
      if (decision == null) return entry
      const status = decision ? "approved" as const : "rejected" as const
      if (entry.status === status) return entry
      changed = true
      return { ...entry, status, error: null }
    }
    if (entry.role !== "assistant") return entry
    const resolved = resolveAssistant(entry)
    changed ||= resolved !== entry
    return resolved
  })
  return changed ? result : entries
}

/** A canonical receipt is monotone even when an older segment arrives later. */
export function preserveHumanInputReceipts<T extends AgentPaneState>(next: T, previous?: AgentPaneState): T {
  if (!previous) return next
  let tools = next.tools
  for (const [id, tool] of Object.entries(next.tools)) {
    const old = previous.tools[id]
    if (!old?.responseMessageId || tool.responseMessageId || (tool.runId && old.runId && tool.runId !== old.runId)) continue
    if (tools === next.tools) tools = { ...tools }
    tools[id] = { ...tool, status: "succeeded", responseMessageId: old.responseMessageId }
  }
  return tools === next.tools ? next : { ...next, tools }
}

/** The accepted user identity, including guided input, splits a single run into answers. */
export function inputBoundaryForRun(entries: ChatEntry[], runId: string): number | undefined {
  let boundary: number | undefined
  for (const candidate of entries) {
    if (candidate.role !== "user" || !Number.isSafeInteger(candidate.timelineSeq)) continue
    if (candidate.humanInputResponse?.runId === runId ||
        (candidate.inputProgress?.phase === "accepted" &&
         candidate.inputProgress.run_id === runId)) {
      boundary = Math.max(boundary ?? 0, candidate.timelineSeq!)
    }
  }
  return boundary
}

export function bindAssistantToHumanBoundary(entry: AssistantEntry, entries: ChatEntry[], targetInputSeq?: number): AssistantEntry {
  if (!entry.runId || entry.timelineUnitId) return entry
  const boundary = targetInputSeq ?? inputBoundaryForRun(entries, entry.runId)
  return boundary == null ? entry : {
    ...entry, humanInputBoundarySeq: boundary, timelineSeq: boundary + 1,
    timelineUnitId: `run:${entry.runId}:anchor:${boundary + 1}`,
  }
}
