import {
  applyCanonicalMessageToPane,
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  createEmptyAgentPane,
  finalizePane,
  type AgentPaneState,
  upsertToolInPane,
} from "@/features/chat/chat-pane-state"
import {
  createEmptySubagent,
  createMessageId,
  getSubagentId,
  getSubagentName,
  getToolCallId,
  getToolName,
  isReasoningEvent,
  isSubScope,
  isTextDeltaEvent,
  isToolEvent,
} from "@/features/chat/gateway-chat-helpers"
import type { ToolCallView } from "@/features/chat/chat-pane-state"
import type {
  AssistantEntry,
  ChatEntry,
  SubagentView,
} from "@/features/chat/gateway-chat-types"
import {
  approvalNeedFromMessage,
  type UserInputNeed,
} from "@/features/chat/model/chat-parsing"
import type {
  Conversation,
  ConversationMessageRecord,
} from "@/features/chat/api/chat-api"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"
import { projectDeclaredWebNode } from "@/features/chat/runtime/plugin-web-node-projection"
import { canonicalMessagesToGatewayEvents } from "@/features/chat/model/canonical-message-event"

// History replay invariants:
// 1. Replay must rebuild the same structural blocks the live SSE path produced.
// 2. Only assistant output snapshots may be compacted during replay.
// 3. Structural records such as tool_call/tool_result must be preserved verbatim so
//    tool blocks and their ordering survive the post-stream resync path.

export function createAssistantEntry(
  status: AssistantEntry["status"],
  runId?: string | null
): AssistantEntry {
  return {
    id: createMessageId("assistant"),
    role: "assistant",
    runId: runId ?? null,
    status,
    pane: createEmptyAgentPane(),
    subagentOrder: [],
    subagents: {},
  }
}

export function findAssistantEntryIdForRun(
  entries: ChatEntry[],
  runId: string | null | undefined
) {
  const normalizedRunId = runId?.trim()
  if (!normalizedRunId) return null

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.role === "assistant" && entry.runId === normalizedRunId) {
      return entry.id
    }
  }

  return null
}

export function getLiveConversationRun(conversation: Conversation | null) {
  if (!conversation?.current_run) {
    return null
  }

  return conversation.current_run.is_streaming && conversation.current_run.is_live
    ? conversation.current_run
    : null
}

