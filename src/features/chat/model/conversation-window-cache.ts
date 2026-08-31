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

const MAX_VALUE_VISITS = 50_000

function boundedValueBytes(value: unknown, remaining: number): number {
  if (remaining <= 0) return 0
  const seen = new WeakSet<object>()
  const pending: unknown[] = [value]
  let bytes = 0
  let visits = 0

  while (pending.length > 0 && bytes < remaining) {
    if (visits >= MAX_VALUE_VISITS) return remaining
    visits += 1
    const current = pending.pop()
    if (current == null) continue
    if (typeof current === "string") {
      bytes += Math.min(remaining - bytes, stringBytes(current))
      continue
    }
    if (typeof current === "number" || typeof current === "bigint") {
      bytes += Math.min(remaining - bytes, 8)
      continue
    }
    if (typeof current === "boolean") {
      bytes += Math.min(remaining - bytes, 4)
      continue
    }
    if (typeof current !== "object" || seen.has(current)) continue
    seen.add(current)
    for (const key in current as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue
      if (visits >= MAX_VALUE_VISITS) return remaining
      visits += 1
      bytes += Math.min(remaining - bytes, stringBytes(key))
      if (bytes >= remaining) break
      pending.push((current as Record<string, unknown>)[key])
    }
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
  return boundedValueBytes(block.node, remaining)
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
    this.delete(conversationId)
    let measure: WindowMeasure
    try {
      measure = measureConversationWindow(
        snapshot.entries,
        this.maxNodes,
        this.maxBytes
      )
    } catch {
      // The cache is optional. Malformed plugin payloads must never block
      // conversation selection; skip this snapshot and hydrate from history.
      return
    }
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
