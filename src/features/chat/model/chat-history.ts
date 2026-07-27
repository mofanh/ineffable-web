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
import { approvalNeedFromMessage } from "@/features/chat/model/chat-parsing"
import type {
  Conversation,
  ConversationMessageRecord,
} from "@/features/chat/api/chat-api"
import type { GatewayChatStreamEvent } from "@/lib/api/chat/gateway-events"

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

  if (isTextDeltaEvent(eventName)) {
    return applyTextDeltaToPane(pane, content)
  }

  if (isReasoningEvent(eventName)) {
    return applyReasoningDeltaToPane(pane, content)
  }

  if (eventName === "assistant.snapshot") {
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

  let eventName = "assistant.snapshot"
  let role = message.role

  if (message.message_type === "tool_call") {
    eventName = "tool.call.completed"
    role = "tool_call"
  } else if (message.message_type === "tool_result") {
    eventName = "tool.result"
    role = "tool"
  } else if (message.message_type === "output") {
    eventName = "assistant.snapshot"
    role = "assistant"
  } else if (message.message_type === "system") {
    eventName = "assistant.snapshot"
    role = "system"
  } else if (message.message_type !== "input") {
    eventName = "assistant.snapshot"
  }

  return {
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
  }
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

function buildAssistantEntryFromMessages(
  messages: ConversationMessageRecord[]
): AssistantEntry {
  const compactedMessages = compactAssistantHistoryMessages(messages)
  const first = compactedMessages[0] ?? messages[0]
  const runId =
    compactedMessages.find((message) => message.run_id)?.run_id ??
    messages.find((message) => message.run_id)?.run_id ??
    null
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
        {
          run_id: message.run_id ?? message.conversation_id,
          seq: index * 2 + 1,
          ts_ms: Date.parse(message.created_at),
          stream: "history",
          event: "model.reasoning.delta",
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
        }
      )
    }

    const event = buildHistoryEvent(message, index + 1)
    if (!event) {
      return
    }

    if (isSubScope(event)) {
      const subagentId = getSubagentId(event) || `subagent-${message.id}`
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
    id: first?.id ?? createMessageId("assistant"),
    role: "assistant",
    runId,
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
        const previousEntry = entries[entries.length - 1]
        if (previousEntry?.role === "assistant") {
          entries[entries.length - 1] = restoreUserInputAnswer(
            previousEntry,
            message.content
          )
        }
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
