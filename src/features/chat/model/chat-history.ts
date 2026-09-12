import { mergeAssistantSegments, transcriptSegment, updateUserInputTool } from "./assistant-segments"
import { parseInputProgress } from "./input-progress"
import { humanInputResponseIdentity, reconcileHumanInputAnswers, inputBoundaryForRun } from "./human-input-timeline"
import {
  applyCanonicalMessageToPane,
  applyMessageToPane,
  applyReasoningDeltaToPane,
  applyTextDeltaToPane,
  appendUpdateToPane,
  buildToolView,
  findUserInputTool,
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
import type {
  AssistantEntry,
  CapabilityExposureSummary,
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
// 2. Distinct output segments must be preserved by their message identity.
// 3. Structural records such as tool_call/tool_result must be preserved verbatim so
//    tool blocks and their ordering survive the post-stream resync path.

export type ConversationRuntimeSelection = {
  modelProfileId: string
  sandboxEnvironmentId: string | null
}

export function findLatestConversationRuntimeSelection(
  messages: ConversationMessageRecord[]
): ConversationRuntimeSelection | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "user") continue

    const metadata = message.metadata_json
    const modelProfileId =
      typeof metadata?.model_profile_id === "string"
        ? metadata.model_profile_id.trim()
        : ""
    if (!modelProfileId) continue

    const sandbox = metadata?.sandbox
    const sandboxEnvironmentId =
      sandbox &&
      typeof sandbox === "object" &&
      !Array.isArray(sandbox) &&
      "environment_id" in sandbox &&
      typeof sandbox.environment_id === "string"
        ? sandbox.environment_id.trim()
        : ""

    return { modelProfileId, sandboxEnvironmentId }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const projectedModelProfileId = message.model_profile_id?.trim()
    if (projectedModelProfileId) {
      return {
        modelProfileId: projectedModelProfileId,
        sandboxEnvironmentId: null,
      }
    }
  }

  return null
}

export function createAssistantEntry(
  status: AssistantEntry["status"],
  runId?: string | null
): AssistantEntry {
  return {
    id: createMessageId("assistant"),
    role: "assistant",
    runId: runId ?? null,
    definitionFingerprint: null,
    agentId: null,
    modelProfileId: null,
    sandboxEnvironmentId: null,
    runStartedAt: null,
    runCompletedAt: null,
    runDurationMs: null,
    capabilityExposure: null,
    createdAt: null,
    status,
    pane: createEmptyAgentPane(),
    subagentOrder: [],
    subagents: {},
  }
}

function parseCapabilityExposureSummary(
  metadata: ConversationMessageRecord["metadata_json"]
): CapabilityExposureSummary | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const value = metadata.capability_exposure
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const summary = value as Record<string, unknown>

  const mode = summary.mode
  if (mode !== "smart" && mode !== "clean" && mode !== "full" && mode !== "custom") {
    return null
  }
  const count = (key: string) => {
    const candidate = summary[key]
    return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0
      ? candidate
      : null
  }
  const authorizedCount = count("authorized_count")
  const initialExposedCount = count("initial_exposed_count")
  const prefetchedCount = count("prefetched_count")
  const activatedCount = count("activated_count")
  const finalExposedCount = count("final_exposed_count")
  const deferredCount = count("deferred_count")
  const stableCount = count("stable_count")
  const dynamicCount = count("dynamic_count")
  const schemaBytes = count("schema_bytes")
  const planHash =
    typeof summary.plan_hash === "string" ? summary.plan_hash.trim() : ""
  if (
    authorizedCount == null ||
    initialExposedCount == null ||
    prefetchedCount == null ||
    activatedCount == null ||
    finalExposedCount == null ||
    deferredCount == null ||
    stableCount == null ||
    dynamicCount == null ||
    schemaBytes == null ||
    !planHash
  ) {
    return null
  }

  return {
    mode,
    authorizedCount,
    initialExposedCount,
    prefetchedCount,
    activatedCount,
    finalExposedCount,
    deferredCount,
    stableCount,
    dynamicCount,
    schemaBytes,
    planHash,
  }
}

