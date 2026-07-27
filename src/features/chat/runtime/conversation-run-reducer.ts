import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { getConversationEventIdentity } from "../model/conversation-event-routing.ts"

export type RunLifecycle =
  | "idle"
  | "running"
  | "awaiting_human"
  | "suspended"
  | "completed"
  | "failed"
  | "cancelled"

export type StreamConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "recovering"
  | "closed"

export type ConversationRunRuntime = {
  conversationId: string
  runId: string | null
  lifecycle: RunLifecycle
  connection: StreamConnectionState
  lastSeq: number
  terminalEventSeen: boolean
  error: string | null
}

export type RuntimeAction =
  | { type: "connect"; runId?: string | null }
  | { type: "connected" }
  | { type: "recovering"; error?: string | null }
  | { type: "transport_closed" }
  | { type: "event"; event: GatewayChatStreamEvent }
  | { type: "reset" }

export function createConversationRunRuntime(
  conversationId: string
): ConversationRunRuntime {
  return {
    conversationId,
    runId: null,
    lifecycle: "idle",
    connection: "idle",
    lastSeq: 0,
    terminalEventSeen: false,
    error: null,
  }
}

function lifecycleFromEvent(
  kind: string
): Exclude<RunLifecycle, "idle"> | null {
  switch (kind) {
    case "run.started":
    case "run.resumed":
      return "running"
    case "run.awaiting_human":
      return "awaiting_human"
    case "run.suspended":
      return "suspended"
    case "run.completed":
      return "completed"
    case "run.failed":
      return "failed"
    case "run.cancelled":
      return "cancelled"
    default:
      return null
  }
}

function isTerminal(lifecycle: RunLifecycle) {
  return (
    lifecycle === "completed" ||
    lifecycle === "failed" ||
    lifecycle === "cancelled"
  )
}

export function reduceConversationRunRuntime(
  state: ConversationRunRuntime,
  action: RuntimeAction
): ConversationRunRuntime {
  if (action.type === "reset") {
    return createConversationRunRuntime(state.conversationId)
  }
  if (action.type === "connect") {
    return {
      ...state,
      runId: action.runId ?? state.runId,
      connection: "connecting",
      error: null,
    }
  }
  if (action.type === "connected") {
    return { ...state, connection: "open", error: null }
  }
  if (action.type === "recovering") {
    return {
      ...state,
      connection: "recovering",
      error: action.error ?? state.error,
    }
  }
  if (action.type === "transport_closed") {
    return {
      ...state,
      connection: "closed",
    }
  }

  const identity = getConversationEventIdentity(action.event)
  if (!identity || identity.conversationId !== state.conversationId) {
    return state
  }
  if (state.runId && state.runId !== identity.runId) {
    if (action.event.event !== "run.started" || !state.terminalEventSeen) {
      return state
    }
    state = {
      ...createConversationRunRuntime(state.conversationId),
      lastSeq: state.lastSeq,
      connection: state.connection,
    }
  }

  const seq = action.event.seq
  if (
    typeof seq !== "number" ||
    !Number.isFinite(seq) ||
    seq <= state.lastSeq
  ) {
    return state
  }
  const lifecycle = lifecycleFromEvent(action.event.event)
  if (state.terminalEventSeen && lifecycle) {
    return state
  }
  const nextLifecycle = lifecycle ?? state.lifecycle
  const terminal = isTerminal(nextLifecycle)

  return {
    ...state,
    runId: identity.runId,
    lifecycle: nextLifecycle,
    connection:
      terminal ||
      nextLifecycle === "awaiting_human" ||
      nextLifecycle === "suspended"
        ? "closed"
        : state.connection,
    lastSeq: Math.floor(seq),
    terminalEventSeen: terminal,
    error:
      nextLifecycle === "failed"
        ? action.event.content?.trim() || "Agent run failed"
        : state.error,
  }
}
