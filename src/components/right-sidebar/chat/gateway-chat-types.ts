import type { AgentPaneState } from "@/components/right-sidebar/chat/chat-pane-state"

export type StreamStatus = "idle" | "streaming" | "recovering" | "completed" | "error"

export type UserEntry = {
  id: string
  role: "user"
  content: string
}

export type SystemEntry = {
  id: string
  role: "system"
  content: string
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
}

export type SubagentView = AgentPaneState & {
  id: string
  name: string
  status: "streaming" | "done"
}

export type AssistantEntry = {
  id: string
  role: "assistant"
  status: "streaming" | "done" | "error"
  pane: AgentPaneState
  subagentOrder: string[]
  subagents: Record<string, SubagentView>
}

export type ChatEntry = UserEntry | SystemEntry | ApprovalEntry | AssistantEntry
