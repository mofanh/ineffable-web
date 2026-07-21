const CHAT_SCROLL_DEBUG_STORAGE_KEY = "ineffable.chat.scroll_debug"
const CHAT_SCROLL_TRACE_LIMIT = 800

type ChatScrollTraceValue = string | number | boolean | null | undefined
type ChatScrollTraceDetails = Record<string, ChatScrollTraceValue>

export type ChatScrollTraceEntry = {
  at: string
  elapsedMs: number
  event: string
  details: Record<string, ChatScrollTraceValue>
}

declare global {
  interface Window {
    __ineffableChatScrollTrace?: ChatScrollTraceEntry[]
  }
}

let chatScrollDebugEnabled: boolean | null = null

function isChatScrollDebugEnabled() {
  if (chatScrollDebugEnabled != null) {
    return chatScrollDebugEnabled
  }

  if (typeof window === "undefined") {
    return false
  }

  try {
    chatScrollDebugEnabled =
      window.localStorage.getItem(CHAT_SCROLL_DEBUG_STORAGE_KEY) === "true"
  } catch {
    chatScrollDebugEnabled = false
  }

  return chatScrollDebugEnabled
}

export function traceChatScroll(
  event: string,
  details: ChatScrollTraceDetails | (() => ChatScrollTraceDetails) = {}
) {
  if (!isChatScrollDebugEnabled()) {
    return
  }

  const entry: ChatScrollTraceEntry = {
    at: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() * 100) / 100,
    event,
    details: typeof details === "function" ? details() : details,
  }
  const trace = window.__ineffableChatScrollTrace ?? []
  trace.push(entry)
  if (trace.length > CHAT_SCROLL_TRACE_LIMIT) {
    trace.splice(0, trace.length - CHAT_SCROLL_TRACE_LIMIT)
  }
  window.__ineffableChatScrollTrace = trace
  console.debug("[chat-scroll]", entry)
}
