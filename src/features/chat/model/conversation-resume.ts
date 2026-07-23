export type PendingConversationResumeState = {
  conversationId: string
  runId?: string | null
  afterSeq?: number | null
}

type ConversationResumeStorage = {
  version: 2
  conversations: Record<string, PendingConversationResumeState>
}

const CONVERSATION_RESUME_STORAGE_KEY = "ineffable:conversation-stream-resume"
const CONVERSATION_RESUME_STORAGE_VERSION = 2

function normalizeResumeState(
  value: unknown
): PendingConversationResumeState | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const candidate = value as Partial<PendingConversationResumeState>
  if (
    typeof candidate.conversationId !== "string" ||
    !candidate.conversationId.trim()
  ) {
    return null
  }

  return {
    conversationId: candidate.conversationId,
    runId: typeof candidate.runId === "string" ? candidate.runId : null,
    afterSeq:
      typeof candidate.afterSeq === "number" && Number.isFinite(candidate.afterSeq)
        ? candidate.afterSeq
        : null,
  }
}

function emptyResumeStorage(): ConversationResumeStorage {
  return {
    version: CONVERSATION_RESUME_STORAGE_VERSION,
    conversations: {},
  }
}

function readResumeStorage(): ConversationResumeStorage {
  if (typeof window === "undefined") {
    return emptyResumeStorage()
  }

  try {
    const raw = window.sessionStorage.getItem(CONVERSATION_RESUME_STORAGE_KEY)
    if (!raw) {
      return emptyResumeStorage()
    }

    const parsed = JSON.parse(raw) as unknown
    const legacyState = normalizeResumeState(parsed)
    if (legacyState) {
      return {
        version: CONVERSATION_RESUME_STORAGE_VERSION,
        conversations: {
          [legacyState.conversationId]: legacyState,
        },
      }
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as { version?: unknown }).version !==
        CONVERSATION_RESUME_STORAGE_VERSION
    ) {
      return emptyResumeStorage()
    }

    const rawConversations = (parsed as { conversations?: unknown }).conversations
    if (!rawConversations || typeof rawConversations !== "object") {
      return emptyResumeStorage()
    }

    const conversations = Object.fromEntries(
      Object.values(rawConversations)
        .map(normalizeResumeState)
        .filter(
          (state): state is PendingConversationResumeState => state !== null
        )
        .map((state) => [state.conversationId, state])
    )

    return {
      version: CONVERSATION_RESUME_STORAGE_VERSION,
      conversations,
    }
  } catch {
    return emptyResumeStorage()
  }
}

function writeResumeStorage(storage: ConversationResumeStorage) {
  if (typeof window === "undefined") {
    return
  }

  if (Object.keys(storage.conversations).length === 0) {
    window.sessionStorage.removeItem(CONVERSATION_RESUME_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(
    CONVERSATION_RESUME_STORAGE_KEY,
    JSON.stringify(storage)
  )
}

export function readConversationResumeState(
  conversationId: string
): PendingConversationResumeState | null {
  if (!conversationId) {
    return null
  }

  return readResumeStorage().conversations[conversationId] ?? null
}

export function writeConversationResumeState(
  state: PendingConversationResumeState
) {
  const normalized = normalizeResumeState(state)
  if (!normalized) {
    return
  }

  const storage = readResumeStorage()
  storage.conversations[normalized.conversationId] = normalized
  writeResumeStorage(storage)
}

export function clearConversationResumeState(conversationId: string) {
  if (!conversationId) {
    return
  }

  const storage = readResumeStorage()
  delete storage.conversations[conversationId]
  writeResumeStorage(storage)
}
