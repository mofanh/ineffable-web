export type PendingConversationResumeState = {
  conversationId: string
  runId?: string | null
  afterSeq?: number | null
}

const CONVERSATION_RESUME_STORAGE_KEY = "ineffable:conversation-stream-resume"

export function readPendingConversationResumeState(): PendingConversationResumeState | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(CONVERSATION_RESUME_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<PendingConversationResumeState>
    if (
      !parsed ||
      typeof parsed.conversationId !== "string" ||
      !parsed.conversationId.trim()
    ) {
      return null
    }

    return {
      conversationId: parsed.conversationId,
      runId: typeof parsed.runId === "string" ? parsed.runId : null,
      afterSeq:
        typeof parsed.afterSeq === "number" && Number.isFinite(parsed.afterSeq)
          ? parsed.afterSeq
          : null,
    }
  } catch {
    return null
  }
}

export function writePendingConversationResumeState(
  state: PendingConversationResumeState
) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(
    CONVERSATION_RESUME_STORAGE_KEY,
    JSON.stringify(state)
  )
}

export function clearPendingConversationResumeState() {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem(CONVERSATION_RESUME_STORAGE_KEY)
}
