import type { AssistantEntry } from "../gateway-chat-types"
import { reportSectionNodeId } from "./agent-report-turns"
import type { WebNodeView } from "../web-node"
import { DEFAULT_WEB_PLUGIN_ID } from "../web-node"
import type { TextWebNodePayload, ToolWebNodePayload } from "../runtime/web-node-projection"

export function assistantAnswerText(entry: AssistantEntry) {
  const finalIds = finalAssistantBlockIds(entry)
  return entry.pane.blockOrder.flatMap(id => {
    const block = entry.pane.blocks[id]
    return block?.type === "text" && (finalIds.size ? finalIds.has(id) : block.assistantPhase !== "commentary") ? [block.content] : []
  }).join("\n\n").trim()
}

function hasCanonicalCoverage(entry: AssistantEntry) {
  // Every loaded live segment must have completed its canonical handoff. A
  // terminal run event, one canonical tail or transport EOF is insufficient.
  const segments = entry.segments ? Object.values(entry.segments) : [entry]
  return segments.length > 0 && segments.every(segment =>
    Number.isSafeInteger(segment.canonicalMessageSeqEnd) && !segment.canonicalDraft)
}

export function canAutoCollapseAssistantProcess(entry: AssistantEntry) {
  if (entry.runStatus !== "completed" || entry.status !== "done") return false
  if (entry.reportTurn && (entry.reportTurn.at(-1)?.role !== "assistant" ||
      !entry.reportTurn.every(part => part.role !== "assistant" || hasCanonicalCoverage(part)))) return false
  return hasCanonicalCoverage(entry) &&
    Object.values(entry.pane.blocks).some(block => block.type === "text" && (block.images?.length || (block.assistantPhase !== "commentary" && block.content.trim())))
}

export type AssistantProcessGroup = {
  id: string
  nodeIds: ReadonlySet<string>
  autoCollapse: boolean
}

export type AssistantProcessLayout = {
  groups: AssistantProcessGroup[]
  membership: ReadonlyMap<string, AssistantProcessGroup>
  consolidated: boolean
}

function blockOwners(entry: AssistantEntry) {
  const owners = new Map<string, string>()
  for (const [key, segment] of Object.entries(entry.segments ?? {})) {
    for (const id of segment.pane.blockOrder) {
      owners.set(id, segment.segmentIdentity?.id ?? key)
    }
  }
  return owners
}

/** A complete answer can contain several Markdown blocks. Position alone is
 * never evidence of finality; terminal state and canonical coverage are required. */
export function finalAssistantBlockIds(entry: AssistantEntry): ReadonlySet<string> {
  if (!canAutoCollapseAssistantProcess(entry)) return new Set()
  const texts = entry.pane.blockOrder.flatMap(id => {
    const block = entry.pane.blocks[id]
    return block?.type === "text" && block.content.trim() ? [block] : []
  })
  const last = texts.at(-1)
  if (last?.assistantPhase !== "final_answer") return new Set()
  const owners = blockOwners(entry)
  const owner = owners.get(last.id)
  return new Set(texts.filter(block => block.assistantPhase === "final_answer" &&
    (owner == null || owners.get(block.id) === owner)).map(block => block.id))
}

function payloadObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function textPayload(node: WebNodeView) {
  if (node.pluginId !== DEFAULT_WEB_PLUGIN_ID || node.renderer !== "text") return null
  const payload = payloadObject(node.payload)
  return typeof payload?.content === "string" ? payload as TextWebNodePayload : null
}

