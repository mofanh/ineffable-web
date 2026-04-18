export type GatewayChatRequest = {
  channel: string
  account_id?: string | null
  peer_id?: string | null
  guild_id?: string | null
  content: string
  stream?: boolean
  auto_reply?: boolean | null
  reply?: Record<string, unknown> | null
}

export type GatewayChatStreamEvent = {
  run_id?: string
  seq?: number
  ts_ms?: number
  stream?: string
  event: string
  phase?: string | null
  scope?: string | null
  role?: string | null
  content?: string | null
  metadata?: Record<string, unknown> | null
}

export type GatewayForwardMessage = {
  scope?: string | null
  role?: string | null
  content: string
  metadata?: Record<string, unknown> | null
}

export type GatewayChatFinalResult = {
  output?: string
  session_key?: string
  agent_id?: string
  forward_messages?: GatewayForwardMessage[]
  send_result?: unknown
}

export type GatewayChatStreamEnvelope =
  | {
      type: "event"
      event: GatewayChatStreamEvent
    }
  | {
      type: "final"
      result: GatewayChatFinalResult
    }
  | {
      type: "error"
      error: string
    }

export type FrontendChannelMessage = {
  channel: string
  to: string | null
  content: string
  metadata?: Record<string, unknown> | null
  timestamp_ms: number
}

export type FrontendChannelPollResponse = {
  messages: FrontendChannelMessage[]
}

const API_BASE_URL =
  (import.meta.env.VITE_GATEWAY_API_BASE_URL as string | undefined)?.trim() ||
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

function parseMaybeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

export function getGatewayApiBaseUrl() {
  return API_BASE_URL || "(same-origin)"
}

export function normalizeGatewayEnvelope(
  raw: unknown
): GatewayChatStreamEnvelope | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as Record<string, unknown>
  const type = candidate.type

  if (type === "delta" || type === "message") {
    const event = candidate.event

    if (!event || typeof event !== "object") {
      return null
    }

    return {
      type: "event",
      event: event as GatewayChatStreamEvent,
    }
  }

  if (type === "final") {
    return {
      type,
      result:
        candidate.result && typeof candidate.result === "object"
          ? (candidate.result as GatewayChatFinalResult)
          : {},
    }
  }

  if (type === "error") {
    return {
      type,
      error: String(candidate.error ?? "Gateway stream failed"),
    }
  }

  if ("event" in candidate && typeof candidate.event === "string") {
    const eventName = candidate.event
    const content = typeof candidate.content === "string" ? candidate.content : ""
    if (eventName === "error" || eventName.endsWith("_error")) {
      return {
        type: "error",
        error: content || "Gateway stream failed",
      }
    }

    return {
      type: "event",
      event: candidate as GatewayChatStreamEvent,
    }
  }

  return null
}

export function normalizePolledEnvelope(message: FrontendChannelMessage) {
  const parsed = parseMaybeJson(message.content)
  const envelope = normalizeGatewayEnvelope(parsed)

  if (envelope) {
    return envelope
  }

  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null

  if (metadata) {
    const nestedEnvelope = normalizeGatewayEnvelope(metadata.envelope)
    if (nestedEnvelope) {
      return nestedEnvelope
    }

    const eventName = typeof metadata.event === "string" ? metadata.event : ""
    if (eventName) {
      return normalizeGatewayEnvelope({
        run_id:
          typeof metadata.run_id === "string"
            ? metadata.run_id
            : message.channel,
        seq:
          typeof metadata.seq === "number"
            ? metadata.seq
            : message.timestamp_ms,
        ts_ms:
          typeof metadata.ts_ms === "number"
            ? metadata.ts_ms
            : message.timestamp_ms,
        stream:
          typeof metadata.stream === "string" ? metadata.stream : "chat",
        event: eventName,
        phase: typeof metadata.phase === "string" ? metadata.phase : null,
        scope: typeof metadata.scope === "string" ? metadata.scope : null,
        role: typeof metadata.role === "string" ? metadata.role : null,
        content: message.content,
        metadata,
      })
    }
  }

  if (parsed && typeof parsed === "object" && "content" in (parsed as object)) {
    return null
  }

  return null
}

export async function pollFrontendChannel(channel: string, max = 50) {
  const params = new URLSearchParams({
    channel,
    max: String(max),
  })

  const response = await fetch(
    toUrl(`/gateway/v1/channels/poll?${params.toString()}`)
  )

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Poll failed: ${response.status}`)
  }

  return (await response.json()) as FrontendChannelPollResponse
}

async function parseSseStream(
  response: Response,
  onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
) {
  if (!response.body) {
    throw new Error("Stream body is empty")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/)
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())

    if (!dataLines.length) {
      return
    }

    const parsed = parseMaybeJson(dataLines.join("\n"))
    const envelope = normalizeGatewayEnvelope(parsed)

    if (envelope) {
      onEnvelope(envelope)
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    let separatorIndex = buffer.search(/\r?\n\r?\n/)
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + (buffer[separatorIndex] === "\r" ? 4 : 2))
      flushEvent(rawEvent)
      separatorIndex = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    flushEvent(buffer)
  }
}

export async function streamGatewayChat(
  payload: GatewayChatRequest,
  options: {
    signal?: AbortSignal
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
  }
) {
  const response = await fetch(toUrl("/gateway/v1/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  if (contentType.includes("text/event-stream")) {
    await parseSseStream(response, options.onEnvelope)
    return
  }

  const parsed = normalizeGatewayEnvelope(await response.json())
  if (parsed) {
    options.onEnvelope(parsed)
  }
}