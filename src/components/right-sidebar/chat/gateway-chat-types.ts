import type { AgentPaneState } from "@/components/right-sidebar/chat/chat-pane-state"

export type StreamStatus = "idle" | "streaming" | "completed" | "error"

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

export type ChatEntry = UserEntry | SystemEntry | AssistantEntry
