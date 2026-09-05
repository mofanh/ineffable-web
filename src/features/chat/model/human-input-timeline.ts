import type { AgentPaneState } from "../chat-pane-state.ts"
import type { ChatEntry, UserEntry } from "../gateway-chat-types.ts"

export function humanInputResponseIdentity(
  runId: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): UserEntry["humanInputResponse"] {
  const resolution = metadata?.human_resolution
  if (!runId || !resolution || typeof resolution !== "object") return undefined
  const value = resolution as Record<string, unknown>
  if (value.kind !== "user_input" || typeof value.need_id !== "string" || !value.need_id) {
    return undefined
  }
  return { runId, needId: value.need_id }
}

/** The durable user message owns the answer; the question keeps only its receipt identity. */
export function reconcileHumanInputAnswers(entries: ChatEntry[]): ChatEntry[] {
  const answers = new Map<string, Map<string, string>>()
  for (const entry of entries) {
    if (entry.role !== "user" || !entry.humanInputResponse || !Number.isSafeInteger(entry.timelineSeq)) continue
    const { runId, needId } = entry.humanInputResponse
    const runAnswers = answers.get(runId) ?? new Map<string, string>()
    runAnswers.set(needId, entry.id)
    answers.set(runId, runAnswers)
  }
  if (!answers.size) return entries
  let changed = false
  const result = entries.map((entry) => {
    if (entry.role !== "assistant") return entry
    const resolvePane = <T extends AgentPaneState>(pane: T): T => {
      let tools = pane.tools
      for (const [id, tool] of Object.entries(pane.tools)) {
        const runId = tool.runId ?? entry.runId
        const needId = tool.needId ?? tool.protocolId
        const messageId = runId && needId ? answers.get(runId)?.get(needId) : undefined
        if (!messageId || (tool.responseMessageId === messageId && tool.status === "succeeded")) continue
        if (tools === pane.tools) tools = { ...tools }
        tools[id] = { ...tool, status: "succeeded", responseMessageId: messageId }
      }
      return tools === pane.tools ? pane : { ...pane, tools }
    }
    const pane = resolvePane(entry.pane)
    let subagents = entry.subagents
    for (const id of entry.subagentOrder) {
      const subagent = subagents[id]
      if (!subagent) continue
      const resolved = resolvePane(subagent)
      if (resolved === subagent) continue
      if (subagents === entry.subagents) subagents = { ...subagents }
      subagents[id] = resolved
    }
    if (pane === entry.pane && subagents === entry.subagents) return entry
    changed = true
    return { ...entry, pane, subagents }
  })
  return changed ? result : entries
}
