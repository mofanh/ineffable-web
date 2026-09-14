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
  executionEpoch: number | null
  lifecycle: RunLifecycle
  connection: StreamConnectionState
  compacting: boolean
  activityVersion: number
  activitySeq: number
  lastSeq: number
  terminalEventSeen: boolean
  error: string | null
}

export type RuntimeAction =
  | { type: "connect"; runId?: string | null; executionEpoch?: number | null }
  | { type: "connected" }
  | { type: "recovering"; error?: string | null }
  | { type: "transport_closed" }
  | { type: "event"; event: GatewayChatStreamEvent }
  | { type: "activity-snapshot"; runId: string; executionEpoch: number; seq: number; activityVersion: number; compacting: boolean }
  | { type: "reset" }

export function createConversationRunRuntime(
  conversationId: string
): ConversationRunRuntime {
  return {
    conversationId,
    runId: null,
    executionEpoch: null,
    lifecycle: "idle",
    connection: "idle",
    compacting: false,
    activitySeq: 0,
    activityVersion: 0,
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
  if (action.type === "activity-snapshot") {
    if (!Number.isSafeInteger(action.seq) || action.seq < Math.max(state.lastSeq, state.activitySeq) ||
        !Number.isSafeInteger(action.executionEpoch) || action.executionEpoch < 0) return state
    if (state.runId && state.runId !== action.runId) {
      // This snapshot belongs to the page's authoritative current_run. Epochs are per run.
      state = { ...createConversationRunRuntime(state.conversationId), lastSeq: state.lastSeq }
    }
    if (action.executionEpoch < (state.executionEpoch ?? 0) || state.terminalEventSeen ||
        !Number.isSafeInteger(action.activityVersion) || action.activityVersion < 0) return state
    if (action.executionEpoch === state.executionEpoch && action.compacting && action.activityVersion < state.activityVersion) return state
    return { ...state, runId: action.runId, executionEpoch: action.executionEpoch,
      compacting: action.compacting, activitySeq: action.seq, activityVersion: action.activityVersion }
  }
  if (action.type === "connect") {
    if (action.runId && action.runId !== state.runId) {
      state = { ...createConversationRunRuntime(state.conversationId), lastSeq: state.lastSeq }
    }
    return {
      ...state,
      runId: action.runId ?? state.runId,
      executionEpoch: action.runId && action.runId !== state.runId
        ? action.executionEpoch ?? null
        : Math.max(state.executionEpoch ?? 0, action.executionEpoch ?? 0) || null,
      compacting: action.executionEpoch != null && action.executionEpoch > (state.executionEpoch ?? 0)
        ? false : state.compacting,
      activityVersion: action.executionEpoch != null && action.executionEpoch > (state.executionEpoch ?? 0)
        ? 0 : state.activityVersion,
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

  const rawEpoch = action.event.metadata?.execution_epoch
  const epoch = typeof rawEpoch === "number" && Number.isSafeInteger(rawEpoch) ? rawEpoch : null
  if (epoch != null && state.executionEpoch != null && epoch < state.executionEpoch) return state
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
  const activityKind = action.event.event
  const closesActivity = terminal || nextLifecycle === "awaiting_human" || nextLifecycle === "suspended"
  const epochChanged = epoch != null && epoch > (state.executionEpoch ?? 0)
  let activityVersion = epochChanged ? 0 : state.activityVersion
  let compacting = state.compacting
  if (seq > state.activitySeq) {
    if (closesActivity || epochChanged || activityKind === "run.started" || activityKind === "run.resumed" ||
        activityKind === "model.text.delta" || activityKind === "model.reasoning.delta") compacting = false
    if (!closesActivity && ["agent.compaction.started", "agent.compaction.completed", "agent.compaction.failed"].includes(activityKind)) {
      const version = action.event.metadata?.activity_seq
      if (typeof version === "number" && Number.isSafeInteger(version) && version > activityVersion) {
        compacting = activityKind === "agent.compaction.started"
        activityVersion = version
      }
    }
  }

  return {
    ...state,
    runId: identity.runId,
    executionEpoch: epoch ?? state.executionEpoch,
    lifecycle: nextLifecycle,
    compacting,
    activityVersion,
    activitySeq: Math.max(state.activitySeq, Math.floor(seq)),
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
