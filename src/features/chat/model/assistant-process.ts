import type { AssistantEntry } from "../gateway-chat-types"
import type { WebNodeView } from "../web-node"
import { DEFAULT_WEB_PLUGIN_ID } from "../web-node"
import type { TextWebNodePayload, ToolWebNodePayload } from "../runtime/web-node-projection"

/** Presentation of known schemas only; unknown/plugin content remains visible. */
export function isAssistantProcessNode(node: WebNodeView, activeNeedId?: string | null) {
  if (node.pluginId !== DEFAULT_WEB_PLUGIN_ID) return false
  if (node.renderer === "reasoning" || node.renderer === "update") return true
  if (node.renderer === "text") {
    const payload = node.payload as Partial<TextWebNodePayload> | null
    return payload?.assistantPhase === "commentary" && !payload.images?.length
  }
  if (node.renderer === "tool") {
    const tool = (node.payload as Partial<ToolWebNodePayload> | null)?.tool
    if (!tool || !["pending", "running", "succeeded"].includes(tool.status) || tool.images?.length ||
        tool.operation?.status === "save_pending" || tool.settlementStatus === "outcome_unknown") return false
    return !activeNeedId || (tool.needId ?? tool.protocolId) !== activeNeedId
  }
  return false
}

export function assistantAnswerText(entry: AssistantEntry) {
  return entry.pane.blockOrder.flatMap(id => {
    const block = entry.pane.blocks[id]
    return block?.type === "text" && block.assistantPhase !== "commentary" ? [block.content] : []
  }).join("\n\n").trim()
}

export function canAutoCollapseAssistantProcess(entry: AssistantEntry) {
  if (entry.runStatus !== "completed" || entry.status !== "done") return false
  // Every loaded live segment must have completed its canonical handoff. A
  // terminal run event, one canonical tail or transport EOF is insufficient.
  const segments = entry.segments ? Object.values(entry.segments) : [entry]
  return segments.length > 0 && segments.every(segment =>
    Number.isSafeInteger(segment.canonicalMessageSeqEnd) && !segment.canonicalDraft) &&
    Boolean(assistantAnswerText(entry) || Object.values(entry.pane.blocks).some(block => block.type === "text" && block.images?.length))
}
