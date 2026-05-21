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
import {
  ChatComposer,
  type PreInputQueueItem,
} from "@/components/right-sidebar/chat/components/chat-composer"
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
  ApprovalEntry,
  ChatEntry,
  StreamStatus,
  SubagentView,
} from "@/components/right-sidebar/chat/gateway-chat-types"
import { useAppSession } from "@/contexts/app-session"
import {
  approveSandboxApproval,
  deletePendingInput,
  getConversationEvents,
  getConversationMessages,
  getPendingInputs,
  listSandboxWorkspaceEnvironments,
  promotePendingInput,
  rejectSandboxApproval,
  resumeRunWithApproval,
  stopConversationRun,
  subscribeConversationEvents,
  streamConversationSend,
  type Conversation,
  type ConversationMessageRecord,
  type ResumeRunResponse,
  type SandboxEnvironmentView,
  type SandboxProviderStatusView,
} from "@/lib/api/gateway-client"
import type {
  GatewayChatFinalResult,
  GatewayChatStreamEnvelope,
  GatewayChatStreamEvent,
} from "@/lib/api/chat/gateway-events"
import { canonicalizeGatewayEvent } from "@/lib/api/chat/gateway-events"
import { dispatchWorkspaceObjectsChanged } from "@/lib/workspace-events"

// History replay invariants:
// 1. Replay must rebuild the same structural blocks the live SSE path produced.
// 2. Only assistant output snapshots may be compacted during replay.
// 3. Structural records such as tool_call/tool_result must be preserved verbatim so
//    tool blocks and their ordering survive the post-stream resync path.

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

function sandboxStorageKey(conversationId: string | null | undefined) {
  return `ineffable.chat.sandbox.${conversationId ?? "new"}`
}

function sandboxOptionLabel(
  environment: SandboxEnvironmentView,
  provider?: SandboxProviderStatusView
) {
  return provider?.display_name || environment.environment_type || environment.environment_id
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function parseJsonObject(value: string | null | undefined) {
  if (!value?.trim()) {
    return null
  }

  try {
    return objectValue(JSON.parse(value))
  } catch {
    return null
  }
}

function notifyWorkspaceToolResult(event: GatewayChatStreamEvent) {
  if (event.event !== "tool_result") {
    return
  }

  const toolName = getToolName(event)
  const action =
    toolName === "workspace_write_file"
      ? "write_file"
      : toolName === "workspace_create_folder"
        ? "create_folder"
        : null
  if (!action) {
    return
  }

  const result = parseJsonObject(event.content)
  const object = objectValue(result?.object) ?? result
  const workspaceId = stringValue(object?.workspace_id ?? result?.workspace_id)
  if (!workspaceId) {
    return
  }

  dispatchWorkspaceObjectsChanged({
    workspaceId,
    objectId: stringValue(object?.id ?? result?.id) || null,
    path: stringValue(object?.path ?? result?.path) || null,
    action,
    versionId: stringValue(result?.version_id) || null,
    source: "agent",
  })
}

function approvalNeedFromRaw(
  raw: unknown,
  context?: {
    runId?: string | null
    sessionKey?: string | null
  }
): ApprovalEntry | null {
  const need = objectValue(raw)
  if (!need || need.kind !== "approval") {
    return null
  }

  const payload = objectValue(need.payload)
  const needId = stringValue(need.need_id)
  const approvalId = stringValue(payload?.approval_id) || needId
  const executionSessionId = stringValue(payload?.execution_session_id)
  const action =
    stringValue(need.action) ||
    stringValue(payload?.action) ||
    "run sandbox command"

  if (!needId && !approvalId && !executionSessionId) {
    return null
  }

  return {
    id: `approval-${approvalId || needId || executionSessionId}`,
    role: "approval",
    needId: needId || approvalId || executionSessionId,
    action,
    approvalId: approvalId || null,
    executionSessionId: executionSessionId || null,
    environmentId: stringValue(payload?.environment_id) || null,
    providerId: stringValue(payload?.provider_id) || null,
    runId: context?.runId ?? null,
    sessionKey: context?.sessionKey ?? null,
    status: "pending",
  }
}

function approvalNeedFromEvent(event: GatewayChatStreamEvent): ApprovalEntry | null {
  const metadata = objectValue(event.metadata)
  const runId = event.run_id || stringValue(metadata?.run_id) || null
  const sessionKey = stringValue(metadata?.session_key) || null
  const context = { runId, sessionKey }
  const metadataPayload = objectValue(metadata?.payload)
  const fromMetadata = approvalNeedFromRaw(
    objectValue(metadata?.pending_need) ??
      objectValue(metadata?.blocking_need) ??
      objectValue(metadataPayload?.pending_need),
    context
  )
  if (fromMetadata) {
    return fromMetadata
  }

  const parsedContent = parseJsonObject(event.content)
  return approvalNeedFromRaw(
    objectValue(parsedContent?.blocking_need) ??
      objectValue(parsedContent?.pending_need),
    context
  )
}

function approvalNeedFromMessage(message: ConversationMessageRecord): ApprovalEntry | null {
  const metadata = objectValue(message.metadata_json)
  const runId = message.run_id || stringValue(metadata?.run_id) || null
  const sessionKey = stringValue(metadata?.session_key) || null
  const context = { runId, sessionKey }
  const fromMetadata = approvalNeedFromRaw(
    objectValue(metadata?.pending_need) ?? objectValue(metadata?.blocking_need),
    context
  )
  if (fromMetadata) {
    return fromMetadata
  }

  const parsedContent = parseJsonObject(message.content)
  return approvalNeedFromRaw(
    objectValue(parsedContent?.blocking_need) ??
      objectValue(parsedContent?.pending_need),
    context
  )
}

function buildConversationTitle(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "新对话"
  }

  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized
}

