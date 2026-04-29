import * as React from "react"

import {
  SidebarContent,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  createEmptyAgentPane,
  finalizePane,
  type AgentPaneState,
  upsertToolInPane,
} from "@/components/right-sidebar/chat/chat-pane-state"
import { ChatComposer } from "@/components/right-sidebar/chat/components/chat-composer"
import { ChatMessageList } from "@/components/right-sidebar/chat/components/chat-message-list"
import { ChatSidebarHeader } from "@/components/right-sidebar/chat/components/chat-sidebar-header"
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
} from "@/components/right-sidebar/chat/gateway-chat-helpers"
import type {
  AssistantEntry,
  ChatEntry,
  StreamStatus,
  SubagentView,
} from "@/components/right-sidebar/chat/gateway-chat-types"
import { useAppSession } from "@/contexts/app-session"
import {
  getConversationEvents,
  getConversationMessages,
  stopConversationRun,
  streamConversationSend,
  type ConversationMessageRecord,
} from "@/lib/api/gateway-client"
import type {
  GatewayChatFinalResult,
  GatewayChatStreamEnvelope,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"
import { canonicalizeGatewayEvent } from "@/lib/api/chat/gateway-events"

function createAssistantEntry(status: AssistantEntry["status"]): AssistantEntry {
  return {
    id: createMessageId("assistant"),
    role: "assistant",
    status,
    pane: createEmptyAgentPane(),
    subagentOrder: [],
    subagents: {},
  }
}

function buildConversationTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "新对话"
  }

  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized
}

