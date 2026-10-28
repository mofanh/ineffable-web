import type { GatewayChatStreamEnvelope } from "@/lib/api/chat/gateway-events"
import type { ChatRuntimeStore } from "@/features/chat/runtime/chat-runtime-store"

type Subscribe = (
  conversationId: string,
  runId: string | null,
  afterSeq: number | null,
  signal: AbortSignal,
  onEnvelope: (envelope: GatewayChatStreamEnvelope) => void,
  onOpen: () => void
) => Promise<void>

export class ConversationRuntimeController {
  private readonly subscriptions = new Map<string, AbortController>()
  private readonly store: ChatRuntimeStore

  constructor(store: ChatRuntimeStore) {
    this.store = store
  }

  async connect(
    conversationId: string,
    runId: string | null,
    afterSeq: number | null,
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void,
    subscribe: Subscribe
  ) {
    this.disconnect(conversationId)
    const controller = new AbortController()
    this.subscriptions.set(conversationId, controller)
    const isCurrentConnection = () => !controller.signal.aborted &&
      this.subscriptions.get(conversationId) === controller
    this.store.dispatch(conversationId, { type: "connect", runId })
    try {
      await subscribe(
        conversationId,
        runId,
        afterSeq,
        controller.signal,
        (envelope) => {
          if (isCurrentConnection()) {
            onEnvelope(envelope)
          }
        },
        () => {
          if (isCurrentConnection()) {
            this.store.dispatch(conversationId, { type: "connected" })
          }
        }
      )
      if (!controller.signal.aborted) {
        this.store.dispatch(conversationId, { type: "transport_closed" })
      }
      return controller.signal.aborted ? "aborted" : "closed"
    } catch (error) {
      if (!controller.signal.aborted) {
        this.store.dispatch(conversationId, {
          type: "recovering",
          error: error instanceof Error ? error.message : "Stream failed",
        })
        throw error
      }
      return "aborted"
    } finally {
      if (this.subscriptions.get(conversationId) === controller) {
        this.subscriptions.delete(conversationId)
      }
    }
  }

  disconnect(conversationId: string) {
    this.subscriptions.get(conversationId)?.abort()
    this.subscriptions.delete(conversationId)
    this.store.dispatch(conversationId, { type: "transport_closed" })
  }

  disconnectAll() {
    for (const conversationId of this.subscriptions.keys()) {
      this.disconnect(conversationId)
    }
  }
}
