import type { AgentPaneState, PaneBlock } from "@/features/chat/chat-pane-state"
import type { ChatEntry } from "@/features/chat/gateway-chat-types"

export type ConversationScrollAnchor = {
  atBottom: boolean
  scrollTop: number
  rowKey?: string
  rowTop?: number
}

export type ConversationWindowSnapshot = {
  entries: ChatEntry[]
  renderedEntryLimit: number
  olderMessagesCursor: string | null
  hasOlderMessages: boolean
  scrollAnchor: ConversationScrollAnchor
}

type WindowMeasure = { nodes: number; bytes: number; exceeded: boolean }
type CachedWindow = {
  snapshot: ConversationWindowSnapshot
  nodes: number
  bytes: number
}

const DEFAULT_MAX_CONVERSATIONS = 4
const DEFAULT_MAX_NODES = 1_200
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

function stringBytes(value: string | null | undefined) {
  return (value?.length ?? 0) * 2
}

function boundedValueBytes(value: unknown, remaining: number, seen: WeakSet<object>): number {
  if (remaining <= 0 || value == null) return 0
  if (typeof value === "string") return Math.min(remaining, stringBytes(value))
  if (typeof value === "number" || typeof value === "bigint") return Math.min(remaining, 8)
  if (typeof value === "boolean") return Math.min(remaining, 4)
  if (typeof value !== "object" || seen.has(value)) return 0
  seen.add(value)
  let bytes = 0
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    bytes += Math.min(remaining - bytes, stringBytes(key))
    if (bytes >= remaining) break
    const child = (value as Record<string, unknown>)[key]
    bytes += boundedValueBytes(child, remaining - bytes, seen)
    if (bytes >= remaining) break
  }
  return bytes
}

function blockBytes(block: PaneBlock, pane: AgentPaneState, remaining: number) {
  if (remaining <= 0) return 0
  if (block.type === "text" || block.type === "think" || block.type === "update") {
    return Math.min(remaining, stringBytes(block.content))
  }
  if (block.type === "tool") {
    const tool = pane.tools[block.toolId]
    return tool
      ? Math.min(
          remaining,
          stringBytes(tool.name) + stringBytes(tool.input) + stringBytes(tool.output)
        )
      : 0
  }
  return boundedValueBytes(block.node, remaining, new WeakSet())
}

function paneMeasure(
  pane: AgentPaneState,
  remainingNodes: number,
  remainingBytes: number
) {
  let nodes = 0
  let bytes = 0
  for (const blockId of pane.blockOrder) {
    if (nodes >= remainingNodes || bytes >= remainingBytes) break
    const block = pane.blocks[blockId]
    if (!block) continue
    nodes += 1
    bytes += blockBytes(block, pane, remainingBytes - bytes)
  }
  return { nodes, bytes }
}

export function measureConversationWindow(
  entries: ChatEntry[],
  maxNodes = DEFAULT_MAX_NODES,
  maxBytes = DEFAULT_MAX_BYTES
): WindowMeasure {
  const nodeStop = maxNodes + 1
  const byteStop = maxBytes + 1
  let nodes = 0
  let bytes = 0

  for (const entry of entries) {
    if (nodes >= nodeStop || bytes >= byteStop) break
    nodes += 1
    bytes = Math.min(byteStop, bytes + stringBytes(entry.id))
    if (bytes >= byteStop) break
    const role = entry.role
    if (role === "user" || role === "system") {
      bytes = Math.min(byteStop, bytes + stringBytes(entry.content))
      continue
    }
    if (role === "approval") {
      bytes = Math.min(
        byteStop,
        bytes + stringBytes(entry.action) + stringBytes(entry.error)
      )
      continue
    }

    const main = paneMeasure(entry.pane, nodeStop - nodes, byteStop - bytes)
    nodes += main.nodes
    bytes += main.bytes
    for (const subagentId of entry.subagentOrder) {
      if (nodes >= nodeStop || bytes >= byteStop) break
      const subagent = entry.subagents[subagentId]
      if (!subagent) continue
      bytes = Math.min(byteStop, bytes + stringBytes(subagent.name))
      if (bytes >= byteStop) break
      const child = paneMeasure(subagent, nodeStop - nodes, byteStop - bytes)
      nodes += child.nodes
      bytes += child.bytes
    }
  }

  return {
    nodes,
    bytes,
    exceeded: nodes > maxNodes || bytes > maxBytes,
  }
}

export class ConversationWindowCache {
  private readonly values = new Map<string, CachedWindow>()
  private nodes = 0
  private bytes = 0
  private readonly maxConversations: number
  private readonly maxNodes: number
  private readonly maxBytes: number

  constructor(
    maxConversations = DEFAULT_MAX_CONVERSATIONS,
    maxNodes = DEFAULT_MAX_NODES,
    maxBytes = DEFAULT_MAX_BYTES
  ) {
    this.maxConversations = maxConversations
    this.maxNodes = maxNodes
    this.maxBytes = maxBytes
  }

  get(conversationId: string) {
    const value = this.values.get(conversationId)
    if (!value) return null
    this.values.delete(conversationId)
    this.values.set(conversationId, value)
    return value.snapshot
  }

  set(conversationId: string, snapshot: ConversationWindowSnapshot) {
    const measure = measureConversationWindow(
      snapshot.entries,
      this.maxNodes,
      this.maxBytes
    )
    this.delete(conversationId)
    if (measure.exceeded) return

    this.values.set(conversationId, {
      snapshot,
      nodes: measure.nodes,
      bytes: measure.bytes,
    })
    this.nodes += measure.nodes
    this.bytes += measure.bytes
    while (
      this.values.size > this.maxConversations ||
      this.nodes > this.maxNodes ||
      this.bytes > this.maxBytes
    ) {
      const oldestId = this.values.keys().next().value as string | undefined
      if (!oldestId) break
      this.delete(oldestId)
    }
  }

  delete(conversationId: string) {
    const existing = this.values.get(conversationId)
    if (!existing) return
    this.nodes -= existing.nodes
    this.bytes -= existing.bytes
    this.values.delete(conversationId)
  }

  ids() {
    return [...this.values.keys()]
  }
}