function belongsToProcess(node: WebNodeView, finalAnswerIds: ReadonlySet<string>, activeNeedId?: string | null) {
  if (node.pluginId !== DEFAULT_WEB_PLUGIN_ID || node.status === "waiting") return false
  if (node.renderer === "tool") {
    const tool = (node.payload as Partial<ToolWebNodePayload> | null)?.tool
    if (!tool || tool.images?.length || tool.operation?.status === "save_pending" || tool.settlementStatus === "outcome_unknown") return false
    if (activeNeedId && (tool.needId ?? tool.protocolId) === activeNeedId) return false
    // A failed attempt stays visible during execution and joins the process once the answer is confirmed.
    return tool.status === "succeeded" ||
      (finalAnswerIds.size > 0 && (tool.status === "failed" || tool.status === "cancelled"))
  }
  if (node.status === "failed" || node.status === "cancelled") return false
  if (node.renderer === "text") {
    const text = textPayload(node)
    return finalAnswerIds.size > 0 && text !== null && !text.images?.length && !finalAnswerIds.has(node.nodeId)
  }
  const payload = payloadObject(node.payload)
  if (node.renderer === "reasoning") {
    const block = payloadObject(payload?.block)
    return typeof block?.content === "string"
  }
  if (node.renderer === "update") return typeof payload?.content === "string"
  if (node.renderer === "agent-report") return node.status === "settled" && typeof payload?.content === "string"
  return false
}

/** Pure presentation over the existing ordered nodes. Payloads, lifecycle and
 * canonical transcript are untouched; membership retains references only. */
export function projectAssistantProcessLayout(
  entry: AssistantEntry,
  nodes: readonly WebNodeView[],
  eligible: (node: WebNodeView) => boolean,
  activeNeedId?: string | null,
  allowConsolidation = true
): AssistantProcessLayout {
  let answerIndex = (entry.reportTurn?.length ?? 1) - 1
  while (answerIndex > 0 && entry.reportTurn?.[answerIndex].role !== "assistant") answerIndex--
  const answer = entry.reportTurn?.[answerIndex]
  const finalBlockIds = allowConsolidation ? finalAssistantBlockIds(entry) : new Set<string>()
  const finalIds = answerIndex > 0 && answer?.role === "assistant"
    ? new Set([...finalBlockIds].map(id => reportSectionNodeId(answer, answerIndex, id))) : finalBlockIds
  const consolidated = finalIds.size > 0
  const scope = entry.timelineUnitId ?? `${entry.runId ?? "local"}:${entry.humanInputBoundarySeq ?? entry.id}`
  const groups: AssistantProcessGroup[] = []
  const membership = new Map<string, AssistantProcessGroup>()
  const owners = entry.reportTurn ? new Map(entry.reportTurn.flatMap((part, index) => part.role === "assistant"
    ? [...blockOwners(part)].map(([id, owner]) => [reportSectionNodeId(part, index, id), owner] as const) : [])) : blockOwners(entry)
  const occurrences = new Map<string, number>()
  const followingBody = new Set<string>()
  let bodyFollows = false
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (bodyFollows) followingBody.add(nodes[i].nodeId)
    if (textPayload(nodes[i])?.content.trim() && eligible(nodes[i])) bodyFollows = true
  }
  let pending: WebNodeView[] = []
  const flush = () => {
    const first = pending[0]
    if (!first) return
    const owner = owners.get(first.nodeId) ?? first.nodeId
    const occurrence = occurrences.get(owner) ?? 0
    occurrences.set(owner, occurrence + 1)
    const group: AssistantProcessGroup = {
      // The occurrence only distinguishes presentation groups within one stable
      // segment. It never sorts/deduplicates canonical messages or events.
      id: consolidated ? `${scope}:completed-process` : `${scope}:process:${owner}:${occurrence}`,
      nodeIds: new Set(pending.map(node => node.nodeId)),
      autoCollapse: consolidated || followingBody.has(first.nodeId),
    }
    groups.push(group)
    for (const node of pending) membership.set(node.nodeId, group)
    pending = []
  }
  for (const node of nodes) {
    if (eligible(node) && belongsToProcess(node, finalIds, activeNeedId)) pending.push(node)
    else if (!consolidated) flush()
  }
  flush()
  return { groups, membership, consolidated }
}
