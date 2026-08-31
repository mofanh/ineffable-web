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

function paneWeight(entry: ChatEntry) {
  if (entry.role !== "assistant") return 1
  return 1 + entry.pane.blockOrder.length + entry.subagentOrder.reduce(
    (total, subagentId) =>
      total + (entry.subagents[subagentId]?.blockOrder.length ?? 0),
    0
  )
}

export function conversationWindowWeight(snapshot: ConversationWindowSnapshot) {
  return snapshot.entries.reduce((total, entry) => total + paneWeight(entry), 0)
}

export class ConversationWindowCache {
  private readonly values = new Map<string, ConversationWindowSnapshot>()
  private weight = 0
  private readonly maxConversations: number
  private readonly maxWeight: number

  constructor(maxConversations = 4, maxWeight = 1_200) {
    this.maxConversations = maxConversations
    this.maxWeight = maxWeight
  }

  get(conversationId: string) {
    const value = this.values.get(conversationId)
    if (!value) return null
    this.values.delete(conversationId)
    this.values.set(conversationId, value)
    return value
  }

  set(conversationId: string, snapshot: ConversationWindowSnapshot) {
    const nextWeight = conversationWindowWeight(snapshot)
    const existing = this.values.get(conversationId)
    if (existing) {
      this.weight -= conversationWindowWeight(existing)
      this.values.delete(conversationId)
    }
    if (nextWeight > this.maxWeight) return

    this.values.set(conversationId, snapshot)
    this.weight += nextWeight
    while (
      this.values.size > this.maxConversations ||
      this.weight > this.maxWeight
    ) {
      const oldestId = this.values.keys().next().value as string | undefined
      if (!oldestId) break
      const oldest = this.values.get(oldestId)
      this.values.delete(oldestId)
      if (oldest) this.weight -= conversationWindowWeight(oldest)
    }
  }

  delete(conversationId: string) {
    const existing = this.values.get(conversationId)
    if (!existing) return
    this.weight -= conversationWindowWeight(existing)
    this.values.delete(conversationId)
  }

  ids() {
    return [...this.values.keys()]
  }
}
