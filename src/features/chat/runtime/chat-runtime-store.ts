import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import {
  createConversationRunRuntime,
  reduceConversationRunRuntime,
  type ConversationRunRuntime,
  type RuntimeAction,
} from "./conversation-run-reducer.ts"

type RuntimeListener = () => void

export class ChatRuntimeStore {
  private readonly states = new Map<string, ConversationRunRuntime>()
  private readonly listeners = new Set<RuntimeListener>()

  get(conversationId: string) {
    return (
      this.states.get(conversationId) ??
      createConversationRunRuntime(conversationId)
    )
  }

  dispatch(conversationId: string, action: RuntimeAction) {
    const current = this.get(conversationId)
    const next = reduceConversationRunRuntime(current, action)
    if (next === current) {
      return current
    }
    this.states.set(conversationId, next)
    this.listeners.forEach((listener) => listener())
    return next
  }

  applyEvent(event: GatewayChatStreamEvent) {
    const metadata = event.metadata
    const conversationId =
      typeof metadata?.conversation_id === "string"
        ? metadata.conversation_id
        : null
    return conversationId
      ? this.dispatch(conversationId, { type: "event", event })
      : null
  }

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
