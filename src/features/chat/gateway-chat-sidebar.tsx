import * as React from "react"

import {
  SidebarContent,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  finalizePane,
  getPaneBlocks,
  type AgentPaneState,
  upsertToolInPane,
} from "@/features/chat/chat-pane-state"
import {
  ChatComposer,
  type AgentDescriptorOption,
  type ModelProfileOption,
  type PreInputQueueItem,
} from "@/features/chat/components/chat-composer"
import { ChatMessageList } from "@/features/chat/components/chat-message-list"
import { ChatSidebarHeader } from "@/features/chat/components/chat-sidebar-header"
import {
  createEmptySubagent,
  createMessageId,
  getEventFingerprint,
  getFinalFingerprint,
  getSubagentId,
  getSubagentName,
  getToolCallId,
  getToolName,
  hasAssistantEntryContent,
  isReasoningEvent,
  isSubScope,
  isTextDeltaEvent,
  isToolEvent,
} from "@/features/chat/gateway-chat-helpers"
import type {
  AssistantEntry,
  ApprovalEntry,
  ChatEntry,
  StreamStatus,
  SubagentView,
} from "@/features/chat/gateway-chat-types"
import {
  createAssistantEntry,
  getLiveConversationRun,
  mapConversationMessagesToEntries,
} from "@/features/chat/model/chat-history"
import {
  approvalNeedFromEvent,
  approvalNeedFromRaw,
  buildConversationTitle,
  objectValue,
  parsePendingInputContent,
  parsePendingInputId,
  stringValue,
} from "@/features/chat/model/chat-parsing"
import {
  clearPendingConversationResumeState,
  readPendingConversationResumeState,
  writePendingConversationResumeState,
} from "@/features/chat/model/conversation-resume"
import { notifyWorkspaceToolResult } from "@/features/chat/model/workspace-tool-events"
import { useAppSession } from "@/features/auth/app-session"
import {
  approveSandboxApproval,
  deletePendingInput,
  getConversationEvents,
  getConversationMessages,
  getPendingInputs,
  listModelProfiles,
  listSandboxWorkspaceEnvironments,
  promotePendingInput,
  rejectSandboxApproval,
  resumeRunWithApproval,
  stopConversationRun,
  subscribeConversationEvents,
  streamConversationSend,
  type ModelProfile,
  type ResumeRunResponse,
  type SandboxEnvironmentView,
  type SandboxProviderStatusView,
} from "@/features/chat/api/chat-api"
import { listWorkspaceTree } from "@/features/workspace/api/workspace-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"
import type {
  GatewayChatFinalResult,
  GatewayChatStreamEnvelope,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"
import { canonicalizeGatewayEvent } from "@/lib/api/chat/gateway-events"

function formatSendErrorMessage(message: string) {
  return message.trim() === "no_available_model"
    ? "当前套餐暂无可用模型"
    : message
}

function sandboxStorageKey(conversationId: string | null | undefined) {
  return `ineffable.chat.sandbox.${conversationId ?? "new"}`
}

function sandboxOptionLabel(
  environment: SandboxEnvironmentView,
  provider?: SandboxProviderStatusView
) {
  return provider?.display_name || environment.environment_type || environment.environment_id
}

const INITIAL_RENDERED_ENTRY_COUNT = 40
const RENDERED_ENTRY_INCREMENT = 30
const CONVERSATION_MESSAGES_PAGE_LIMIT = 40

function normalizeEntryContent(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function paneText(entry: AssistantEntry) {
  const mainText = getPaneBlocks(entry.pane)
    .map((block) => ("content" in block ? block.content : ""))
    .filter(Boolean)
    .join("\n")

  const subagentText = entry.subagentOrder
    .map((subagentId) => entry.subagents[subagentId])
    .filter((subagent): subagent is SubagentView => Boolean(subagent))
    .flatMap((subagent) =>
      getPaneBlocks(subagent).map((block) =>
        "content" in block ? block.content : ""
      )
    )
    .filter(Boolean)
    .join("\n")

  return [mainText, subagentText].filter(Boolean).join("\n")
}

function entryFingerprint(entry: ChatEntry) {
  if (entry.role === "user" || entry.role === "system") {
    const content = normalizeEntryContent(entry.content)
    return content ? `${entry.role}:${content}` : null
  }

  if (entry.role === "assistant") {
    if (entry.runId) {
      return `assistant-run:${entry.runId}`
    }

    const content = normalizeEntryContent(paneText(entry))
    return content ? `assistant:${content}` : null
  }

  return entry.approvalId || entry.needId
    ? `approval:${entry.approvalId ?? entry.needId}`
    : null
}

function removeEntriesCoveredByLatest(
  current: ChatEntry[],
  latestEntries: ChatEntry[]
) {
  const latestIds = new Set(latestEntries.map((entry) => entry.id))
  const latestFingerprintCounts = new Map<string, number>()

  latestEntries.forEach((entry) => {
    const fingerprint = entryFingerprint(entry)
    if (!fingerprint) {
      return
    }
    latestFingerprintCounts.set(
      fingerprint,
      (latestFingerprintCounts.get(fingerprint) ?? 0) + 1
    )
  })

  const kept: ChatEntry[] = []
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const entry = current[index]
    if (latestIds.has(entry.id)) {
      continue
    }

    const fingerprint = entryFingerprint(entry)
    const count = fingerprint ? latestFingerprintCounts.get(fingerprint) ?? 0 : 0
    if (fingerprint && count > 0) {
      latestFingerprintCounts.set(fingerprint, count - 1)
      continue
    }

    kept.push(entry)
  }

  return kept.reverse()
}

type GatewayChatSidebarProps = {
  isFullScreen: boolean
  onFullScreenChange: (isFullScreen: boolean) => void
}

export function GatewayChatSidebar({
  isFullScreen,
  onFullScreenChange,
}: GatewayChatSidebarProps) {
  const { toggleSidebar } = useSidebar()
  const {
    accessToken,
    currentWorkspace,
    workspaces,
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    refreshConversations,
  } = useAppSession()

  const [composer, setComposer] = React.useState("")
  const [entries, setEntries] = React.useState<ChatEntry[]>([])
  const [streamStatus, setStreamStatus] = React.useState<StreamStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false)
  const [isLoadingOlderEntries, setIsLoadingOlderEntries] = React.useState(false)
  const [olderMessagesError, setOlderMessagesError] = React.useState<string | null>(null)
  const [renderedEntryLimit, setRenderedEntryLimit] = React.useState(
    INITIAL_RENDERED_ENTRY_COUNT
  )
  const [olderMessagesCursor, setOlderMessagesCursor] = React.useState<string | null>(null)
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false)
  const [hydratedConversationId, setHydratedConversationId] = React.useState<string | null>(null)
  const [sandboxOptions, setSandboxOptions] = React.useState<
    { environmentId: string; label: string; status: string }[]
  >([])
  const [modelProfiles, setModelProfiles] = React.useState<ModelProfile[]>([])
  const [selectedModelProfileId, setSelectedModelProfileId] = React.useState("")
  const [selectedSandboxEnvironmentId, setSelectedSandboxEnvironmentId] = React.useState("")
  const [agentDescriptorOptions, setAgentDescriptorOptions] = React.useState<
    AgentDescriptorOption[]
  >([])

  const reportChatError = React.useCallback(
    (
      caught: unknown,
      fallbackMessage: string,
      title: string,
      options?: { toast?: boolean; format?: (message: string) => string }
    ) => {
      const appError = normalizeAppError(caught, { fallbackMessage })
      const message = options?.format
        ? options.format(appError.message)
        : appError.message
      if (options?.toast ?? true) {
        notify.error({
          title,
          description: message,
        })
      }
      return message
    },
    []
  )

  const abortRef = React.useRef<AbortController | null>(null)
  const entriesRef = React.useRef<ChatEntry[]>([])
  const assistantEntryIdRef = React.useRef<string | null>(null)
  const activeStreamConversationIdRef = React.useRef<string | null>(null)
  const activeRunIdRef = React.useRef<string | null>(null)
  const terminalEventSeenRef = React.useRef(false)
  const recoveryInFlightRef = React.useRef(false)
  const recoveryTimerRef = React.useRef<number | null>(null)
  const catchupInFlightRef = React.useRef(false)
  const conversationSeqRef = React.useRef(new Map<string, number>())
  const currentConversationIdRef = React.useRef<string | null>(currentConversationId)
  const hydratedConversationIdRef = React.useRef<string | null>(hydratedConversationId)
  const streamStatusRef = React.useRef<StreamStatus>("idle")
  const skipNextConversationSyncRef = React.useRef<string | null>(null)
  const seenEventRef = React.useRef(new Set<string>())
  const seenFinalRef = React.useRef(new Set<string>())
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const autoStickToBottomRef = React.useRef(true)
  const pendingInitialBottomScrollRef = React.useRef(false)
  const pendingOlderLoadMetricsRef = React.useRef<{
    scrollHeight: number
    scrollTop: number
  } | null>(null)
  const olderMessagesInFlightCursorRef = React.useRef<string | null>(null)
  const olderLoadResetTimerRef = React.useRef<number | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)
  const [preInputQueue, setPreInputQueue] = React.useState<PreInputQueueItem[]>([])

  const refreshPendingInputsForConversation = React.useCallback(
    async (conversationId: string) => {
      if (!conversationId || !accessToken) {
        return
      }

      const res = await getPendingInputs(
        accessToken,
        conversationId
      )
      const dbItems = res.pending_inputs.filter((item) => item.status === "queued")
      setPreInputQueue(
        dbItems.map((item) => ({
          id: `db-${item.id}`,
          content: item.content,
          status: "queued" as const,
        }))
      )
    },
    [accessToken]
  )

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (recoveryTimerRef.current != null) {
        window.clearTimeout(recoveryTimerRef.current)
      }
      if (olderLoadResetTimerRef.current != null) {
        window.clearTimeout(olderLoadResetTimerRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  React.useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  React.useEffect(() => {
    hydratedConversationIdRef.current = hydratedConversationId
  }, [hydratedConversationId])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    setSelectedSandboxEnvironmentId(
      window.localStorage.getItem(sandboxStorageKey(currentConversationId)) ?? ""
    )
  }, [currentConversationId])

  React.useEffect(() => {
    if (!accessToken) {
      setModelProfiles([])
      setSelectedModelProfileId("")
      return
    }

    let cancelled = false
    listModelProfiles(accessToken)
      .then((response) => {
        if (cancelled) {
          return
        }
        setModelProfiles(response.profiles)
        setSelectedModelProfileId((current) =>
          current && response.profiles.some((profile) => profile.id === current)
            ? current
            : ""
        )
      })
      .catch(() => {
        if (!cancelled) {
          setModelProfiles([])
          setSelectedModelProfileId("")
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  React.useEffect(() => {
    if (!accessToken || !currentWorkspace) {
      setSandboxOptions([])
      return
    }

    let cancelled = false
    listSandboxWorkspaceEnvironments(accessToken, currentWorkspace.id)
      .then((response) => {
        if (cancelled) {
          return
        }
        const providersById = new Map(
          response.providers.map((provider) => [provider.provider_id, provider])
        )
        setSandboxOptions(
          response.environments
            .filter((environment) => {
              const provider = providersById.get(environment.provider_id)
              return (
                provider?.status === "online" &&
                ["bound", "ready", "busy"].includes(environment.status)
              )
            })
            .map((environment) => ({
              environmentId: environment.environment_id,
              label: sandboxOptionLabel(
                environment,
                providersById.get(environment.provider_id)
              ),
              status: environment.status,
            }))
        )
      })
      .catch(() => {
        if (!cancelled) {
          setSandboxOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, currentWorkspace])

  React.useEffect(() => {
    if (!accessToken || !workspaces.length) {
      setAgentDescriptorOptions([])
      return
    }

    let cancelled = false
    Promise.all(
      workspaces.map(async (workspace) => {
        const tree = await listWorkspaceTree(accessToken, workspace.id)
        return tree.objects
          .filter(
            (object) =>
              object.kind === "file" &&
              object.path.startsWith("system/agents/") &&
              object.path.endsWith(".md") &&
              !object.path.includes("..") &&
              !object.path.includes("\\")
          )
          .map((object) => ({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            path: object.path,
            label: object.name || object.path,
          }))
      })
    )
      .then((groups) => {
        if (!cancelled) {
          setAgentDescriptorOptions(groups.flat())
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentDescriptorOptions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, workspaces])

  // 加载 DB 中的 pending 队列并同步到本地状态
  React.useEffect(() => {
    if (!currentConversationId || !accessToken) {
      return
    }

    let cancelled = false
    refreshPendingInputsForConversation(currentConversationId)
      .then(() => {
        if (cancelled) return
      })
      .catch(() => {
        // 静默失败，使用本地队列
      })

    return () => {
      cancelled = true
    }
  }, [
    accessToken,
    currentConversationId,
    refreshPendingInputsForConversation,
  ])

  React.useEffect(() => {
    streamStatusRef.current = streamStatus
  }, [streamStatus])

  const updateStreamStatus = React.useCallback((next: StreamStatus) => {
    streamStatusRef.current = next
    setStreamStatus(next)
  }, [])

  const selectedConversation = React.useMemo(
    () =>
      conversations.find((conversation) => conversation.id === currentConversationId) ?? null,
    [conversations, currentConversationId]
  )
  const selectedLiveRun = React.useMemo(
    () => getLiveConversationRun(selectedConversation),
    [selectedConversation]
  )
  const modelOptions = React.useMemo<ModelProfileOption[]>(
    () =>
      modelProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name || profile.id,
        supportsReasoning: profile.supports_reasoning,
        supportsToolCalls: profile.supports_tool_calls,
      })),
    [modelProfiles]
  )

  const bindStatus = currentConversationId ? "已绑定产品会话" : "尚未创建会话"
  const isSending = streamStatus === "streaming" || streamStatus === "recovering"
  const selectedConversationTitle =
    selectedConversation?.title || "New Chat"
  const visibleEntries = React.useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.role === "assistant") {
          return hasAssistantEntryContent(entry)
        }

        if (entry.role === "approval") {
          return Boolean(entry.needId || entry.approvalId)
        }

        return Boolean(entry.content.trim())
      }),
    [entries]
  )
  const renderedEntries = React.useMemo(
    () => visibleEntries.slice(Math.max(0, visibleEntries.length - renderedEntryLimit)),
    [renderedEntryLimit, visibleEntries]
  )
  const hasHiddenLoadedEntries = renderedEntries.length < visibleEntries.length
  const hasOlderEntries = hasHiddenLoadedEntries || hasOlderMessages

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    })
  }, [])

  const handleViewportScroll = React.useCallback(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) {
      return
    }

    const distanceToBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const isNearBottom = distanceToBottom < 48

    autoStickToBottomRef.current = isNearBottom
    setShowScrollToBottom(!isNearBottom)
  }, [])

  React.useLayoutEffect(() => {
    if (!scrollViewportRef.current || !autoStickToBottomRef.current) {
      return
    }

    scrollToBottom("auto")
    if (renderedEntries.length > 0) {
      pendingInitialBottomScrollRef.current = false
    }
  }, [renderedEntries, scrollToBottom, streamStatus])

  React.useLayoutEffect(() => {
    const metrics = pendingOlderLoadMetricsRef.current
    const viewport = scrollViewportRef.current
    if (!metrics || !viewport) {
      return
    }

    const addedHeight = viewport.scrollHeight - metrics.scrollHeight
    viewport.scrollTop = metrics.scrollTop + Math.max(0, addedHeight)
    pendingOlderLoadMetricsRef.current = null
    setIsLoadingOlderEntries(false)
  }, [renderedEntries])

  const clearRecoveryTimer = React.useCallback(() => {
    if (recoveryTimerRef.current != null) {
      window.clearTimeout(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
  }, [])

  const persistResumeState = React.useCallback(
    (overrides?: {
      conversationId?: string | null
      runId?: string | null
      afterSeq?: number | null
      clear?: boolean
      force?: boolean
    }) => {
      if (overrides?.clear) {
        clearPendingConversationResumeState()
        return
      }

      const conversationId =
        overrides?.conversationId ?? activeStreamConversationIdRef.current
      const status = streamStatusRef.current
      if (!conversationId) {
        return
      }

      if (
        !overrides?.force &&
        status !== "streaming" &&
        status !== "recovering"
      ) {
        return
      }

      const afterSeq =
        overrides?.afterSeq ??
        conversationSeqRef.current.get(conversationId) ??
        null

      writePendingConversationResumeState({
        conversationId,
        runId: overrides?.runId ?? activeRunIdRef.current,
        afterSeq,
      })
    },
    []
  )

  const setConversationLastSeq = React.useCallback(
    (conversationId: string, seq: number | null | undefined) => {
      if (!conversationId || typeof seq !== "number" || !Number.isFinite(seq)) {
        return
      }

      const normalized = Math.max(0, Math.floor(seq))
      const current = conversationSeqRef.current.get(conversationId) ?? 0
      if (normalized > current) {
        conversationSeqRef.current.set(conversationId, normalized)
      } else if (!conversationSeqRef.current.has(conversationId)) {
        conversationSeqRef.current.set(conversationId, current)
      }

      if (conversationId === activeStreamConversationIdRef.current) {
        persistResumeState({
          conversationId,
          afterSeq: conversationSeqRef.current.get(conversationId) ?? normalized,
        })
      }
    },
    [persistResumeState]
  )

  const loadOlderConversationMessagesPage = React.useCallback(() => {
    if (
      !hasOlderEntries ||
      pendingOlderLoadMetricsRef.current ||
      olderMessagesInFlightCursorRef.current
    ) {
      return
    }

    const viewport = scrollViewportRef.current
    pendingOlderLoadMetricsRef.current = {
      scrollHeight: viewport?.scrollHeight ?? 0,
      scrollTop: viewport?.scrollTop ?? 0,
    }
    setIsLoadingOlderEntries(true)
    setOlderMessagesError(null)
    autoStickToBottomRef.current = false
    setShowScrollToBottom(true)

    if (hasHiddenLoadedEntries) {
      setRenderedEntryLimit((current) =>
        Math.min(current + RENDERED_ENTRY_INCREMENT, visibleEntries.length)
      )

      if (olderLoadResetTimerRef.current != null) {
        window.clearTimeout(olderLoadResetTimerRef.current)
      }
      olderLoadResetTimerRef.current = window.setTimeout(() => {
        pendingOlderLoadMetricsRef.current = null
        setIsLoadingOlderEntries(false)
        olderLoadResetTimerRef.current = null
      }, 250)
      return
    }

    if (!accessToken || !currentConversationId || !olderMessagesCursor) {
      pendingOlderLoadMetricsRef.current = null
      setIsLoadingOlderEntries(false)
      return
    }

    olderMessagesInFlightCursorRef.current = olderMessagesCursor
    void getConversationMessages(accessToken, currentConversationId, {
      limit: CONVERSATION_MESSAGES_PAGE_LIMIT,
      before: olderMessagesCursor,
    })
      .then((response) => {
        if (
          olderMessagesInFlightCursorRef.current !== olderMessagesCursor ||
          currentConversationIdRef.current !== currentConversationId
        ) {
          return
        }

        const olderEntries = mapConversationMessagesToEntries(response.messages)
        setEntries((current) => {
          const seen = new Set(current.map((entry) => entry.id))
          return [
            ...olderEntries.filter((entry) => !seen.has(entry.id)),
            ...current,
          ]
        })
        setRenderedEntryLimit((current) => current + olderEntries.length)
        setOlderMessagesCursor(response.page?.before ?? null)
        setHasOlderMessages(Boolean(response.page?.has_older && response.page.before))
        setConversationLastSeq(currentConversationId, response.next_seq ?? 0)
        setOlderMessagesError(null)
        setError(null)
      })
      .catch((loadError) => {
        pendingOlderLoadMetricsRef.current = null
        setOlderMessagesError(
          reportChatError(loadError, "加载失败。", "加载历史消息失败", {
            toast: false,
            format: (message) => `加载失败：${message}`,
          })
        )
      })
      .finally(() => {
        if (olderMessagesInFlightCursorRef.current === olderMessagesCursor) {
          olderMessagesInFlightCursorRef.current = null
        }
        setIsLoadingOlderEntries(false)
      })
  }, [
    accessToken,
    currentConversationId,
    hasHiddenLoadedEntries,
    hasOlderEntries,
    olderMessagesCursor,
    reportChatError,
    setConversationLastSeq,
    visibleEntries.length,
  ])

  const primeConversationCursor = React.useCallback(
    async (conversationId: string) => {
      if (!accessToken || !conversationId) {
        return
      }

      if (conversationSeqRef.current.has(conversationId)) {
        return
      }

      const response = await getConversationEvents(
        accessToken,
        conversationId,
        {
          afterSeq: Number.MAX_SAFE_INTEGER,
          max: 1,
        }
      )

      setConversationLastSeq(conversationId, response.next_seq ?? 0)
    },
    [accessToken, setConversationLastSeq]
  )

  const syncLatestConversationMessagesPage = React.useCallback(
    async (conversationId: string) => {
      if (!accessToken) {
        setEntries([])
        setOlderMessagesCursor(null)
        setHasOlderMessages(false)
        setOlderMessagesError(null)
        setHydratedConversationId(null)
        return
      }

      setIsLoadingMessages(true)

      try {
        const response = await getConversationMessages(
          accessToken,
          conversationId,
          { limit: CONVERSATION_MESSAGES_PAGE_LIMIT }
        )
        const latestEntries = mapConversationMessagesToEntries(response.messages)
        const shouldReplaceTranscript =
          hydratedConversationIdRef.current !== conversationId ||
          entriesRef.current.length === 0
        setEntries((current) => {
          if (shouldReplaceTranscript) {
            return latestEntries
          }

          return [
            ...removeEntriesCoveredByLatest(current, latestEntries),
            ...latestEntries,
          ]
        })
        if (shouldReplaceTranscript) {
          setOlderMessagesCursor(response.page?.before ?? null)
          setHasOlderMessages(Boolean(response.page?.has_older && response.page.before))
        }
        setConversationLastSeq(conversationId, response.next_seq ?? 0)
        setHydratedConversationId(conversationId)
        setOlderMessagesError(null)
        setError(null)
      } catch (error) {
        setHydratedConversationId(null)
        throw error
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [accessToken, setConversationLastSeq]
  )

  React.useEffect(() => {
    if (
      currentConversationId &&
      skipNextConversationSyncRef.current === currentConversationId
    ) {
      skipNextConversationSyncRef.current = null
      return
    }

    abortRef.current?.abort()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    recoveryInFlightRef.current = false
    updateStreamStatus("idle")
    assistantEntryIdRef.current = null
    seenEventRef.current = new Set()
    seenFinalRef.current = new Set()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
    pendingInitialBottomScrollRef.current = true
    setHydratedConversationId(null)
    setRenderedEntryLimit(INITIAL_RENDERED_ENTRY_COUNT)
    pendingOlderLoadMetricsRef.current = null
    olderMessagesInFlightCursorRef.current = null
    setOlderMessagesCursor(null)
    setHasOlderMessages(false)
    setOlderMessagesError(null)
    setIsLoadingOlderEntries(false)

    if (!currentConversationId) {
      setEntries([])
      setError(null)
      return
    }

    void syncLatestConversationMessagesPage(currentConversationId).catch((loadError) => {
      setEntries([])
      setError(
        reportChatError(loadError, "加载会话失败。", "加载会话失败", {
          toast: false,
        })
      )
    })
  }, [
    clearRecoveryTimer,
    currentConversationId,
    reportChatError,
    syncLatestConversationMessagesPage,
    updateStreamStatus,
  ])

  const handleScrollToBottomClick = React.useCallback(() => {
    autoStickToBottomRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom("smooth")
  }, [scrollToBottom])

  function resetSeenCaches() {
    seenEventRef.current = new Set()
    seenFinalRef.current = new Set()
  }

  function resetTurnState() {
    assistantEntryIdRef.current = null
    activeRunIdRef.current = null
    terminalEventSeenRef.current = false
    resetSeenCaches()
  }

  function updateAssistantEntry(
    updater: (entry: AssistantEntry | undefined) => AssistantEntry | null
  ) {
    setEntries((current) => {
      const assistantId = assistantEntryIdRef.current
      if (!assistantId) {
        const created = updater(undefined)
        if (!created) {
          return current
        }
        assistantEntryIdRef.current = created.id
        return [...current, created]
      }

      const index = current.findIndex(
        (entry) => entry.role === "assistant" && entry.id === assistantId
      )
      if (index < 0) {
        const created = updater(undefined)
        if (!created) {
          return current
        }
        assistantEntryIdRef.current = created.id
        return [...current, created]
      }

      const existing = current[index]
      if (existing.role !== "assistant") {
        return current
      }

      const next = updater(existing)
      if (!next) {
        return current
      }

      const cloned = [...current]
      cloned[index] = next
      return cloned
    })
  }

  function ensureAssistantEntry() {
    updateAssistantEntry((entry) => {
      if (entry) {
        return entry.runId || !activeRunIdRef.current
          ? entry
          : {
              ...entry,
              runId: activeRunIdRef.current,
            }
      }

      return createAssistantEntry("streaming", activeRunIdRef.current)
    })
  }

  function bindActiveAssistantRun(runId: string | null | undefined) {
    const normalized = runId?.trim()
    if (!normalized) {
      return
    }

    activeRunIdRef.current = normalized
    updateAssistantEntry((entry) =>
      entry && !entry.runId
        ? {
            ...entry,
            runId: normalized,
          }
        : (entry ?? null)
    )
  }

  function updateAgentPane(pane: AgentPaneState, event: GatewayChatStreamEvent) {
    const eventName = event.event
    const content = event.content ?? ""

    if (isTextDeltaEvent(eventName)) {
      return applyTextDeltaToPane(pane, content)
    }

    if (isReasoningEvent(eventName)) {
      return applyReasoningDeltaToPane(pane, content)
    }

    if (eventName === "message") {
      return applyMessageToPane(pane, content)
    }

    return appendUpdateToPane(pane, content)
  }

  function updateToolCalls(pane: AgentPaneState, event: GatewayChatStreamEvent) {
    const { toolId, tool } = buildToolView(pane, event, getToolCallId, getToolName)
    return upsertToolInPane(pane, toolId, tool)
  }

  function applyMainEvent(event: GatewayChatStreamEvent) {
    ensureAssistantEntry()

    updateAssistantEntry((entry) => {
      const current = entry ?? createAssistantEntry("streaming", activeRunIdRef.current)

      return {
        ...current,
        status: current.status === "error" ? "error" : "streaming",
        pane: isToolEvent(event.event)
          ? updateToolCalls(current.pane, event)
          : updateAgentPane(current.pane, event),
      }
    })
  }

  function applySubagentEvent(event: GatewayChatStreamEvent) {
    const subagentId = getSubagentId(event) || `subagent-${event.seq ?? Date.now()}`
    const subagentName = getSubagentName(event)
    ensureAssistantEntry()

    updateAssistantEntry((entry) => {
      const current = entry ?? createAssistantEntry("streaming", activeRunIdRef.current)

      const existing =
        current.subagents[subagentId] ?? createEmptySubagent(subagentId, subagentName)
      let nextSubagent: SubagentView = {
        ...existing,
        name: subagentName,
      }

      nextSubagent = isToolEvent(event.event)
        ? ({ ...nextSubagent, ...updateToolCalls(nextSubagent, event) } as SubagentView)
        : ({ ...nextSubagent, ...updateAgentPane(nextSubagent, event) } as SubagentView)

      if (
        event.event === "subagent_done" ||
        event.event === "subagent_completed" ||
        event.event === "subagent_finished"
      ) {
        nextSubagent = {
          ...finalizePane(nextSubagent),
          id: nextSubagent.id,
          name: nextSubagent.name,
          status: "done",
        }
      }

      return {
        ...current,
        subagentOrder: current.subagentOrder.includes(subagentId)
          ? current.subagentOrder
          : [...current.subagentOrder, subagentId],
        subagents: {
          ...current.subagents,
          [subagentId]: nextSubagent,
        },
      }
    })
  }

  function appendSystemMessage(content: string) {
    if (!content.trim()) {
      return
    }

    setEntries((current) => [
      ...current,
      {
        id: createMessageId("system"),
        role: "system",
        content,
      },
    ])
  }

  function appendUserMessage(content: string, id = createMessageId("user")) {
    if (!content.trim()) {
      return
    }

    setEntries((current) => [
      ...current,
      {
        id,
        role: "user",
        content,
      },
    ])
  }

  function upsertApprovalEntry(approval: ApprovalEntry) {
    setEntries((current) => {
      const index = current.findIndex(
        (entry) =>
          entry.role === "approval" &&
          (entry.id === approval.id ||
            entry.approvalId === approval.approvalId ||
            entry.needId === approval.needId)
      )
      if (index < 0) {
        return [...current, approval]
      }

      const existing = current[index]
      if (existing.role !== "approval") {
        return current
      }

      const cloned = [...current]
      cloned[index] = {
        ...existing,
        ...approval,
        status:
          existing.status === "approved" || existing.status === "rejected"
            ? existing.status
            : approval.status,
        error: existing.error ?? approval.error,
      }
      return cloned
    })
  }

  function updateApprovalEntry(
    entryId: string,
    updater: (entry: ApprovalEntry) => ApprovalEntry
  ) {
    setEntries((current) =>
      current.map((entry) =>
        entry.role === "approval" && entry.id === entryId
          ? updater(entry)
          : entry
      )
    )
  }

  function markAwaitingHuman() {
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    clearPendingConversationResumeState()
    completeAssistantEntry()
    assistantEntryIdRef.current = null
    setError(null)
    updateStreamStatus("completed")
  }

  function completeAssistantEntry(fallback?: string) {
    updateAssistantEntry((entry) => {
      if (!entry && !fallback?.trim()) {
        return null
      }

      const current = entry ?? createAssistantEntry("done", activeRunIdRef.current)

      const nextSubagents = Object.fromEntries(
        current.subagentOrder.map((subagentId) => {
          const subagent = current.subagents[subagentId]
          if (!subagent) {
            return [subagentId, createEmptySubagent(subagentId, subagentId)]
          }

          return [
            subagentId,
            {
              ...finalizePane(subagent),
              id: subagent.id,
              name: subagent.name,
              status: "done" as const,
            },
          ]
        })
      ) as Record<string, SubagentView>

      return {
        ...current,
        status: "done",
        pane: finalizePane(current.pane, fallback),
        subagents: nextSubagents,
      }
    })
  }

  function beginGuidedUserTurn(content: string, id = createMessageId("user")) {
    completeAssistantEntry()
    assistantEntryIdRef.current = null
    appendUserMessage(content, id)
    return id
  }

  function finalizeConversationTurn(conversationId: string) {
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    clearPendingConversationResumeState()
    completeAssistantEntry()
    assistantEntryIdRef.current = null
    setError(null)
    updateStreamStatus("completed")
    void Promise.all([
      refreshConversations(),
      syncLatestConversationMessagesPage(conversationId),
      refreshPendingInputsForConversation(conversationId),
    ])
  }

  function applyFinal(result: GatewayChatFinalResult) {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    clearPendingConversationResumeState()
    completeAssistantEntry(result.output)
    assistantEntryIdRef.current = null
    setError(null)
    updateStreamStatus("completed")
    if (conversationId) {
      void Promise.all([
        refreshConversations(),
        syncLatestConversationMessagesPage(conversationId),
        refreshPendingInputsForConversation(conversationId),
      ])
    }
  }

  function applyResumeResponse(response: ResumeRunResponse) {
    if (Array.isArray(response.forward_messages)) {
      response.forward_messages.forEach((message, index) => {
        applyEvent(
          canonicalizeGatewayEvent({
            run_id: response.run_id ?? undefined,
            seq: index + 1,
            ts_ms: Date.now(),
            stream: "resume",
            event: "message",
            phase: "resume",
            scope:
              typeof message.scope === "string" ? message.scope : "main",
            role: typeof message.role === "string" ? message.role : "assistant",
            content: message.content,
            metadata: message.metadata ?? null,
          })
        )
      })
    }

    const pendingApproval = approvalNeedFromRaw(response.pending_need, {
      runId: response.run_id ?? null,
      sessionKey: response.session_key ?? null,
    })
    if (pendingApproval) {
      upsertApprovalEntry(pendingApproval)
      markAwaitingHuman()
      return
    }

    if (response.output?.trim()) {
      assistantEntryIdRef.current = null
      ensureAssistantEntry()
      completeAssistantEntry(response.output)
    }

    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    clearPendingConversationResumeState()
    setError(null)
    updateStreamStatus("completed")
    if (currentConversationIdRef.current) {
      void Promise.all([
        refreshConversations(),
        syncLatestConversationMessagesPage(currentConversationIdRef.current),
        refreshPendingInputsForConversation(currentConversationIdRef.current),
      ])
    }
  }

  function applyEvent(event: GatewayChatStreamEvent) {
    // ── Pending Input 事件 ──
    if (event.event === "pending_input_queued") {
      const content = parsePendingInputContent(event)
      const id = parsePendingInputId(event)
      if (!content) {
        return
      }
      setPreInputQueue((prev) => {
        const queueId = id != null ? `db-${id}` : createMessageId("preinput")
        const next = prev.filter((item) => item.id !== queueId)
        next.push({ id: queueId, content, status: "queued" })
        return next
      })
      return
    }
    if (event.event === "pending_input_guided") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }
    if (event.event === "pending_input_consuming") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }
    if (event.event === "pending_input_cancelled") {
      const id = parsePendingInputId(event)
      if (id != null) {
        setPreInputQueue((prev) => prev.filter((q) => q.id !== `db-${id}`))
      }
      return
    }

    const approvalEntry = approvalNeedFromEvent(event)
    if (approvalEntry) {
      upsertApprovalEntry(approvalEntry)
      const metadata = objectValue(event.metadata)
      const runState = stringValue(metadata?.run_state)
      if (event.event === "run_awaiting_human" || runState === "awaiting_human") {
        markAwaitingHuman()
      }
      return
    }

    if (event.event === "error" || event.event.endsWith("_error")) {
      const errorMessage = formatSendErrorMessage(
        (event.content ?? "Gateway stream failed").trim()
      )
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      clearPendingConversationResumeState()
      updateStreamStatus("error")
      setError(errorMessage)
      appendSystemMessage(`发送失败：${errorMessage}`)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      return
    }

    if (
      event.event === "completed" ||
      event.event === "run_completed" ||
      event.event === "cancelled" ||
      event.event === "run_cancelled"
    ) {
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (conversationId) {
        finalizeConversationTurn(conversationId)
      } else {
        terminalEventSeenRef.current = true
        recoveryInFlightRef.current = false
        clearRecoveryTimer()
        activeStreamConversationIdRef.current = null
        activeRunIdRef.current = null
        clearPendingConversationResumeState()
        completeAssistantEntry()
        assistantEntryIdRef.current = null
        setError(null)
        updateStreamStatus("completed")
      }
      return
    }

    if (isSubScope(event)) {
      applySubagentEvent(event)
      return
    }

    applyMainEvent(event)
  }

  const recoverConversationEvents = React.useEffectEvent(
    async (conversationId: string, keepPolling = true) => {
      if (!accessToken || !conversationId) {
        return
      }

      const isTrackedConversation =
        activeStreamConversationIdRef.current === conversationId ||
        currentConversationIdRef.current === conversationId

      if (recoveryInFlightRef.current) {
        return
      }

      if (!isTrackedConversation) {
        return
      }

      if (terminalEventSeenRef.current || streamStatusRef.current === "error") {
        clearRecoveryTimer()
        return
      }

      recoveryInFlightRef.current = true
      try {
        const afterSeq = conversationSeqRef.current.get(conversationId)
        const response = await getConversationEvents(
          accessToken,
          conversationId,
          {
            afterSeq,
            max: 200,
          }
        )

        for (const envelope of response.events) {
          applyEnvelopeEvent(envelope)
        }
      } catch (recoveryError) {
        if (!terminalEventSeenRef.current && isTrackedConversation) {
          updateStreamStatus("recovering")
          setError(
            reportChatError(
              recoveryError,
              "连接中断，正在恢复会话。",
              "恢复会话失败",
              {
                toast: false,
                format: (message) => `连接中断，正在恢复会话：${message}`,
              }
            )
          )
        }
      } finally {
        recoveryInFlightRef.current = false
        const shouldContinueRecovery =
          streamStatusRef.current === "streaming" ||
          streamStatusRef.current === "recovering"

        if (
          keepPolling &&
          (activeStreamConversationIdRef.current === conversationId ||
            currentConversationIdRef.current === conversationId) &&
          !terminalEventSeenRef.current &&
          shouldContinueRecovery
        ) {
          clearRecoveryTimer()
          recoveryTimerRef.current = window.setTimeout(() => {
            void recoverConversationEvents(conversationId, true)
          }, 1200)
        }
      }
    }
  )

  const resumeConversationStream = React.useEffectEvent(
    async (
      conversationId: string,
      runId?: string | null,
      afterSeq?: number | null
    ) => {
      if (!accessToken || !conversationId) {
        return
      }

      clearRecoveryTimer()
      recoveryInFlightRef.current = false
      resetTurnState()

      const controller = new AbortController()
      abortRef.current = controller
      activeStreamConversationIdRef.current = conversationId
      activeRunIdRef.current = runId ?? null
      updateStreamStatus("recovering")
      setError("页面已恢复，正在重新连接会话流…")
      persistResumeState({
        conversationId,
        runId: runId ?? null,
        afterSeq: afterSeq ?? conversationSeqRef.current.get(conversationId) ?? null,
        force: true,
      })

      try {
        await subscribeConversationEvents(
          accessToken,
          conversationId,
          {
            runId,
            afterSeq,
            signal: controller.signal,
            onEnvelope: (envelope) => {
              applyEnvelopeEvent(envelope)
            },
          }
        )

        if (!controller.signal.aborted) {
          abortRef.current = null
          if (!terminalEventSeenRef.current) {
            updateStreamStatus("recovering")
            setError("实时流已断开，正在补偿会话事件…")
            await recoverConversationEvents(conversationId, true)
          }
        }
      } catch (resumeError) {
        if (controller.signal.aborted) {
          clearRecoveryTimer()
          activeStreamConversationIdRef.current = null
          activeRunIdRef.current = null
          updateStreamStatus("idle")
          return
        }

        abortRef.current = null
        const message = reportChatError(
          resumeError,
          "恢复会话失败。",
          "恢复会话失败",
          { toast: false }
        )
        updateStreamStatus("recovering")
        setError(`连接中断，正在恢复会话：${message}`)
        await recoverConversationEvents(conversationId, true)
      } finally {
        if (!controller.signal.aborted) {
          abortRef.current = null
        }
      }
    }
  )

  const applyEnvelopeEvent = React.useEffectEvent((envelope: GatewayChatStreamEnvelope) => {
    if (envelope.type === "queued") {
      return
    }

    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (
      envelope.type === "event" &&
      typeof envelope.event.run_id === "string" &&
      envelope.event.run_id.trim()
    ) {
      bindActiveAssistantRun(envelope.event.run_id)
    }

    if (
      conversationId &&
      envelope.type === "event" &&
      typeof envelope.event.seq === "number"
    ) {
      setConversationLastSeq(conversationId, envelope.event.seq)
    }

    if (conversationId && envelope.type === "event") {
      persistResumeState({
        conversationId,
        runId: activeRunIdRef.current,
        afterSeq:
          typeof envelope.event.seq === "number"
            ? envelope.event.seq
            : conversationSeqRef.current.get(conversationId) ?? null,
      })
    }

    if (envelope.type === "error") {
      const errorMessage = formatSendErrorMessage(envelope.error)
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      updateStreamStatus("error")
      setError(errorMessage)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      appendSystemMessage(`发送失败：${errorMessage}`)
      return
    }

    if (envelope.type === "final") {
      const fingerprint = getFinalFingerprint(envelope.result)
      if (seenFinalRef.current.has(fingerprint)) {
        return
      }

      seenFinalRef.current.add(fingerprint)
      applyFinal(envelope.result)
      return
    }

    const fingerprint = getEventFingerprint(envelope.event)
    if (seenEventRef.current.has(fingerprint)) {
      return
    }

    seenEventRef.current.add(fingerprint)
    notifyWorkspaceToolResult(envelope.event)
    applyEvent(envelope.event)
  })

  const syncConversationIfBehind = React.useEffectEvent(
    async (conversationId: string | null | undefined) => {
      if (!accessToken || !conversationId) {
        return
      }

      if (catchupInFlightRef.current) {
        return
      }

      const activeConversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      const status = streamStatusRef.current
      if (
        conversationId === activeConversationId &&
        (status === "streaming" || status === "recovering")
      ) {
        void recoverConversationEvents(conversationId, false)
        return
      }

      if (status === "error") {
        return
      }

      catchupInFlightRef.current = true
      try {
        const hasCursor = conversationSeqRef.current.has(conversationId)
        if (hydratedConversationIdRef.current !== conversationId || !hasCursor) {
          await syncLatestConversationMessagesPage(conversationId)
          return
        }

        const afterSeq = conversationSeqRef.current.get(conversationId)
        const response = await getConversationEvents(
          accessToken,
          conversationId,
          {
            afterSeq,
            max: 1,
          }
        )

        if (response.events.length > 0) {
          await Promise.all([
            refreshConversations(),
            syncLatestConversationMessagesPage(conversationId),
            refreshPendingInputsForConversation(conversationId),
          ])
          return
        }

        setConversationLastSeq(conversationId, response.next_seq ?? afterSeq ?? 0)
      } catch (catchupError) {
        setError(
          reportChatError(catchupError, "同步会话更新失败。", "同步会话失败", {
            toast: false,
            format: (message) => `同步会话更新失败：${message}`,
          })
        )
      } finally {
        catchupInFlightRef.current = false
      }
    }
  )

  React.useEffect(() => {
    const triggerConversationCatchup = () => {
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (!conversationId) {
        return
      }

      void syncConversationIfBehind(conversationId)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerConversationCatchup()
      }
    }

    window.addEventListener("focus", triggerConversationCatchup)
    window.addEventListener("online", triggerConversationCatchup)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", triggerConversationCatchup)
      window.removeEventListener("online", triggerConversationCatchup)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  React.useEffect(() => {
    if (!accessToken || !currentConversationId) {
      return
    }

    if (hydratedConversationId !== currentConversationId) {
      return
    }

    if (activeStreamConversationIdRef.current) {
      return
    }

    void syncConversationIfBehind(currentConversationId)
  }, [
    accessToken,
    currentConversationId,
    hydratedConversationId,
  ])

  React.useEffect(() => {
    if (!accessToken || !currentConversationId) {
      return
    }

    if (hydratedConversationId !== currentConversationId) {
      return
    }

    if (
      streamStatusRef.current === "streaming" ||
      streamStatusRef.current === "recovering" ||
      activeStreamConversationIdRef.current
    ) {
      return
    }

    const pending = readPendingConversationResumeState()
    const pendingMatches =
      pending && pending.conversationId === currentConversationId
        ? pending
        : null
    const liveRunId = selectedLiveRun?.id ?? null

    if (pendingMatches?.runId && liveRunId && pendingMatches.runId !== liveRunId) {
      clearPendingConversationResumeState()
    }

    const shouldUsePending =
      pendingMatches != null &&
      (!pendingMatches.runId || !liveRunId || pendingMatches.runId === liveRunId)
    const runId = (shouldUsePending ? pendingMatches?.runId : null) ?? liveRunId

    if (!runId) {
      if (pendingMatches) {
        clearPendingConversationResumeState()
      }
      return
    }

    const afterSeq =
      (shouldUsePending ? pendingMatches?.afterSeq : null) ??
      conversationSeqRef.current.get(currentConversationId) ??
      null

    void resumeConversationStream(currentConversationId, runId, afterSeq)
  }, [
    accessToken,
    currentConversationId,
    hydratedConversationId,
    selectedConversation?.current_run_id,
    selectedLiveRun?.id,
  ])

  function clearConversation() {
    setEntries([])
    setError(null)
    setRenderedEntryLimit(INITIAL_RENDERED_ENTRY_COUNT)
    pendingOlderLoadMetricsRef.current = null
    olderMessagesInFlightCursorRef.current = null
    setOlderMessagesCursor(null)
    setHasOlderMessages(false)
    setIsLoadingOlderEntries(false)
    resetTurnState()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    activeRunIdRef.current = null
    recoveryInFlightRef.current = false
    clearPendingConversationResumeState()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
  }

  function startNewChat() {
    abortRef.current?.abort()
    updateStreamStatus("idle")
    selectConversation(null)
    clearConversation()
  }

  async function handleStop() {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (!conversationId || !accessToken) {
      abortRef.current?.abort()
      return
    }

    setError(null)

    try {
      await stopConversationRun(accessToken, conversationId)
    } catch (stopError) {
      const message = reportChatError(
        stopError,
        "停止当前会话运行失败。",
        "停止会话失败"
      )
      setError(message)
      appendSystemMessage(`停止失败：${message}`)
    }
  }

  async function handleResolveApproval(entryId: string, approved: boolean) {
    if (!accessToken || !currentWorkspace) {
      return
    }

    const entry = entries.find(
      (item): item is ApprovalEntry =>
        item.role === "approval" && item.id === entryId
    )
    if (!entry || !entry.approvalId) {
      return
    }

    updateApprovalEntry(entryId, (current) => ({
      ...current,
      status: approved ? "approving" : "rejecting",
      error: null,
    }))
    setError(null)
    updateStreamStatus("streaming")

    try {
      if (approved) {
        await approveSandboxApproval(accessToken, currentWorkspace.id, {
          approval_id: entry.approvalId,
        })
      } else {
        await rejectSandboxApproval(accessToken, currentWorkspace.id, {
          approval_id: entry.approvalId,
        })
      }

      updateApprovalEntry(entryId, (current) => ({
        ...current,
        status: approved ? "approved" : "rejected",
        error: null,
      }))

      if (!entry.runId && !entry.sessionKey) {
        updateStreamStatus("completed")
        appendSystemMessage(
          approved
            ? "已批准 sandbox 命令。当前对话缺少可恢复的 run 信息，请发送下一条消息继续。"
            : "已拒绝 sandbox 命令。"
        )
        return
      }

      const resumed = await resumeRunWithApproval(
        accessToken,
        currentWorkspace.id,
        {
          run_id: entry.runId,
          session_key: entry.sessionKey,
          need_id: entry.needId,
          approved,
        }
      )
      applyResumeResponse(resumed)
    } catch (approvalError) {
      const message = reportChatError(
        approvalError,
        "审批操作失败。",
        "审批操作失败"
      )
      updateApprovalEntry(entryId, (current) => ({
        ...current,
        status: "error",
        error: message,
      }))
      updateStreamStatus("error")
      setError(message)
      appendSystemMessage(`审批失败：${message}`)
    }
  }

  // Core send flow: shared by normal send and guided injection fallback.
  async function sendContentToApi(content: string, mode?: "guided") {
    if (!accessToken || !content.trim()) {
      return
    }
    const sandboxPayload = selectedSandboxEnvironmentId
      ? { environment_id: selectedSandboxEnvironmentId }
      : undefined

    const isStreamingNow =
      streamStatusRef.current === "streaming" ||
      streamStatusRef.current === "recovering" ||
      Boolean(activeStreamConversationIdRef.current)

    // 当 LLM 仍在输出（streaming/recovering）时，发送输入只做入队，不中断当前 SSE。
    if (isStreamingNow) {
      const targetConversationId =
        activeStreamConversationIdRef.current ??
        currentConversationIdRef.current ??
        currentConversationId

      if (!targetConversationId) {
        return
      }

      setError(null)
      const isGuidedMode = mode === "guided"
      const optimisticId = createMessageId(isGuidedMode ? "guided" : "preinput")
      if (isGuidedMode) {
        beginGuidedUserTurn(content, optimisticId)
      } else {
        setPreInputQueue((prev) => [
          ...prev,
          { id: optimisticId, content, status: "pending" },
        ])
      }
      try {
        let resolvedAsQueue = false
        let deliveredInline = false
        await streamConversationSend(
          accessToken,
          {
            conversation_id: targetConversationId,
            content,
            stream: false,
            channel: "web",
            input_mode: mode,
            model_profile_id: selectedModelProfileId || undefined,
            sandbox: sandboxPayload,
          },
          {
            onEnvelope: (envelope) => {
              if (envelope.type === "queued") {
                resolvedAsQueue = true
                if (isGuidedMode) {
                  return
                }
                setPreInputQueue((prev) => {
                  const id =
                    envelope.pending_id != null
                      ? `db-${envelope.pending_id}`
                      : createMessageId("preinput")
                  const next = prev.filter((item) => item.id !== optimisticId && item.id !== id)
                  next.push({ id, content, status: "queued" })
                  return next
                })
                return
              }

              deliveredInline = true
              if (!isGuidedMode) {
                setPreInputQueue((prev) => prev.filter((item) => item.id !== optimisticId))
                appendUserMessage(content)
              }
              applyEnvelopeEvent(envelope)
            },
          }
        )
        if (!resolvedAsQueue && !deliveredInline) {
          if (!isGuidedMode) {
            setPreInputQueue((prev) => prev.filter((item) => item.id !== optimisticId))
            appendUserMessage(content)
          }
        }
      } catch (enqueueError) {
        if (isGuidedMode) {
          setEntries((current) => current.filter((entry) => entry.id !== optimisticId))
        } else {
          setPreInputQueue((prev) => prev.filter((item) => item.id !== optimisticId))
        }
        const message = reportChatError(enqueueError, "发送失败。", "发送失败", {
          format: formatSendErrorMessage,
        })
        setError(message)
        appendSystemMessage(`发送失败：${message}`)
      }
      return
    }

    abortRef.current?.abort()
    clearRecoveryTimer()
    recoveryInFlightRef.current = false
    resetTurnState()

    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    updateStreamStatus("streaming")

    let targetConversationId = currentConversationId
    if (!targetConversationId) {
      const createdConversation = await createConversation(buildConversationTitle(content))
      targetConversationId = createdConversation.id
      skipNextConversationSyncRef.current = targetConversationId
      if (typeof window !== "undefined" && selectedSandboxEnvironmentId) {
        window.localStorage.setItem(
          sandboxStorageKey(targetConversationId),
          selectedSandboxEnvironmentId
        )
      }
    }

    // 统一输入：所有 send 都立即显示 user 气泡（后端负责决定排队或立即处理）
    setEntries((current) => [
      ...current,
      {
        id: createMessageId("user"),
        role: "user",
        content,
      },
    ])

    ensureAssistantEntry()
    activeStreamConversationIdRef.current = targetConversationId
    persistResumeState({
      conversationId: targetConversationId,
      runId: null,
      afterSeq: conversationSeqRef.current.get(targetConversationId) ?? null,
      force: true,
    })

    try {
      await primeConversationCursor(targetConversationId)
    } catch (primeError) {
      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      clearPendingConversationResumeState()
      const message = reportChatError(
        primeError,
        "初始化会话恢复游标失败。",
        "初始化会话失败"
      )
      updateStreamStatus("error")
      setError(message)
      appendSystemMessage(`发送失败：${message}`)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      abortRef.current = null
      return
    }

    try {
      let queued = false
      await streamConversationSend(
        accessToken,
        {
          conversation_id: targetConversationId,
          content,
          stream: true,
          channel: "web",
          input_mode: mode, // 仅引导模式显式传递；其他情况由后端根据活跃状态自动决定
          model_profile_id: selectedModelProfileId || undefined,
          sandbox: sandboxPayload,
        },
        {
          signal: controller.signal,
          onEnvelope: (envelope) => {
            if (envelope.type === "queued") {
              // Phase 6: 服务端已入队，前端也加入本地队列用于 UI 展示
              queued = true
              setPreInputQueue((prev) => {
                const id =
                  envelope.pending_id != null
                    ? `db-${envelope.pending_id}`
                    : createMessageId("preinput")
                if (prev.some((item) => item.id === id)) {
                  return prev
                }
                return [...prev, { id, content, status: "queued" }]
              })
              return
            }
            applyEnvelopeEvent(envelope)
          },
        }
      )

      if (queued) {
        updateStreamStatus("idle")
        return
      }

      if (!controller.signal.aborted) {
        abortRef.current = null
        if (!terminalEventSeenRef.current) {
          updateStreamStatus("recovering")
          setError("实时流已断开，正在补偿会话事件…")
          await recoverConversationEvents(targetConversationId, true)
        }
      }
    } catch (streamError) {
      if (controller.signal.aborted) {
        clearRecoveryTimer()
        activeStreamConversationIdRef.current = null
        activeRunIdRef.current = null
        updateStreamStatus("idle")
        return
      }

      const message = reportChatError(streamError, "发送失败。", "发送失败", {
        toast: false,
        format: formatSendErrorMessage,
      })
      const recoverable =
        typeof streamError === "object" &&
        streamError !== null &&
        "recoverable" in streamError
          ? Boolean((streamError as { recoverable?: unknown }).recoverable)
          : true

      if (recoverable) {
        abortRef.current = null
        updateStreamStatus("recovering")
        setError(`连接中断，正在恢复会话：${message}`)
        await recoverConversationEvents(targetConversationId, true)
        return
      }

      activeStreamConversationIdRef.current = null
      activeRunIdRef.current = null
      clearPendingConversationResumeState()
      updateStreamStatus("error")
      setError(message)
      appendSystemMessage(`发送失败：${message}`)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
    } finally {
      if (!controller.signal.aborted) {
        abortRef.current = null
      }
    }
  }

  async function handleSend() {
    const content = composer.trim()
    if (!content || !accessToken) {
      return
    }

    // 统一输入：不再由前端判断排队/立即处理，后端根据活跃 run 状态自动决定
    setComposer("")
    await sendContentToApi(content)
  }

  function handleSandboxEnvironmentChange(value: string) {
    setSelectedSandboxEnvironmentId(value)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(sandboxStorageKey(currentConversationId), value)
    }
  }

  function handlePromoteToGuided(id: string) {
    const item = preInputQueue.find((q) => q.id === id)
    if (!item || item.status === "pending" || item.status === "promoting") {
      return
    }

    const dbId = id.startsWith("db-") ? Number(id.slice(3)) : null
    if (dbId && accessToken && currentConversationId) {
      const guidedEntryId = beginGuidedUserTurn(item.content)
      setPreInputQueue((prev) => prev.filter((queueItem) => queueItem.id !== id))
      void promotePendingInput(
        accessToken,
        currentConversationId,
        dbId
      ).catch((promoteError) => {
        const message = reportChatError(
          promoteError,
          "提升为引导失败。",
          "提升为引导失败"
        )
        setEntries((current) => current.filter((entry) => entry.id !== guidedEntryId))
        setPreInputQueue((prev) => {
          if (prev.some((queueItem) => queueItem.id === id)) {
            return prev
          }
          return [...prev, { ...item, status: "queued" }]
        })
        setError(message)
        appendSystemMessage(`提升为引导失败：${message}`)
      })
      return
    }

    setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
    void sendContentToApi(item.content, "guided")
  }

  function handleDeleteFromQueue(id: string) {
    const item = preInputQueue.find((q) => q.id === id)
    if (!item || item.status === "pending" || item.status === "deleting") {
      return
    }

    const dbId = id.startsWith("db-") ? Number(id.slice(3)) : null
    if (dbId && accessToken && currentConversationId) {
      setPreInputQueue((prev) =>
        prev.map((queueItem) =>
          queueItem.id === id ? { ...queueItem, status: "deleting" } : queueItem
        )
      )
      void deletePendingInput(
        accessToken,
        currentConversationId,
        dbId
      )
        .then(() => {
          setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
        })
        .catch((deleteError) => {
          const message = reportChatError(
            deleteError,
            "删除预输入失败。",
            "删除预输入失败"
          )
          setPreInputQueue((prev) =>
            prev.map((queueItem) =>
              queueItem.id === id ? { ...queueItem, status: "queued" } : queueItem
            )
          )
          setError(message)
          appendSystemMessage(`删除预输入失败：${message}`)
        })
      return
    }

    setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
  }

  const resolveApproval = React.useEffectEvent(
    async (entryId: string, approved: boolean) => {
      await handleResolveApproval(entryId, approved)
    }
  )

  const handleApproveApproval = React.useCallback(
    (entryId: string) => {
      void resolveApproval(entryId, true)
    },
    []
  )

  const handleRejectApproval = React.useCallback(
    (entryId: string) => {
      void resolveApproval(entryId, false)
    },
    []
  )

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <>
      <ChatSidebarHeader
        bindStatus={bindStatus}
        selectedConversationTitle={selectedConversationTitle}
        selectedConversationId={currentConversationId}
        conversations={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title || "未命名会话",
          updatedAt: conversation.updated_at ?? conversation.last_message_at ?? null,
        }))}
        onSelectConversation={selectConversation}
        onRefreshConversations={() => {
          void refreshConversations()
        }}
        onStartNewChat={startNewChat}
        isFullScreen={isFullScreen}
        onFullScreenChange={onFullScreenChange}
        onCollapseSidebar={toggleSidebar}
      />

      <SidebarContent className="bg-sidebar/50">
        <ChatMessageList
          entries={renderedEntries}
          hasOlderEntries={hasOlderEntries}
          isLoadingOlderEntries={isLoadingOlderEntries}
          olderEntriesError={olderMessagesError}
          isSending={isSending}
          showScrollToBottom={showScrollToBottom}
          scrollViewportRef={scrollViewportRef}
          onViewportScroll={handleViewportScroll}
          onLoadOlderConversationMessagesPage={loadOlderConversationMessagesPage}
          onScrollToBottomClick={handleScrollToBottomClick}
          onApproveApproval={handleApproveApproval}
          onRejectApproval={handleRejectApproval}
        />
        {isLoadingMessages ? (
          <div className="px-4 pb-3 text-xs text-muted-foreground">正在同步历史消息…</div>
        ) : null}
      </SidebarContent>

      <ChatComposer
        composer={composer}
        error={error}
        isSending={isSending}
        preInputQueue={preInputQueue}
        agentDescriptorOptions={agentDescriptorOptions}
        modelOptions={modelOptions}
        selectedModelProfileId={selectedModelProfileId}
        sandboxOptions={sandboxOptions}
        selectedSandboxEnvironmentId={selectedSandboxEnvironmentId}
        onComposerChange={setComposer}
        onComposerKeyDown={handleComposerKeyDown}
        onModelProfileChange={setSelectedModelProfileId}
        onSandboxEnvironmentChange={handleSandboxEnvironmentChange}
        onSend={() => {
          void handleSend()
        }}
        onStop={() => {
          void handleStop()
        }}
        onPromoteToGuided={handlePromoteToGuided}
        onDeleteFromQueue={handleDeleteFromQueue}
      />
    </>
  )
}