type PendingConversationResumeState = {
  conversationId: string
  workspaceId: string
  runId?: string | null
  afterSeq?: number | null
}

const CONVERSATION_RESUME_STORAGE_KEY = "ineffable:conversation-stream-resume"

function readPendingConversationResumeState(): PendingConversationResumeState | null {
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
      !parsed.conversationId.trim() ||
      typeof parsed.workspaceId !== "string" ||
      !parsed.workspaceId.trim()
    ) {
      return null
    }

    return {
      conversationId: parsed.conversationId,
      workspaceId: parsed.workspaceId,
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

function writePendingConversationResumeState(state: PendingConversationResumeState) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(
    CONVERSATION_RESUME_STORAGE_KEY,
    JSON.stringify(state)
  )
}

function clearPendingConversationResumeState() {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem(CONVERSATION_RESUME_STORAGE_KEY)
}

function getLiveConversationRun(conversation: Conversation | null) {
  if (!conversation?.current_run) {
    return null
  }

  return conversation.current_run.is_streaming && conversation.current_run.is_live
    ? conversation.current_run
    : null
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

function getMessageReasoningContent(message: ConversationMessageRecord) {
  const contentJson =
    message.content_json && typeof message.content_json === "object"
      ? message.content_json
      : null
  const metadata =
    message.metadata_json && typeof message.metadata_json === "object"
      ? message.metadata_json
      : null

  const contentJsonReasoning = contentJson?.reasoning_content
  if (typeof contentJsonReasoning === "string" && contentJsonReasoning.trim()) {
    return contentJsonReasoning
  }

  const metadataReasoning = metadata?.reasoning_content
  if (typeof metadataReasoning === "string" && metadataReasoning.trim()) {
    return metadataReasoning
  }

  const matches = Array.from(
    message.content.matchAll(/<think>([\s\S]*?)<\/think>/g)
  )
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean)

  return matches.length > 0 ? matches.join("\n\n") : ""
}

function stripInlineThinkBlocks(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function parsePendingInputContent(event: GatewayChatStreamEvent): string | null {
  try {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? event.metadata
        : event.content
          ? JSON.parse(event.content)
          : null
    if (meta && typeof meta === "object" && "content" in meta) {
      return String(meta.content).trim() || null
    }
  } catch {
    // ignore parse errors
  }
  return null
}

function parsePendingInputId(event: GatewayChatStreamEvent): number | null {
  try {
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? event.metadata
        : event.content
          ? JSON.parse(event.content)
          : null
    if (meta && typeof meta === "object" && "id" in meta) {
      return Number(meta.id) || null
    }
  } catch {
    // ignore parse errors
  }
  return null
}

function hasRenderableConversationMessageContent(
  message: ConversationMessageRecord
) {
  if (message.content.trim()) {
    return true
  }

  return Boolean(getMessageReasoningContent(message).trim())
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
    content:
      message.role === "assistant" || message.message_type === "output"
        ? stripInlineThinkBlocks(message.content)
        : message.content,
    metadata,
  })
}

