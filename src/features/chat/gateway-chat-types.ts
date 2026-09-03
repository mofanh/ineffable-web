import type { AgentPaneState } from "@/features/chat/chat-pane-state"

export type StreamStatus = "idle" | "streaming" | "recovering" | "completed" | "error"

export type UserEntry = {
  id: string
  role: "user"
  content: string
  timelineSeq?: number | null
  timelineUnitId?: string | null
}

export type SystemEntry = {
  id: string
  role: "system"
  content: string
  timelineSeq?: number | null
  timelineUnitId?: string | null
}

export type ApprovalEntryStatus =
  | "pending"
  | "approving"
  | "rejecting"
  | "approved"
  | "rejected"
  | "error"

export type ApprovalEntry = {
  id: string
  role: "approval"
  needId: string
  action: string
  approvalId?: string | null
  executionSessionId?: string | null
  environmentId?: string | null
  providerId?: string | null
  runId?: string | null
  sessionKey?: string | null
  status: ApprovalEntryStatus
  error?: string | null
  timelineSeq?: number | null
  timelineUnitId?: string | null
}

export type SubagentView = AgentPaneState & {
  id: string
  name: string
  status: "streaming" | "done"
}

export type CapabilityExposureSummary = {
  mode: "smart" | "clean" | "full" | "custom"
  authorizedCount: number
  initialExposedCount: number
  prefetchedCount: number
  activatedCount: number
  finalExposedCount: number
  deferredCount: number
  stableCount: number
  dynamicCount: number
  schemaBytes: number
  planHash: string
}

export type AssistantEntry = {
  id: string
  role: "assistant"
  runId?: string | null
  definitionFingerprint?: string | null
  agentId?: string | null
  modelProfileId?: string | null
  sandboxEnvironmentId?: string | null
  runStartedAt?: string | null
  runCompletedAt?: string | null
  runDurationMs?: number | null
  capabilityExposure?: CapabilityExposureSummary | null
  createdAt?: string | null
  canonicalMessageSeqEnd?: number | null
  timelineSeq?: number | null
  timelineUnitId?: string | null
  status: "streaming" | "done" | "error"
  pane: AgentPaneState
  subagentOrder: string[]
  subagents: Record<string, SubagentView>
}

export type ChatEntry = UserEntry | SystemEntry | ApprovalEntry | AssistantEntry
