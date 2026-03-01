export type AgentType = "planner" | "worker"

export type RunMode = "persistent" | "on_demand"

export type AgentState =
  | "starting"
  | "running"
  | "idle"
  | "busy"
  | "stopped"
  | "error"

export type AgentInfo = {
  id: string
  name: string
  description?: string | null
  config_path: string
  agent_type: AgentType
  run_mode: RunMode
  pid: number | null
  created_at: string
  status?: AgentState
  last_active_at?: string | null
  current_task?: string | null
}

export type MessageSender = "agent" | "human"

export type MessageRecipient = "agent" | "broadcast" | "human"

export type MessageType =
  | "task"
  | "report"
  | "question"
  | "response"
  | "announcement"
  | "system"

export type Message = {
  id: string
  from_agent_id?: string | null
  from_type: MessageSender
  to_agent_id?: string | null
  to_type: MessageRecipient
  message_type?: MessageType
  msg_type?: MessageType
  subject: string
  body: string
  reply_to_id?: string | null
  read_at?: string | null
  created_at: string
}

export type EventLog = {
  id: string
  agent_id?: string | null
  event_type: string
  message: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

export type StreamEvent = {
  event: string
  data: unknown
  receivedAt: string
}

const API_BASE_URL = (import.meta.env.VITE_WORLD_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  ""

function toUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  const normalizedBase = API_BASE_URL.replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

async function requestJson<T>(path: string, options?: RequestInit) {
  const response = await fetch(toUrl(path), options)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export function listAgents() {
  return requestJson<AgentInfo[]>("/api/agents")
}

export function listEvents() {
  return requestJson<EventLog[]>("/api/events")
}

export function listPendingHumanMessages() {
  return requestJson<Message[]>("/api/messages/human/pending")
}

export function getMessageThread(messageId: string) {
  return requestJson<Message[]>(`/api/messages/${messageId}/thread`)
}

export type SendMessagePayload = {
  to_agent_id?: string | null
  to_type: MessageRecipient
  message_type?: MessageType
  subject: string
  body: string
  reply_to_id?: string | null
}

export function sendMessage(payload: SendMessagePayload) {
  return requestJson<Message>("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export function replyToMessage(messageId: string, body: string) {
  return requestJson<Message>(`/api/messages/${messageId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  })
}

type StreamHandlers = {
  onEvent: (event: StreamEvent) => void
  onError?: (error: Event) => void
}

export function connectWorldStream({ onEvent, onError }: StreamHandlers) {
  const source = new EventSource(toUrl("/api/stream"))

  source.onmessage = (event) => {
    let parsedData: unknown = event.data

    if (typeof event.data === "string" && event.data.length > 0) {
      try {
        parsedData = JSON.parse(event.data)
      } catch {
        parsedData = event.data
      }
    }

    onEvent({
      event: "message",
      data: parsedData,
      receivedAt: new Date().toISOString(),
    })
  }

  source.addEventListener("AgentCreated", (event) => {
    onEvent({
      event: "AgentCreated",
      data: (event as MessageEvent).data,
      receivedAt: new Date().toISOString(),
    })
  })

  source.addEventListener("AgentDeleted", (event) => {
    onEvent({
      event: "AgentDeleted",
      data: (event as MessageEvent).data,
      receivedAt: new Date().toISOString(),
    })
  })

  source.addEventListener("AgentStatusChanged", (event) => {
    onEvent({
      event: "AgentStatusChanged",
      data: (event as MessageEvent).data,
      receivedAt: new Date().toISOString(),
    })
  })

  source.addEventListener("NewMessage", (event) => {
    onEvent({
      event: "NewMessage",
      data: (event as MessageEvent).data,
      receivedAt: new Date().toISOString(),
    })
  })

  source.onerror = (error) => {
    onError?.(error)
  }

  return () => {
    source.close()
  }
}