function compactAssistantHistoryMessages(messages: ConversationMessageRecord[]) {
  const lastAssistantIndexByScope = new Map<string, number>()

  messages.forEach((message, index) => {
    const isAssistantOutput =
      message.message_type === "output" ||
      (message.role === "assistant" && message.message_type !== "tool_call")
    if (!isAssistantOutput) {
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
    const isAssistantOutput =
      message.message_type === "output" ||
      (message.role === "assistant" && message.message_type !== "tool_call")
    if (!isAssistantOutput) {
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
    const reasoningContent = getMessageReasoningContent(message)
    if (
      reasoningContent &&
      (message.role === "assistant" || message.message_type === "output")
    ) {
      pane = applyEventToPaneState(
        pane,
        canonicalizeGatewayEvent({
          run_id: message.run_id ?? message.conversation_id,
          seq: index * 2 + 1,
          ts_ms: Date.parse(message.created_at),
          stream: "history",
          event: "reasoning_delta",
          phase: "history",
          scope:
            message.metadata_json &&
            typeof message.metadata_json === "object" &&
            typeof message.metadata_json.scope === "string"
              ? message.metadata_json.scope
              : null,
          role: "assistant",
          content: reasoningContent,
          metadata:
            message.metadata_json && typeof message.metadata_json === "object"
              ? { ...message.metadata_json }
              : null,
        })
      )
    }

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
    .filter(hasRenderableConversationMessageContent)
    .forEach((message) => {
      const approvalEntry = approvalNeedFromMessage(message)
      if (approvalEntry) {
        flushAssistantMessages()
        if (!entries.some((entry) => entry.id === approvalEntry.id)) {
          entries.push(approvalEntry)
        }
        return
      }

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
  const [hydratedConversationId, setHydratedConversationId] = React.useState<string | null>(null)
  const [sandboxOptions, setSandboxOptions] = React.useState<
    { environmentId: string; label: string; status: string }[]
  >([])
  const [selectedSandboxEnvironmentId, setSelectedSandboxEnvironmentId] = React.useState("")

  const abortRef = React.useRef<AbortController | null>(null)
  const assistantEntryIdRef = React.useRef<string | null>(null)
  const activeStreamConversationIdRef = React.useRef<string | null>(null)
  const activeRunIdRef = React.useRef<string | null>(null)
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
  const [preInputQueue, setPreInputQueue] = React.useState<PreInputQueueItem[]>([])

  const refreshPendingInputsForConversation = React.useCallback(
    async (conversationId: string) => {
      if (!conversationId || !accessToken || !currentWorkspace) {
        return
      }

      const res = await getPendingInputs(
        accessToken,
        currentWorkspace.id,
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
    [accessToken, currentWorkspace]
  )

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
    if (typeof window === "undefined") {
      return
    }
    setSelectedSandboxEnvironmentId(
      window.localStorage.getItem(sandboxStorageKey(currentConversationId)) ?? ""
    )
  }, [currentConversationId])

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

  // 加载 DB 中的 pending 队列并同步到本地状态
  React.useEffect(() => {
    if (!currentConversationId || !accessToken || !currentWorkspace) {
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
  }, [currentConversationId, refreshPendingInputsForConversation])

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

  const bindStatus = currentConversationId ? "已绑定产品会话" : "尚未创建会话"
  const isSending = streamStatus === "streaming" || streamStatus === "recovering"
  const selectedConversationTitle =
    selectedConversation?.title || "梳理前端用户与会话管理接入需求"
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

      if (!currentWorkspace?.id) {
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
        workspaceId: currentWorkspace.id,
        runId: overrides?.runId ?? activeRunIdRef.current,
        afterSeq,
      })
    },
    [currentWorkspace]
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
        setHydratedConversationId(null)
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
        setConversationLastSeq(conversationId, response.next_seq ?? 0)
        setHydratedConversationId(conversationId)
        setError(null)
      } catch (error) {
        setHydratedConversationId(null)
        throw error
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [accessToken, currentWorkspace, setConversationLastSeq]
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
    setHydratedConversationId(null)

    if (!currentConversationId) {
      setEntries([])
      setError(null)
      return
    }

    void syncConversationMessages(currentConversationId).catch((loadError) => {
      setEntries([])
      setError(loadError instanceof Error ? loadError.message : "加载会话失败。")
    })
  }, [
    clearRecoveryTimer,
    currentConversationId,
    syncConversationMessages,
    updateStreamStatus,
  ])

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
      syncConversationMessages(conversationId),
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
        syncConversationMessages(conversationId),
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
        syncConversationMessages(currentConversationIdRef.current),
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
      const errorMessage = (event.content ?? "Gateway stream failed").trim()
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
          updateStreamStatus("recovering")
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

  const resumeConversationStream = React.useEffectEvent(
    async (
      conversationId: string,
      runId?: string | null,
      afterSeq?: number | null
    ) => {
      if (!accessToken || !currentWorkspace || !conversationId) {
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
          currentWorkspace.id,
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
        const message =
          resumeError instanceof Error ? resumeError.message : "恢复会话失败。"
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
      activeRunIdRef.current = envelope.event.run_id
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
      recoveryInFlightRef.current = false
      clearRecoveryTimer()
      activeStreamConversationIdRef.current = null
      updateStreamStatus("error")
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
    notifyWorkspaceToolResult(envelope.event)
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
  }, [])

  React.useEffect(() => {
    if (!accessToken || !currentWorkspace || !currentConversationId) {
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
      pending &&
      pending.workspaceId === currentWorkspace.id &&
      pending.conversationId === currentConversationId
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
    currentWorkspace,
    hydratedConversationId,
    selectedConversation?.current_run_id,
    selectedLiveRun?.id,
  ])

  function clearConversation() {
    setEntries([])
    setError(null)
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
      const message =
        approvalError instanceof Error ? approvalError.message : "审批操作失败。"
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
    if (!accessToken || !currentWorkspace || !content.trim()) {
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
          currentWorkspace.id,
          {
            conversation_id: targetConversationId,
            content,
            stream: false,
            channel: "web",
            input_mode: mode,
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
        const message =
          enqueueError instanceof Error
            ? enqueueError.message
            : "发送失败。"
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
      const message =
        primeError instanceof Error ? primeError.message : "初始化会话恢复游标失败。"
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
        currentWorkspace.id,
        {
          conversation_id: targetConversationId,
          content,
          stream: true,
          channel: "web",
          input_mode: mode, // 仅引导模式显式传递；其他情况由后端根据活跃状态自动决定
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

      const message = streamError instanceof Error ? streamError.message : "发送失败。"
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
    if (!content || !accessToken || !currentWorkspace) {
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
    if (dbId && accessToken && currentWorkspace && currentConversationId) {
      const guidedEntryId = beginGuidedUserTurn(item.content)
      setPreInputQueue((prev) => prev.filter((queueItem) => queueItem.id !== id))
      void promotePendingInput(
        accessToken,
        currentWorkspace.id,
        currentConversationId,
        dbId
      ).catch((promoteError) => {
        const message =
          promoteError instanceof Error
            ? promoteError.message
            : "提升为引导失败。"
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
    if (dbId && accessToken && currentWorkspace && currentConversationId) {
      setPreInputQueue((prev) =>
        prev.map((queueItem) =>
          queueItem.id === id ? { ...queueItem, status: "deleting" } : queueItem
        )
      )
      void deletePendingInput(
        accessToken,
        currentWorkspace.id,
        currentConversationId,
        dbId
      )
        .then(() => {
          setPreInputQueue((prev) => prev.filter((q) => q.id !== id))
        })
        .catch((deleteError) => {
          const message =
            deleteError instanceof Error ? deleteError.message : "删除预输入失败。"
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
          onApproveApproval={(entryId) => {
            void handleResolveApproval(entryId, true)
          }}
          onRejectApproval={(entryId) => {
            void handleResolveApproval(entryId, false)
          }}
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
        preInputQueue={preInputQueue}
        sandboxOptions={sandboxOptions}
        selectedSandboxEnvironmentId={selectedSandboxEnvironmentId}
        onComposerChange={setComposer}
        onComposerKeyDown={handleComposerKeyDown}
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
