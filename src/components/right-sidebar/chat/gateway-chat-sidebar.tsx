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
  STORAGE_KEYS,
  createEmptySubagent,
  createMessageId,
  extractSessionKeyFromEvent,
  getEventFingerprint,
  getFinalFingerprint,
  getInitialPeerId,
  getSubagentId,
  getSubagentName,
  getToolCallId,
  getToolName,
  hasAssistantEntryContent,
  isReasoningEvent,
  isSessionKeyEvent,
  isSubScope,
  isTextDeltaEvent,
  isToolEvent,
  readStoredValue,
} from "@/components/right-sidebar/chat/gateway-chat-helpers"
import type {
  AssistantEntry,
  ChatEntry,
  StreamStatus,
  SubagentView,
} from "@/components/right-sidebar/chat/gateway-chat-types"
import {
  normalizePolledEnvelope,
  pollFrontendChannel,
  streamGatewayChat,
  type GatewayChatFinalResult,
  type GatewayChatStreamEnvelope,
  type GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-api"

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

export function GatewayChatSidebar() {
  const { toggleSidebar } = useSidebar()

  const [peerId] = React.useState(getInitialPeerId)
  const [sessionKey, setSessionKey] = React.useState(() =>
    readStoredValue(STORAGE_KEYS.sessionKey)
  )
  const [composer, setComposer] = React.useState("")
  const [entries, setEntries] = React.useState<ChatEntry[]>([])
  const [streamStatus, setStreamStatus] = React.useState<StreamStatus>("idle")
  const [error, setError] = React.useState<string | null>(null)

  const abortRef = React.useRef<AbortController | null>(null)
  const assistantEntryIdRef = React.useRef<string | null>(null)
  const pollInFlightRef = React.useRef(false)
  const seenEventRef = React.useRef(new Set<string>())
  const seenFinalRef = React.useRef(new Set<string>())
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const autoStickToBottomRef = React.useRef(true)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.peerId, peerId)
  }, [peerId])

  React.useEffect(() => {
    if (sessionKey) {
      window.localStorage.setItem(STORAGE_KEYS.sessionKey, sessionKey)
      return
    }

    window.localStorage.removeItem(STORAGE_KEYS.sessionKey)
  }, [sessionKey])

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const bindStatus = sessionKey ? "已连接会话" : "等待首条回复"
  const isSending = streamStatus === "streaming"
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

    scrollToBottom(streamStatus === "streaming" ? "auto" : "smooth")
  }, [scrollToBottom, streamStatus, visibleEntries])

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
              status: "done",
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

  function applyFinal(result: GatewayChatFinalResult) {
    if (result.session_key && !sessionKey) {
      setSessionKey(result.session_key)
    }

    completeAssistantEntry(result.output)
    assistantEntryIdRef.current = null
    setStreamStatus("completed")
  }

  function applyEvent(event: GatewayChatStreamEvent) {
    if (isSessionKeyEvent(event.event)) {
      const nextSessionKey = extractSessionKeyFromEvent(event)
      if (nextSessionKey) {
        setSessionKey((current) => current || nextSessionKey)
      }
      return
    }

    if (event.event === "error" || event.event.endsWith("_error")) {
      const errorMessage = (event.content ?? "Gateway stream failed").trim()
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

    if (isSubScope(event)) {
      applySubagentEvent(event)
      return
    }

    applyMainEvent(event)
  }

  const applyEnvelopeEvent = React.useEffectEvent((envelope: GatewayChatStreamEnvelope) => {
    if (envelope.type === "error") {
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
    if (!sessionKey) {
      return
    }

    let cancelled = false

    async function runPoll() {
      if (pollInFlightRef.current) {
        return
      }

      pollInFlightRef.current = true

      try {
        const [mainResponse, subResponse] = await Promise.all([
          pollFrontendChannel(`${sessionKey}::main`),
          pollFrontendChannel(`${sessionKey}::sub`),
        ])

        if (cancelled) {
          return
        }

        ;[...mainResponse.messages, ...subResponse.messages].forEach((message) => {
          const envelope = normalizePolledEnvelope(message)
          if (envelope) {
            applyEnvelopeEvent(envelope)
          }
        })
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error ? pollError.message : "轮询 frontend channel 失败。"
          )
        }
      } finally {
        pollInFlightRef.current = false
      }
    }

    void runPoll()

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runPoll()
      }
    }

    const handleOnline = () => {
      void runPoll()
    }

    const handleFocus = () => {
      void runPoll()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)
    window.addEventListener("focus", handleFocus)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("focus", handleFocus)
    }
  }, [sessionKey])

  function clearConversation() {
    setEntries([])
    setError(null)
    resetTurnState()
    setShowScrollToBottom(false)
    autoStickToBottomRef.current = true
  }

  function startNewChat() {
    abortRef.current?.abort()
    setSessionKey("")
    setStreamStatus("idle")
    clearConversation()
  }

  async function handleSend() {
    const content = composer.trim()
    if (!content || !peerId || isSending) {
      return
    }

    abortRef.current?.abort()
    resetTurnState()

    const controller = new AbortController()
    abortRef.current = controller

    setError(null)
    setStreamStatus("streaming")
    setComposer("")

    setEntries((current) => [
      ...current,
      {
        id: createMessageId("user"),
        role: "user",
        content,
      },
    ])

    ensureAssistantEntry()

    try {
      await streamGatewayChat(
        {
          channel: "web",
          account_id: "default",
          peer_id: peerId,
          content,
          stream: true,
          auto_reply: false,
        },
        {
          signal: controller.signal,
          onEnvelope: (envelope) => {
            applyEnvelopeEvent(envelope)
          },
        }
      )

      if (!controller.signal.aborted) {
        completeAssistantEntry()
        assistantEntryIdRef.current = null
        setStreamStatus("completed")
      }
    } catch (streamError) {
      if (controller.signal.aborted) {
        return
      }

      const message = streamError instanceof Error ? streamError.message : "发送失败。"
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
        isBound={Boolean(sessionKey)}
        bindStatus={bindStatus}
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
        onStop={() => abortRef.current?.abort()}
      />
    </>
  )
}
