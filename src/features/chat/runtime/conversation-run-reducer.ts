import type { ConversationRunSummary } from "@/lib/api/api-client"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { getConversationEventIdentity, isConversationScopedEvent } from "../model/conversation-event-routing.ts"

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
  currentRun: ConversationRunSummary | null
  lifecycleSeq: number
  runVersion: number | null
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
  | { type: "run-snapshot"; run: ConversationRunSummary | null }
  | { type: "reset-coverage" }
  | { type: "reset" }

export function createConversationRunRuntime(
  conversationId: string
): ConversationRunRuntime {
  return {
    conversationId,
    runId: null,
    executionEpoch: null,
    currentRun: null,
    lifecycleSeq: 0,
    runVersion: null,
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

function validCounter(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function lifecycleFromRun(run: ConversationRunSummary): RunLifecycle {
  const status = run.status
  return ["streaming", "queued", "running"].includes(status) ? "running" :
    ["awaiting_human", "suspended", "completed", "failed", "cancelled"].includes(status) ? status as RunLifecycle : "idle"
}

// State coverage and transcript coverage are independent. A refreshed run must not
// skip an older tool/text event which is still absent from the current timeline.
export function acceptsRunLifecycleEvent(state: ConversationRunRuntime, event: GatewayChatStreamEvent) {
  if (!lifecycleFromEvent(event.event)) return true
  const identity = getConversationEventIdentity(event)
  if (!identity || identity.conversationId !== state.conversationId || (validCounter(event.seq) ?? 0) <= state.lifecycleSeq) return false
  if (state.runId && state.runId !== identity.runId) return event.event === "run.started"
  const epoch = validCounter(event.metadata?.execution_epoch)
  const version = validCounter(event.metadata?.run_version)
  if (epoch != null && state.executionEpoch != null && epoch < state.executionEpoch) return false
  if (version != null && state.runVersion != null && version < state.runVersion) return false
  return !state.terminalEventSeen
}

export function reduceConversationRunRuntime(
  state: ConversationRunRuntime,
  action: RuntimeAction
): ConversationRunRuntime {
  if (action.type === "reset") {
    return createConversationRunRuntime(state.conversationId)
  }
  if (action.type === "reset-coverage") return { ...state, lastSeq: 0 }
  if (action.type === "run-snapshot") {
    const run = action.run
    if (!run) return state.runId ? state : { ...state, currentRun: null }
    const epoch = validCounter(run.execution_epoch)
    const version = validCounter(run.version)
    const seq = validCounter(run.lifecycle_seq) ?? 0
    const sameRun = state.runId === run.id
    if (state.runId && !sameRun && seq <= state.lifecycleSeq) return state
    if (sameRun && ((epoch != null && state.executionEpoch != null && epoch < state.executionEpoch) ||
        (version != null && state.runVersion != null && version < state.runVersion) || seq < state.lifecycleSeq)) return state
    const lifecycle = lifecycleFromRun(run)
    if (sameRun && state.terminalEventSeen && lifecycle !== state.lifecycle) return state
    const epochChanged = !sameRun || (epoch != null && epoch > (state.executionEpoch ?? 0))
    return { ...state, currentRun: run, runId: run.id, executionEpoch: epoch ?? (sameRun ? state.executionEpoch : null),
      runVersion: version ?? (sameRun ? state.runVersion : null), lifecycleSeq: seq, lifecycle,
      terminalEventSeen: isTerminal(lifecycle),
      compacting: epochChanged || lifecycle !== "running" ? false : state.compacting,
      activityVersion: epochChanged ? 0 : state.activityVersion,
      activitySeq: sameRun ? state.activitySeq : 0 }
  }
  if (action.type === "activity-snapshot") {
    if (!Number.isSafeInteger(action.seq) || action.seq < Math.max(state.lastSeq, state.activitySeq) ||
        !Number.isSafeInteger(action.executionEpoch) || action.executionEpoch < 0) return state
    if (state.runId && state.runId !== action.runId) {
      if (action.seq <= state.lifecycleSeq) return state
      state = { ...createConversationRunRuntime(state.conversationId), lastSeq: state.lastSeq }
    }
    if (action.executionEpoch < (state.executionEpoch ?? 0) || state.terminalEventSeen ||
        !Number.isSafeInteger(action.activityVersion) || action.activityVersion < 0) return state
    if (action.executionEpoch === state.executionEpoch && action.compacting && action.activityVersion < state.activityVersion) return state
    return { ...state, runId: action.runId, executionEpoch: action.executionEpoch,
      compacting: action.compacting, activitySeq: action.seq, activityVersion: action.activityVersion }
  }
  if (action.type === "connect") {
    if (action.runId === state.runId && action.executionEpoch != null && state.executionEpoch != null && action.executionEpoch < state.executionEpoch) return state
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
      currentRun: action.executionEpoch != null && action.executionEpoch > (state.executionEpoch ?? 0) && state.currentRun
        ? { ...state.currentRun, status: "streaming", execution_epoch: action.executionEpoch, pending_need: null, accepts_guided_input: false } : state.currentRun,
      lifecycle: action.executionEpoch != null && action.executionEpoch > (state.executionEpoch ?? 0) ? "running" : state.lifecycle,
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
  if (isConversationScopedEvent(action.event)) {
    const seq = action.event.seq
    return typeof seq === "number" && Number.isSafeInteger(seq) && seq > state.lastSeq ? { ...state, lastSeq: seq } : state
  }
  const seq = validCounter(action.event.seq)
  if (seq == null || seq <= state.lastSeq) return state
  const lifecycle = lifecycleFromEvent(action.event.event)
  if (lifecycle && !acceptsRunLifecycleEvent(state, action.event)) return { ...state, lastSeq: seq }
  if (state.runId && state.runId !== identity.runId) {
    if (!lifecycle) return { ...state, lastSeq: seq }
    state = { ...createConversationRunRuntime(state.conversationId), lastSeq: state.lastSeq, connection: state.connection }
  }
  const epoch = validCounter(action.event.metadata?.execution_epoch)
  if (!lifecycle && epoch != null && state.executionEpoch != null && epoch < state.executionEpoch) return { ...state, lastSeq: seq }
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

  const metadata = action.event.metadata
  const currentRun = lifecycle ? {
    ...(state.currentRun ?? { id: identity.runId, is_live: false, is_streaming: false, accepts_guided_input: false }),
    status: nextLifecycle === "running" ? "streaming" : nextLifecycle,
    execution_epoch: epoch ?? state.executionEpoch ?? undefined,
    version: validCounter(metadata?.run_version) ?? state.runVersion ?? undefined,
    lifecycle_seq: seq,
    is_streaming: nextLifecycle === "running",
    is_live: nextLifecycle === "running" ? state.currentRun?.is_live ?? false : false,
    accepts_guided_input: nextLifecycle === "running" ? state.currentRun?.accepts_guided_input ?? false : false,
    pending_need: nextLifecycle === "awaiting_human" && metadata?.pending_need && typeof metadata.pending_need === "object"
      ? metadata.pending_need as Record<string, unknown> : null,
    resume_mode: nextLifecycle === "suspended" && metadata?.resume_mode === "automatic" ? "automatic" as const : "none" as const,
  } : state.currentRun
  return {
    ...state,
    currentRun,
    lifecycleSeq: lifecycle ? seq : state.lifecycleSeq,
    runVersion: lifecycle ? validCounter(metadata?.run_version) ?? state.runVersion : state.runVersion,
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
