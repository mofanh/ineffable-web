import { ChatTelemetry } from "./chat-telemetry.ts"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import {
  createConversationRunRuntime,
  reduceConversationRunRuntime,
  type ConversationRunRuntime,
  type RuntimeAction,
} from "./conversation-run-reducer.ts"

type RuntimeListener = () => void

export class ChatRuntimeStore {
  private readonly telemetry = new ChatTelemetry()
  private readonly states = new Map<string, ConversationRunRuntime>()
  private readonly listeners = new Set<RuntimeListener>()
  // A stable React snapshot of the run projection reader. Invalidate only
  // when controls change; text / transport observations keep this identity.
  private runProjection = { getRun: (id: string) => this.states.get(id)?.currentRun ?? null }

  getRunProjection() {
    return this.runProjection
  }

  get(conversationId: string) {
    let state = this.states.get(conversationId)
    if (!state) {
      state = createConversationRunRuntime(conversationId)
      this.states.set(conversationId, state)
    }
    return state
  }

  dispatch(conversationId: string, action: RuntimeAction) {
    const current = this.get(conversationId)
    const next = reduceConversationRunRuntime(current, action)
    if (next === current) {
      return current
    }
    if (action.type === "reset") this.telemetry.forget(current.runId)
    this.states.set(conversationId, next)
    if (next.currentRun !== current.currentRun) this.runProjection = { ...this.runProjection }
    if (action.type === "event") this.telemetry.observe(action.event, next.runId, next.executionEpoch)
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