export function findAssistantEntryIdForRun(
  entries: ChatEntry[],
  runId: string | null | undefined
) {
  const normalizedRunId = runId?.trim()
  if (!normalizedRunId) return null

  const boundary = inputBoundaryForRun(entries, normalizedRunId)
  const hasLaterInput = entries.some((entry) => entry.role === "user" &&
    (entry.humanInputResponse?.runId === normalizedRunId || (entry.inputProgress?.kind === "guided" &&
      entry.inputProgress.phase === "accepted" && entry.inputProgress.run_id === normalizedRunId)))
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.role === "assistant" && entry.runId === normalizedRunId &&
        (boundary == null || (!hasLaterInput && !entry.timelineUnitId) || entry.timelineUnitId === `run:${normalizedRunId}:anchor:${boundary + 1}`)) {
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

function buildAssistantEntryFromMessages(
  messages: ConversationMessageRecord[],
  buildSegments = true
): AssistantEntry {
  if (buildSegments && messages.some(message => transcriptSegment(message.metadata_json))) {
    const groups = new Map<string, ConversationMessageRecord[]>()
    for (const message of messages) {
      const key = transcriptSegment(message.metadata_json)?.id ?? "legacy"
      const group = groups.get(key) ?? []
      group.push(message)
      groups.set(key, group)
    }
    const shell = buildAssistantEntryFromMessages(messages, false)
    shell.segments = {}
    for (const [key, group] of groups) {
      const fragment = buildAssistantEntryFromMessages(group, false)
      fragment.segmentIdentity = transcriptSegment(group[0].metadata_json) ?? undefined
      shell.segments[key] = fragment
    }
    return mergeAssistantSegments({ ...shell, segments: {} }, shell)
  }
  const first = messages[0]
  const runId =
    messages.find((message) => message.run_id)?.run_id ??
    null
  const definitionFingerprint =
    messages.find((message) => message.definition_fingerprint)
      ?.definition_fingerprint ??
    null
  const agentId = messages.find((message) => message.agent_id)?.agent_id ?? null
  const modelProfileId =
    messages.find((message) => message.model_profile_id)?.model_profile_id ?? null
  const sandboxEnvironmentId =
    messages.find((message) => message.sandbox_environment_id)
      ?.sandbox_environment_id ?? null
  const runStartedAt =
    messages.find((message) => message.run_started_at)?.run_started_at ?? null
  const runCompletedAt =
    messages.find((message) => message.run_completed_at)?.run_completed_at ?? null
  const runDurationMs =
    messages.find((message) => Number.isFinite(message.run_duration_ms))
      ?.run_duration_ms ?? null
  const capabilityExposure = messages.reduce<CapabilityExposureSummary | null>(
    (latest, message) =>
      parseCapabilityExposureSummary(message.metadata_json) ?? latest,
    null
  )
  const createdAt = messages.reduce<string | null>((latest, message) => {
    const timestamp = Date.parse(message.created_at)
    if (!Number.isFinite(timestamp)) return latest
    return latest == null || timestamp > Date.parse(latest) ? message.created_at : latest
  }, null)
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


  const historyEvents = canonicalMessagesToGatewayEvents(
    messages.map((message) => ({
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

  historyEvents.forEach((event) => {
    // Each canonical/projected message is an independent segment. Never collapse
    // different identities by scope or infer cumulative content from a prefix.
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
    definitionFingerprint,
    agentId,
    modelProfileId,
    sandboxEnvironmentId,
    runStartedAt,
    runCompletedAt,
    runDurationMs,
    capabilityExposure,
    createdAt,
    canonicalMessageSeqEnd,
    historyMessages: messages,
    timelineSeq,
    timelineUnitId,
    status: "done",
    pane: finalizePane(pane),
    subagentOrder,
    subagents: finalizedSubagents,
  }
}

/** Prepend only unseen message identities; preserve the current live pane tail. */
export function prependAssistantHistory(current: AssistantEntry, older: AssistantEntry): AssistantEntry {
  if (current.segments || older.segments) return mergeAssistantSegments(current, { ...older, status: current.status, eventCoverage: current.eventCoverage }, false)
  const loaded = new Set(current.historyMessages?.map(message => message.id))
  const missing = older.historyMessages?.filter(message => !loaded.has(message.id)) ?? []
  if (!missing.length) return current
  const prefix = buildAssistantEntryFromMessages(missing)
  const prependPane = (before: AgentPaneState, after: AgentPaneState): AgentPaneState => {
    const prefixOrder = before.blockOrder.filter(id => {
      const block = before.blocks[id]
      return block.type !== "tool" || !after.tools[block.toolId]
    })
    return { ...after, blockOrder: [...prefixOrder, ...after.blockOrder],
      blocks: { ...before.blocks, ...after.blocks }, tools: { ...before.tools, ...after.tools } }
  }
  const subagentOrder = [...new Set([...prefix.subagentOrder, ...current.subagentOrder])]
  const subagents = { ...current.subagents }
  for (const id of prefix.subagentOrder) {
    const existing = current.subagents[id]
    subagents[id] = existing
      ? { ...existing, ...prependPane(prefix.subagents[id], existing) }
      : prefix.subagents[id]
  }
  return { ...current, pane: prependPane(prefix.pane, current.pane), subagentOrder, subagents,
    historyMessages: [...missing, ...(current.historyMessages ?? [])] }
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
        entries.push({
          id: message.timeline_unit_id || message.id,
          role: "user",
          inputProgress: parseInputProgress(message.metadata_json?.input_progress),
          humanInputResponse: humanInputResponseIdentity(message.run_id, message.metadata_json),
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
  return reconcileHumanInputAnswers(entries)
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
      if (targetIndex < 0) targetIndex = index
      const matchingTool = findUserInputTool(entry.pane, need.needId, need.runId)
      if (matchingTool) {
        targetIndex = index
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
  const toolId = targetToolId ?? `need:${need.runId}:${need.needId}`
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
      responseMessageId: existing?.responseMessageId,
    }),
  }

  if (targetIndex < 0) {
    return [...entries, updateUserInputTool(nextEntry, nextEntry.pane.tools[toolId])]
  }
  const next = [...entries]
  next[targetIndex] = updateUserInputTool(nextEntry, nextEntry.pane.tools[toolId])
  return next
}