export function applyEventToPaneState(
  pane: AgentPaneState,
  event: GatewayChatStreamEvent
) {
  const eventName = event.event
  const content = event.content ?? ""

  const nextPane = isTextDeltaEvent(eventName)
    ? applyTextDeltaToPane(pane, content)
    : isReasoningEvent(eventName)
      ? applyReasoningDeltaToPane(pane, content)
      : eventName === "assistant.snapshot"
        ? event.stream === "history"
          ? applyCanonicalMessageToPane(pane, content)
          : applyMessageToPane(pane, content)
        : appendUpdateToPane(pane, content)
  return projectDeclaredWebNode(nextPane, event)
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

function hasRenderableConversationMessageContent(
  message: ConversationMessageRecord
) {
  if (
    message.message_type === "tool_call" ||
    message.message_type === "tool_result"
  ) {
    return true
  }
  if (message.content.trim()) {
    return true
  }

  return Boolean(
    getMessageReasoningContent(message).trim() ||
      (message.metadata_json &&
        typeof message.metadata_json === "object" &&
        message.metadata_json.web_view !== undefined)
  )
}

function compactAssistantHistoryMessages(messages: ConversationMessageRecord[]) {
  const lastAssistantIndexByScope = new Map<string, number>()

  const isDeclaredPluginView = (message: ConversationMessageRecord) =>
    Boolean(
      message.metadata_json &&
        typeof message.metadata_json === "object" &&
        message.metadata_json.web_view !== undefined
    )

  messages.forEach((message, index) => {
    const isAssistantOutput =
      !isDeclaredPluginView(message) &&
      (message.message_type === "output" ||
        (message.role === "assistant" && message.message_type !== "tool_call"))
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
      !isDeclaredPluginView(message) &&
      (message.message_type === "output" ||
        (message.role === "assistant" && message.message_type !== "tool_call"))
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

function buildAssistantEntryFromMessages(
  messages: ConversationMessageRecord[]
): AssistantEntry {
  const compactedMessages = compactAssistantHistoryMessages(messages)
  const first = compactedMessages[0] ?? messages[0]
  const runId =
    compactedMessages.find((message) => message.run_id)?.run_id ??
    messages.find((message) => message.run_id)?.run_id ??
    null
  const timelineUnitId =
    messages.find((message) => message.timeline_unit_id)?.timeline_unit_id ?? null
  const timelineSeq = messages.reduce<number | null>(
    (earliest, message) =>
      Number.isSafeInteger(message.timeline_seq) &&
      (earliest == null || message.timeline_seq < earliest)
        ? message.timeline_seq
        : earliest,
    null
  )
  const canonicalMessageSeqEnd = messages.reduce<number | null>(
    (latest, message) => {
      const sequence = message.canonical_seq ?? Number.NaN
      return Number.isSafeInteger(sequence) && (latest == null || sequence > latest)
        ? sequence
        : latest
    },
    null
  )
  let pane = createEmptyAgentPane()
  const subagents: Record<string, SubagentView> = {}
  const subagentOrder: string[] = []
  const snapshotContentByScope = new Map<string, string>()

  const historyEvents = canonicalMessagesToGatewayEvents(
    compactedMessages.map((message) => ({
      role: message.role,
      messageType: message.message_type,
      content: message.content,
      reasoningContent:
        message.role === "assistant" || message.message_type === "output"
          ? getMessageReasoningContent(message)
          : null,
      metadata:
        message.metadata_json && typeof message.metadata_json === "object"
          ? { ...message.metadata_json }
          : null,
      runId: message.run_id,
      conversationId: message.conversation_id,
      createdAt: message.created_at,
    })),
    {
      stream: "history",
      phase: "history",
      defaultRunId: runId,
      conversationId: first?.conversation_id,
    }
  )

  historyEvents.forEach((sourceEvent) => {
    let event = sourceEvent

    if (event.event === "assistant.snapshot") {
      const metadata =
        event.metadata && typeof event.metadata === "object"
          ? event.metadata
          : null
      const scope =
        metadata && typeof metadata.scope === "string" && metadata.scope.trim()
          ? metadata.scope.trim()
          : "main"
      const subagentId =
        metadata &&
        typeof metadata.subagent_id === "string" &&
        metadata.subagent_id.trim()
          ? metadata.subagent_id.trim()
          : ""
      const scopeKey = `${scope}::${subagentId}`
      const snapshotContent = event.content ?? ""
      const previousSnapshot = snapshotContentByScope.get(scopeKey) ?? ""
      snapshotContentByScope.set(scopeKey, snapshotContent)
      if (previousSnapshot && snapshotContent.startsWith(previousSnapshot)) {
        event = {
          ...event,
          event: "model.text.delta",
          content: snapshotContent.slice(previousSnapshot.length),
        }
      }
    }

    if (isSubScope(event)) {
      const subagentId = getSubagentId(event) || `subagent-${event.seq}`
      const subagentName = getSubagentName(event)
      const existing =
        subagents[subagentId] ?? createEmptySubagent(subagentId, subagentName)
      const nextSubagent = isToolEvent(event.event)
        ? (() => {
            const { toolId, tool } = buildToolView(
              existing,
              event,
              getToolCallId,
              getToolName
            )
            return projectDeclaredWebNode(
              upsertToolInPane(existing, toolId, tool),
              event
            ) as SubagentView
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
      pane = projectDeclaredWebNode(upsertToolInPane(pane, toolId, tool), event)
      return
    }

    pane = applyEventToPaneState(pane, event)
  })

  const finalizedSubagents = Object.fromEntries(
    subagentOrder.map((subagentId) => {
      const subagent =
        subagents[subagentId] ?? createEmptySubagent(subagentId, subagentId)
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
    id: timelineUnitId ?? first?.id ?? createMessageId("assistant"),
    role: "assistant",
    runId,
    canonicalMessageSeqEnd,
    timelineSeq,
    timelineUnitId,
    status: "done",
    pane: finalizePane(pane),
    subagentOrder,
    subagents: finalizedSubagents,
  }
}

function resolveWaitingUserInputTool(
  tool: ToolCallView,
  answer: string
): ToolCallView {
  if (tool.name !== "request_user_input" || tool.status !== "waiting") {
    return tool
  }

  return {
    ...tool,
    status: "succeeded",
    answer,
  }
}

function restoreUserInputAnswer(
  entry: AssistantEntry,
  answer: string
): AssistantEntry {
  let resolved = false
  const resolvePane = (pane: AgentPaneState) => {
    const tools = { ...pane.tools }

    for (let index = pane.blockOrder.length - 1; index >= 0; index -= 1) {
      const block = pane.blocks[pane.blockOrder[index]]
      if (block?.type !== "tool") continue
      const tool = tools[block.toolId]
      if (
        tool?.name !== "request_user_input" ||
        tool.status !== "waiting"
      ) {
        continue
      }

      tools[block.toolId] = resolveWaitingUserInputTool(tool, answer)
      resolved = true
      break
    }

    return resolved ? { ...pane, tools } : pane
  }

  const pane = resolvePane(entry.pane)
  if (resolved) {
    return { ...entry, pane }
  }

  const subagents = { ...entry.subagents }
  for (let index = entry.subagentOrder.length - 1; index >= 0; index -= 1) {
    const subagentId = entry.subagentOrder[index]
    const subagent = subagents[subagentId]
    if (!subagent) continue
    const restored = resolvePane(subagent)
    if (resolved) {
      subagents[subagentId] = {
        ...subagent,
        ...restored,
      }
      return { ...entry, subagents }
    }
  }

  return entry
}

export function mapConversationMessagesToEntries(
  messages: ConversationMessageRecord[]
): ChatEntry[] {
  const entries: ChatEntry[] = []
  let pendingAssistantMessages: ConversationMessageRecord[] = []
  let pendingAssistantRunId: string | null = null
  let pendingAssistantTimelineUnitId: string | null = null

  const flushAssistantMessages = () => {
    if (!pendingAssistantMessages.length) {
      return
    }

    entries.push(buildAssistantEntryFromMessages(pendingAssistantMessages))
    pendingAssistantMessages = []
    pendingAssistantRunId = null
    pendingAssistantTimelineUnitId = null
  }

  messages
    .filter(hasRenderableConversationMessageContent)
    .forEach((message) => {
      const approvalEntry = approvalNeedFromMessage(message)
      if (approvalEntry) {
        flushAssistantMessages()
        if (!entries.some((entry) => entry.id === approvalEntry.id)) {
          entries.push({
            ...approvalEntry,
            timelineSeq: message.timeline_seq,
            timelineUnitId: message.timeline_unit_id,
          })
        }
        return
      }

      if (message.role === "user" || message.message_type === "input") {
        flushAssistantMessages()
        const previousEntry = entries[entries.length - 1]
        if (previousEntry?.role === "assistant") {
          entries[entries.length - 1] = restoreUserInputAnswer(
            previousEntry,
            message.content
          )
        }
        entries.push({
          id: message.timeline_unit_id || message.id,
          role: "user",
          content: message.content,
          timelineSeq: message.timeline_seq,
          timelineUnitId: message.timeline_unit_id,
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
        const messageTimelineUnitId = message.timeline_unit_id || null
        if (
          pendingAssistantMessages.length > 0 &&
          ((pendingAssistantTimelineUnitId &&
            messageTimelineUnitId &&
            pendingAssistantTimelineUnitId !== messageTimelineUnitId) ||
            (!pendingAssistantTimelineUnitId &&
              pendingAssistantRunId &&
              messageRunId &&
              pendingAssistantRunId !== messageRunId))
        ) {
          flushAssistantMessages()
        }

        pendingAssistantMessages.push(message)
        pendingAssistantRunId = messageRunId
        pendingAssistantTimelineUnitId = messageTimelineUnitId
        return
      }

      flushAssistantMessages()
      entries.push({
        id: message.timeline_unit_id || message.id,
        role: "system",
        content: message.content,
        timelineSeq: message.timeline_seq,
        timelineUnitId: message.timeline_unit_id,
      })
    })

  flushAssistantMessages()
  return entries
}

export function reconcilePendingUserInput(
  entries: ChatEntry[],
  need: UserInputNeed
): ChatEntry[] {
  let targetIndex = -1
  let targetToolId: string | null = null
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.role === "assistant" && entry.runId === need.runId) {
      targetIndex = index
      const matchingTool = Object.values(entry.pane.tools).find(
        (tool) =>
          tool.needId === need.needId ||
          tool.protocolId === need.needId ||
          tool.id === need.needId
      )
      if (matchingTool) {
        targetToolId = matchingTool.id
        break
      }
    }
  }

  const candidate = targetIndex >= 0 ? entries[targetIndex] : null
  const current =
    candidate?.role === "assistant"
      ? candidate
      : createAssistantEntry("done", need.runId)
  const toolId = targetToolId ?? need.needId
  const existing = current.pane.tools[toolId]
  const nextEntry: AssistantEntry = {
    ...current,
    runId: current.runId ?? need.runId,
    pane: upsertToolInPane(current.pane, toolId, {
      id: toolId,
      protocolId: existing?.protocolId ?? need.needId,
      needId: need.needId,
      name: "request_user_input",
      input: existing?.input || JSON.stringify({ questions: need.questions }),
      output: existing?.output || "",
      status: "waiting",
      runId: need.runId,
      sessionKey: need.sessionKey,
      answer: existing?.answer,
    }),
  }

  if (targetIndex < 0) {
    return [...entries, nextEntry]
  }
  const next = [...entries]
  next[targetIndex] = nextEntry
  return next
}