function applyEventToPaneState(pane: AgentPaneState, event: GatewayChatStreamEvent) {
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

function buildHistoryEvent(
  message: ConversationMessageRecord,
  seq: number
): GatewayChatStreamEvent | null {
  const metadata =
    message.metadata_json && typeof message.metadata_json === "object"
      ? { ...message.metadata_json }
      : null

  let eventName = "message"
  let role = message.role

  if (message.message_type === "tool_call") {
    eventName = "tool_call_done"
    role = "tool_call"
  } else if (message.message_type === "tool_result") {
    eventName = "tool_result"
    role = "tool"
  } else if (message.message_type === "output") {
    eventName = "message"
    role = "assistant"
  } else if (message.message_type === "system") {
    eventName = "message"
    role = "system"
  } else if (message.message_type !== "input") {
    eventName = "message"
  }

  return canonicalizeGatewayEvent({
    run_id: message.run_id ?? message.conversation_id,
    seq,
    ts_ms: Date.parse(message.created_at),
    stream: "history",
    event: eventName,
    phase: "history",
    scope:
      metadata && typeof metadata.scope === "string" ? metadata.scope : null,
    role,
    content: message.content,
    metadata,
  })
}

function compactAssistantHistoryMessages(messages: ConversationMessageRecord[]) {
  const lastAssistantIndexByScope = new Map<string, number>()

  messages.forEach((message, index) => {
    const isAssistantLike =
      message.role === "assistant" || message.message_type === "output"
    if (!isAssistantLike) {
      return
    }

    const metadata =
      message.metadata_json && typeof message.metadata_json === "object"
        ? message.metadata_json
        : null
    const scope =
      metadata && typeof metadata.scope === "string" && metadata.scope.trim()
        ? metadata.scope.trim()
        : "main"
    const subagentId =
      metadata && typeof metadata.subagent_id === "string" && metadata.subagent_id.trim()
        ? metadata.subagent_id.trim()
        : ""
    const scopeKey = `${scope}::${subagentId}`

    lastAssistantIndexByScope.set(scopeKey, index)
  })

  return messages.filter((message, index) => {
    const isAssistantLike =
      message.role === "assistant" || message.message_type === "output"
    if (!isAssistantLike) {
      return true
    }

    const metadata =
      message.metadata_json && typeof message.metadata_json === "object"
        ? message.metadata_json
        : null
    const scope =
      metadata && typeof metadata.scope === "string" && metadata.scope.trim()
        ? metadata.scope.trim()
        : "main"
    const subagentId =
      metadata && typeof metadata.subagent_id === "string" && metadata.subagent_id.trim()
        ? metadata.subagent_id.trim()
        : ""
    const scopeKey = `${scope}::${subagentId}`

    return lastAssistantIndexByScope.get(scopeKey) === index
  })
}

function buildAssistantEntryFromMessages(messages: ConversationMessageRecord[]): AssistantEntry {
  const compactedMessages = compactAssistantHistoryMessages(messages)
  const first = compactedMessages[0] ?? messages[0]
  let pane = createEmptyAgentPane()
  const subagents: Record<string, SubagentView> = {}
  const subagentOrder: string[] = []

  compactedMessages.forEach((message, index) => {
    const event = buildHistoryEvent(message, index + 1)
    if (!event) {
      return
    }

    if (isSubScope(event)) {
      const subagentId = getSubagentId(event) || `subagent-${message.id}`
      const subagentName = getSubagentName(event)
      const existing = subagents[subagentId] ?? createEmptySubagent(subagentId, subagentName)
      const nextSubagent = isToolEvent(event.event)
        ? (() => {
            const { toolId, tool } = buildToolView(existing, event, getToolCallId, getToolName)
            return upsertToolInPane(existing, toolId, tool) as SubagentView
          })()
        : ({
            ...applyEventToPaneState(existing, event),
            id: existing.id,
            name: subagentName,
            status: existing.status,
          } as SubagentView)

      subagents[subagentId] = {
        ...nextSubagent,
        id: subagentId,
        name: subagentName,
        status: "done",
      }
      if (!subagentOrder.includes(subagentId)) {
        subagentOrder.push(subagentId)
      }
      return
    }

    if (isToolEvent(event.event)) {
      const { toolId, tool } = buildToolView(pane, event, getToolCallId, getToolName)
      pane = upsertToolInPane(pane, toolId, tool)
      return
    }

    pane = applyEventToPaneState(pane, event)
  })

  const finalizedSubagents = Object.fromEntries(
    subagentOrder.map((subagentId) => {
      const subagent = subagents[subagentId] ?? createEmptySubagent(subagentId, subagentId)
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
    id: first?.id ?? createMessageId("assistant"),
    role: "assistant",
    status: "done",
    pane: finalizePane(pane),
    subagentOrder,
    subagents: finalizedSubagents,
  }
}

function mapConversationMessagesToEntries(messages: ConversationMessageRecord[]): ChatEntry[] {
  const entries: ChatEntry[] = []
  let pendingAssistantMessages: ConversationMessageRecord[] = []
  let pendingAssistantRunId: string | null = null

  const flushAssistantMessages = () => {
    if (!pendingAssistantMessages.length) {
      return
    }

    entries.push(buildAssistantEntryFromMessages(pendingAssistantMessages))
    pendingAssistantMessages = []
    pendingAssistantRunId = null
  }

  messages
    .filter((message) => Boolean(message.content.trim()))
    .forEach((message) => {
      if (message.role === "user" || message.message_type === "input") {
        flushAssistantMessages()
        entries.push({
          id: message.id,
          role: "user",
          content: message.content,
        })
        return
      }

      if (
        message.role === "assistant" ||
        message.role === "tool" ||
        message.message_type === "output" ||
        message.message_type === "tool_call" ||
        message.message_type === "tool_result"
      ) {
        const messageRunId = message.run_id ?? null
        if (
          pendingAssistantMessages.length > 0 &&
          pendingAssistantRunId &&
          messageRunId &&
          pendingAssistantRunId !== messageRunId
        ) {
          flushAssistantMessages()
        }

        pendingAssistantMessages.push(message)
        pendingAssistantRunId = messageRunId
        return
      }

      flushAssistantMessages()
      entries.push({
        id: message.id,
        role: "system",
        content: message.content,
      })
    })

  flushAssistantMessages()
  return entries
}

export function GatewayChatSidebar() {
  const { toggleSidebar } = useSidebar()
  const {
    accessToken,
    currentWorkspace,
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

  const abortRef = React.useRef<AbortController | null>(null)
  const assistantEntryIdRef = React.useRef<string | null>(null)
  const activeStreamConversationIdRef = React.useRef<string | null>(null)
  const terminalEventSeenRef = React.useRef(false)
  const recoveryInFlightRef = React.useRef(false)
  const recoveryTimerRef = React.useRef<number | null>(null)
  const conversationSeqRef = React.useRef(new Map<string, number>())
  const currentConversationIdRef = React.useRef<string | null>(currentConversationId)
  const streamStatusRef = React.useRef<StreamStatus>("idle")
  const skipNextConversationSyncRef = React.useRef<string | null>(null)
  const seenEventRef = React.useRef(new Set<string>())
  const seenFinalRef = React.useRef(new Set<string>())
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const autoStickToBottomRef = React.useRef(true)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (recoveryTimerRef.current != null) {
        window.clearTimeout(recoveryTimerRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  React.useEffect(() => {
    streamStatusRef.current = streamStatus
  }, [streamStatus])

  const bindStatus = currentConversationId ? "已绑定产品会话" : "尚未创建会话"
  const isSending = streamStatus === "streaming" || streamStatus === "recovering"
  const selectedConversationTitle =
    conversations.find((conversation) => conversation.id === currentConversationId)?.title ||
    "梳理前端用户与会话管理接入需求"
  const visibleEntries = React.useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.role === "assistant") {
          return hasAssistantEntryContent(entry)
        }

        return Boolean(entry.content.trim())
      }),
    [entries]
  )

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

  React.useEffect(() => {
    if (!scrollViewportRef.current || !autoStickToBottomRef.current) {
      return
    }

    scrollToBottom(
      streamStatus === "streaming" || streamStatus === "recovering"
        ? "auto"
        : "smooth"
    )
  }, [scrollToBottom, streamStatus, visibleEntries])

  const clearRecoveryTimer = React.useCallback(() => {
    if (recoveryTimerRef.current != null) {
      window.clearTimeout(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
  }, [])

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
    },
    []
  )

  const primeConversationCursor = React.useCallback(
    async (conversationId: string) => {
      if (!accessToken || !currentWorkspace || !conversationId) {
        return
      }

      if (conversationSeqRef.current.has(conversationId)) {
        return
      }

      const response = await getConversationEvents(
        accessToken,
        currentWorkspace.id,
        conversationId,
        {
          afterSeq: Number.MAX_SAFE_INTEGER,
          max: 1,
        }
      )

      setConversationLastSeq(conversationId, response.next_seq ?? 0)
    },
    [accessToken, currentWorkspace, setConversationLastSeq]
  )

  const syncConversationMessages = React.useCallback(
    async (conversationId: string) => {
      if (!accessToken || !currentWorkspace) {
        setEntries([])
        return
      }

      setIsLoadingMessages(true)

      try {
        const response = await getConversationMessages(
          accessToken,
          currentWorkspace.id,
          conversationId
        )
        setEntries(mapConversationMessagesToEntries(response.messages))
        setError(null)
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [accessToken, currentWorkspace]
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
    terminalEventSeenRef.current = false
    recoveryInFlightRef.current = false
    setStreamStatus("idle")
    assistantEntryIdRef.current = null
    seenEventRef.current = new Set()
    seenFinalRef.current = new Set()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true

    if (!currentConversationId) {
      setEntries([])
      setError(null)
      return
    }

    void syncConversationMessages(currentConversationId).catch((loadError) => {
      setEntries([])
      setError(loadError instanceof Error ? loadError.message : "加载会话失败。")
    })
  }, [clearRecoveryTimer, currentConversationId, syncConversationMessages])

  function handleScrollToBottomClick() {
    autoStickToBottomRef.current = true
    setShowScrollToBottom(false)
    scrollToBottom("smooth")
  }

  function resetSeenCaches() {
    seenEventRef.current = new Set()
    seenFinalRef.current = new Set()
  }

  function resetTurnState() {
    assistantEntryIdRef.current = null
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
        return entry
      }

      return createAssistantEntry("streaming")
    })
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
      const current = entry ?? createAssistantEntry("streaming")

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
      const current = entry ?? createAssistantEntry("streaming")

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

  function completeAssistantEntry(fallback?: string) {
    updateAssistantEntry((entry) => {
      if (!entry && !fallback?.trim()) {
        return null
      }

      const current = entry ?? createAssistantEntry("done")

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

  function finalizeConversationTurn(conversationId: string) {
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    completeAssistantEntry()
    assistantEntryIdRef.current = null
    setError(null)
    setStreamStatus("completed")
    void Promise.all([
      refreshConversations(),
      syncConversationMessages(conversationId),
    ])
  }

  function applyFinal(result: GatewayChatFinalResult) {
    terminalEventSeenRef.current = true
    recoveryInFlightRef.current = false
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    completeAssistantEntry(result.output)
    assistantEntryIdRef.current = null
    setError(null)
    setStreamStatus("completed")
  }

  function applyEvent(event: GatewayChatStreamEvent) {
    if (event.event === "error" || event.event.endsWith("_error")) {
      const errorMessage = (event.content ?? "Gateway stream failed").trim()
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      setStreamStatus("error")
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
        completeAssistantEntry()
        assistantEntryIdRef.current = null
        setError(null)
        setStreamStatus("completed")
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
      if (!accessToken || !currentWorkspace || !conversationId) {
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
          currentWorkspace.id,
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
          setStreamStatus("recovering")
          setError(
            recoveryError instanceof Error
              ? `连接中断，正在恢复会话：${recoveryError.message}`
              : "连接中断，正在恢复会话。"
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

  const applyEnvelopeEvent = React.useEffectEvent((envelope: GatewayChatStreamEnvelope) => {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (
      conversationId &&
      envelope.type === "event" &&
      typeof envelope.event.seq === "number"
    ) {
      setConversationLastSeq(conversationId, envelope.event.seq)
    }

    if (envelope.type === "error") {
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      setStreamStatus("error")
      setError(envelope.error)
      updateAssistantEntry((entry) =>
        entry
          ? {
              ...entry,
              status: "error",
              pane: finalizePane(entry.pane),
            }
          : null
      )
      appendSystemMessage(`发送失败：${envelope.error}`)
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
    applyEvent(envelope.event)
  })

  React.useEffect(() => {
    const triggerRecovery = () => {
      const conversationId =
        activeStreamConversationIdRef.current ?? currentConversationIdRef.current
      if (!conversationId) {
        return
      }

      const status = streamStatusRef.current
      if (status !== "streaming" && status !== "recovering") {
        return
      }

      void recoverConversationEvents(conversationId, false)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRecovery()
      }
    }

    window.addEventListener("focus", triggerRecovery)
    window.addEventListener("online", triggerRecovery)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", triggerRecovery)
      window.removeEventListener("online", triggerRecovery)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [recoverConversationEvents])

  function clearConversation() {
    setEntries([])
    setError(null)
    resetTurnState()
    clearRecoveryTimer()
    activeStreamConversationIdRef.current = null
    recoveryInFlightRef.current = false
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
  }

  function startNewChat() {
    abortRef.current?.abort()
    setStreamStatus("idle")
    selectConversation(null)
    clearConversation()
  }

  async function handleStop() {
    const conversationId =
      activeStreamConversationIdRef.current ?? currentConversationIdRef.current

    if (!conversationId || !accessToken || !currentWorkspace) {
      abortRef.current?.abort()
      return
    }

    setError(null)

    try {
      await stopConversationRun(accessToken, currentWorkspace.id, conversationId)
    } catch (stopError) {
      const message =
        stopError instanceof Error ? stopError.message : "停止当前会话运行失败。"
      setError(message)
      appendSystemMessage(`停止失败：${message}`)
    }
  }

  async function handleSend() {
    const content = composer.trim()
    if (!content || !accessToken || !currentWorkspace || isSending) {
      return
    }

    abortRef.current?.abort()
    clearRecoveryTimer()
    recoveryInFlightRef.current = false
    resetTurnState()

    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setStreamStatus("streaming")
    setComposer("")

    let targetConversationId = currentConversationId
    if (!targetConversationId) {
      const createdConversation = await createConversation(buildConversationTitle(content))
      targetConversationId = createdConversation.id
      skipNextConversationSyncRef.current = targetConversationId
    }

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

    try {
      await primeConversationCursor(targetConversationId)
    } catch (primeError) {
      activeStreamConversationIdRef.current = null
      const message =
        primeError instanceof Error ? primeError.message : "初始化会话恢复游标失败。"
      setStreamStatus("error")
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
      await streamConversationSend(
        accessToken,
        currentWorkspace.id,
        {
          conversation_id: targetConversationId,
          content,
          stream: true,
          channel: "web",
        },
        {
          signal: controller.signal,
          onEnvelope: (envelope) => {
            applyEnvelopeEvent(envelope)
          },
        }
      )

      if (!controller.signal.aborted) {
        abortRef.current = null
        if (!terminalEventSeenRef.current) {
          setStreamStatus("recovering")
          setError("实时流已断开，正在补偿会话事件…")
          await recoverConversationEvents(targetConversationId, true)
        }
      }
    } catch (streamError) {
      if (controller.signal.aborted) {
        clearRecoveryTimer()
        activeStreamConversationIdRef.current = null
        setStreamStatus("idle")
        return
      }

      const message = streamError instanceof Error ? streamError.message : "发送失败。"
      const recoverable =
        typeof streamError === "object" &&
        streamError !== null &&
        "recoverable" in streamError
          ? Boolean((streamError as { recoverable?: unknown }).recoverable)
          : true

      if (recoverable) {
        abortRef.current = null
        setStreamStatus("recovering")
        setError(`连接中断，正在恢复会话：${message}`)
        await recoverConversationEvents(targetConversationId, true)
        return
      }

      activeStreamConversationIdRef.current = null
      setStreamStatus("error")
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

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <>
      <ChatSidebarHeader
        isBound={Boolean(currentConversationId)}
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
        onCollapseSidebar={toggleSidebar}
      />

      <SidebarSeparator />

      <SidebarContent className="bg-sidebar/50">
        <ChatMessageList
          entries={visibleEntries}
          isSending={isSending}
          showScrollToBottom={showScrollToBottom}
          scrollViewportRef={scrollViewportRef}
          onViewportScroll={handleViewportScroll}
          onScrollToBottomClick={handleScrollToBottomClick}
        />
        {isLoadingMessages ? (
          <div className="px-4 pb-3 text-xs text-muted-foreground">正在同步历史消息…</div>
        ) : null}
      </SidebarContent>

      <SidebarSeparator />

      <ChatComposer
        composer={composer}
        error={error}
        isSending={isSending}
        onComposerChange={setComposer}
        onComposerKeyDown={handleComposerKeyDown}
        onSend={() => {
          void handleSend()
        }}
        onStop={() => {
          void handleStop()
        }}
      />
    </>
  )
}
