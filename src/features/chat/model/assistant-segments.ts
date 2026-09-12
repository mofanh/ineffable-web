import type { AssistantEntry } from "../gateway-chat-types"
import { createEmptyAgentPane, type AgentPaneState } from "../chat-pane-state"

export type TranscriptSegment = { id: string; turn: number; execution_epoch: number }

export function transcriptSegment(metadata: Record<string, unknown> | null | undefined): TranscriptSegment | null {
  const value = metadata?.transcript_segment as TranscriptSegment | undefined
  return value && typeof value.id === "string" && value.id.length > 0 &&
    Number.isSafeInteger(value.turn) && value.turn >= 0 &&
    Number.isSafeInteger(value.execution_epoch) && value.execution_epoch >= 0 ? value : null
}

function joinPanes(panes: AgentPaneState[]): AgentPaneState {
  const joined = createEmptyAgentPane()
  for (const pane of panes) {
    joined.blockOrder.push(...pane.blockOrder)
    Object.assign(joined.blocks, pane.blocks)
    Object.assign(joined.tools, pane.tools)
    joined.receivedTextDelta ||= pane.receivedTextDelta
  }
  const last = panes.at(-1)
  if (last) {
    joined.activeThinkBlockId = last.activeThinkBlockId
    joined.activeThinkMode = last.activeThinkMode
    joined.pendingTagBuffer = last.pendingTagBuffer
  }
  return joined
}

export function mergeAssistantSegments(
  base: AssistantEntry,
  incoming: AssistantEntry,
  preferIncoming = true
): AssistantEntry {
  const baseSegments = base.segments ?? { legacy: { ...base, segments: undefined } }
  const incomingSegments = incoming.segments ?? {}
  const segments = preferIncoming ? { ...baseSegments, ...incomingSegments } : { ...incomingSegments, ...baseSegments }
  if (!preferIncoming) {
    for (const [key, segment] of Object.entries(incomingSegments)) {
      if (segment.canonicalMessageSeqEnd != null && segment.canonicalMessageSeqEnd > (baseSegments[key]?.canonicalMessageSeqEnd ?? -1)) segments[key] = segment
    }
  }
  const ordered = Object.values(segments).sort((a, b) =>
    (a.segmentIdentity?.turn ?? -1) - (b.segmentIdentity?.turn ?? -1) ||
    (a.segmentIdentity?.execution_epoch ?? -1) - (b.segmentIdentity?.execution_epoch ?? -1))
  const subagentOrder = [...new Set(ordered.flatMap(segment => segment.subagentOrder))]
  const subagents = Object.fromEntries(subagentOrder.map(id => {
    const occurrences = ordered.flatMap(segment => segment.subagents[id] ? [segment.subagents[id]] : [])
    return [id, { ...occurrences.at(-1)!, ...joinPanes(occurrences) }]
  }))
  return { ...base, ...incoming, segments, pane: joinPanes(ordered.map(segment => segment.pane)),
    subagentOrder, subagents, eventCoverage: Math.max(base.eventCoverage ?? 0, incoming.eventCoverage ?? 0) }
}

function replacePaneSegment(root: AgentPaneState, previous: AgentPaneState | undefined, next: AgentPaneState): AgentPaneState {
  const blocks = { ...root.blocks, ...next.blocks }
  const tools = { ...root.tools, ...next.tools }
  for (const id of previous?.blockOrder ?? []) if (!next.blocks[id]) delete blocks[id]
  for (const id of Object.keys(previous?.tools ?? {})) if (!next.tools[id]) delete tools[id]
  let blockOrder = root.blockOrder
  if (previous?.blockOrder !== next.blockOrder) {
    const oldIds = new Set(previous?.blockOrder)
    const first = previous?.blockOrder[0]
    const position = first ? root.blockOrder.indexOf(first) : root.blockOrder.length
    const retained = root.blockOrder.filter(id => !oldIds.has(id))
    blockOrder = [...retained.slice(0, position), ...next.blockOrder, ...retained.slice(position)]
  }
  return { ...root, blocks, tools, blockOrder,
    receivedTextDelta: root.receivedTextDelta || next.receivedTextDelta,
    activeThinkBlockId: next.activeThinkBlockId, activeThinkMode: next.activeThinkMode,
    pendingTagBuffer: next.pendingTagBuffer }
}

/** Streaming mutates only one segment projection; other panes are never replayed. */
export function updateAssistantSegment(base: AssistantEntry, key: string, fragment: AssistantEntry): AssistantEntry {
  const previous = base.segments?.[key]
  const segments = base.segments ?? (base.pane.blockOrder.length || base.subagentOrder.length
    ? { legacy: { ...base, segments: undefined } } : {})
  if (!previous?.pane.blockOrder.length && fragment.pane.blockOrder.length && fragment.segmentIdentity &&
      Object.values(segments).some(segment => segment.segmentIdentity &&
        (segment.segmentIdentity.turn > fragment.segmentIdentity!.turn ||
         (segment.segmentIdentity.turn === fragment.segmentIdentity!.turn && segment.segmentIdentity.execution_epoch > fragment.segmentIdentity!.execution_epoch)))) {
    return mergeAssistantSegments(base, { ...base, segments: { [key]: fragment } })
  }
  const subagents = { ...base.subagents }
  for (const id of fragment.subagentOrder) {
    if (fragment.subagents[id] === previous?.subagents[id]) continue
    subagents[id] = { ...fragment.subagents[id], ...replacePaneSegment(
      base.subagents[id] ?? createEmptyAgentPane(), previous?.subagents[id], fragment.subagents[id]) }
  }
  return { ...base, segments: { ...segments, [key]: fragment },
    status: fragment.status, eventCoverage: Math.max(base.eventCoverage ?? 0, fragment.eventCoverage ?? 0),
    pane: fragment.pane === previous?.pane ? base.pane : replacePaneSegment(base.pane, previous?.pane, fragment.pane),
    subagents, subagentOrder: [...new Set([...base.subagentOrder, ...fragment.subagentOrder])] }
}
