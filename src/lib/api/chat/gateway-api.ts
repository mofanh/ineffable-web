// Legacy compatibility helpers for the old `/gateway/v1/chat` + `channels/poll`
// path. Product chat should prefer `api-client.ts` and conversation-scoped
// APIs.

import {
  canonicalizeGatewayEvent,
  normalizeGatewayEnvelope,
  normalizePolledEnvelope,
  type FrontendChannelMessage,
  type GatewayChatStreamEnvelope,
} from "@/lib/api/chat/gateway-events"
import {
  createApiError,
  parseApiError,
  toApiUrl,
} from "@/lib/api/base-client"
export { getApiBaseUrl } from "@/lib/api/base-client"

export type {
  FrontendChannelMessage,
  GatewayChatFinalResult,
  GatewayChatStreamEnvelope,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"

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

export type FrontendChannelPollResponse = {
  messages: FrontendChannelMessage[]
}

function parseMaybeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

export {
  canonicalizeGatewayEvent,
  normalizeGatewayEnvelope,
  normalizePolledEnvelope,
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
      buffer = buffer.slice(
        separatorIndex + (buffer[separatorIndex] === "\r" ? 4 : 2)
      )
      flushEvent(rawEvent)
      separatorIndex = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    flushEvent(buffer)
  }
}

export async function pollFrontendChannel(channel: string, max = 50) {
  const params = new URLSearchParams({
    channel,
    max: String(max),
  })

  const response = await fetch(
    toApiUrl(`/gateway/v1/channels/poll?${params.toString()}`)
  )

  if (!response.ok) {
    throw createApiError(await parseApiError(response))
  }

  return (await response.json()) as FrontendChannelPollResponse
}

export async function streamGatewayChat(
  payload: GatewayChatRequest,
  options: {
    signal?: AbortSignal
    onEnvelope: (envelope: GatewayChatStreamEnvelope) => void
  }
) {
  const response = await fetch(toApiUrl("/gateway/v1/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  })

  if (!response.ok) {
    throw createApiError(await parseApiError(response))
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
