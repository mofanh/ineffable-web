import assert from "node:assert/strict"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

import { finalizePane, getPaneBlocks } from "../src/features/chat/chat-pane-state.ts"
import {
  createAssistantEntry,
  findLatestConversationRuntimeSelection,
  findAssistantEntryIdForRun,
  mapConversationMessagesToEntries,
  reconcilePendingUserInput,
} from "../src/features/chat/model/chat-history.ts"
import { findEligibleTrialAnswer } from "../src/features/chat/model/agent-trial-verdict.ts"
import {
  projectConversationOutputEvent,
  projectConversationUserInputNeed,
} from "../src/features/chat/runtime/conversation-event-projector.ts"
import { userInputNeedFromEvent } from "../src/features/chat/model/chat-parsing.ts"
import {
  createConversationRunRuntime,
  reduceConversationRunRuntime,
} from "../src/features/chat/runtime/conversation-run-reducer.ts"
import {
  normalizeGatewayEnvelope,
} from "../src/lib/api/chat/gateway-events.ts"
import { parseSseStream } from "../src/lib/api/chat/sse-stream.ts"
import {
  WebNodeRendererRegistry,
  WebNodeSeat,
} from "../src/features/chat/components/web-node-registry.tsx"
import { WEB_NODE_SCHEMA_VERSION } from "../src/features/chat/web-node.ts"
import {
  getToolCallPresentation,
  getToolCallSummary,
  getToolCallTitle,
} from "../src/features/chat/model/tool-call-presentation.ts"
import { i18n } from "../src/lib/i18n/i18n.ts"
import { parseLeadingJsonObject } from "../src/features/chat/model/leading-json-object.ts"
import { extractWorkspaceArtifact } from "../src/features/chat/runtime/workspace-artifacts.ts"
import { WebNodeList } from "../src/features/chat/components/agent-pane.tsx"
import {
  canonicalMessagesToGatewayEvents,
  hasCanonicalAssistantOutput,
} from "../src/features/chat/model/canonical-message-event.ts"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list.tsx"
import {
  clearUnavailableComposerRuntimeSelectionField,
  commitAcceptedComposerRuntimeSelection,
  readCachedComposerRuntimeSelection,
  reconcileCanonicalComposerRuntimeSelection,
  writeCanonicalComposerRuntimeSelection,
  writeComposerRuntimeSelectionDraft,
} from "../src/features/chat/model/composer-runtime-selection.ts"
import {
  agentNodeManagementTargetKey,
  matchesAgentNodeProjectionTarget,
  resolveAgentEvolutionWorkspaceId,
  resolveAgentNodeTargetConversationId,
} from "../src/features/chat/model/agent-node-management.ts"

globalThis.React = React
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = globalThis
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})

const conversationId = "conversation-web-integration"
const runId = "run-web-integration"

assert.equal(
  resolveAgentEvolutionWorkspaceId({
    id: "personal-workspace",
    workspace_type: "personal",
  }),
  undefined,
  "personal Agent Node history must use the user-level evolution scope"
)
assert.equal(
  resolveAgentEvolutionWorkspaceId({
    id: "team-workspace",
    workspace_type: "team",
  }),
  "team-workspace",
  "team Agent Node history must remain workspace scoped"
)
assert.equal(
  resolveAgentNodeTargetConversationId(
    "removed-conversation",
    "current-conversation",
    ["current-conversation", "older-conversation"]
  ),
  "current-conversation",
  "a removed management target must fall back to the current accessible conversation"
)
assert.equal(
  agentNodeManagementTargetKey("conversation-a", undefined),
  "conversation-a:user",
  "personal Agent Node requests must have a stable user-scope identity"
)
assert.equal(
  agentNodeManagementTargetKey("conversation-a", "team-workspace"),
  "conversation-a:team-workspace",
  "team Agent Node requests must include their workspace scope identity"
)
assert.equal(
  matchesAgentNodeProjectionTarget(
    { conversation_id: "conversation-a", workspace_id: null },
    "conversation-a",
    undefined
  ),
  true
)
assert.equal(
  matchesAgentNodeProjectionTarget(
    { conversation_id: "conversation-a", workspace_id: null },
    "conversation-b",
    undefined
  ),
  false,
  "a stale projection must never expose actions for the newly selected target"
)
assert.equal(
  matchesAgentNodeProjectionTarget(
    { conversation_id: "conversation-a", workspace_id: "team-a" },
    "conversation-a",
    "team-b"
  ),
  false,
  "a projection from another workspace scope must never expose actions"
)

function memorySelectionStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
  }
}

assert.deepEqual(
  findLatestConversationRuntimeSelection([
    {
      role: "user",
      metadata_json: {
        model_profile_id: "model-latest",
        sandbox: { environment_id: "sandbox-latest" },
      },
    },
    { role: "assistant", model_profile_id: "model-latest", metadata_json: {} },
  ]),
  { modelProfileId: "model-latest", sandboxEnvironmentId: "sandbox-latest" },
  "normal user-to-assistant transcript order must retain the canonical sandbox selection"
)
assert.deepEqual(
  findLatestConversationRuntimeSelection([
    { role: "user", metadata_json: {} },
    {
      role: "user",
      metadata_json: {
        model_profile_id: "model-sandbox",
        sandbox: { environment_id: "sandbox-latest" },
      },
    },
  ]),
  { modelProfileId: "model-sandbox", sandboxEnvironmentId: "sandbox-latest" }
)
assert.deepEqual(
  findLatestConversationRuntimeSelection([
    { role: "user", metadata_json: { model_profile_id: "model-no-sandbox" } },
    { role: "assistant", model_profile_id: "model-no-sandbox" },
  ]),
  { modelProfileId: "model-no-sandbox", sandboxEnvironmentId: "" },
  "an explicit canonical no-sandbox request must survive refresh"
)
assert.deepEqual(
  findLatestConversationRuntimeSelection([
    {
      role: "assistant",
      model_profile_id: "model-from-run-projection",
      metadata_json: {},
    },
  ]),
  {
    modelProfileId: "model-from-run-projection",
    sandboxEnvironmentId: null,
  },
  "a bounded page that omits the trigger input must still restore the authoritative run model without changing the sandbox draft"
)
assert.equal(
  findLatestConversationRuntimeSelection([
    { role: "user", metadata_json: {} },
  ]),
  null,
  "legacy messages without runtime metadata must not overwrite a local draft"
)

const selectionStorage = memorySelectionStorage()
selectionStorage.setItem(
  `ineffable.chat.runtime-selection-draft.${conversationId}`,
  JSON.stringify({
    modelProfileId: "model-from-legacy-draft",
    sandboxEnvironmentId: "",
  })
)
assert.equal(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId)
    .modelProfileId,
  "",
  "unversioned drafts written by the programmatic sandbox fallback bug must not fence canonical recovery"
)
reconcileCanonicalComposerRuntimeSelection(selectionStorage, conversationId, {
  modelProfileId: "model-a",
  sandboxEnvironmentId: "sandbox-a",
})
writeComposerRuntimeSelectionDraft(selectionStorage, conversationId, {
  modelProfileId: "model-b",
  sandboxEnvironmentId: "",
})
const staleCanonicalMayReplaceDraft = reconcileCanonicalComposerRuntimeSelection(
  selectionStorage,
  conversationId,
  {
    modelProfileId: "model-a-after-terminal-resync",
    sandboxEnvironmentId: "sandbox-a",
  }
)
assert.equal(
  staleCanonicalMayReplaceDraft,
  false,
  "terminal canonical resync must not replace a newer unsent draft"
)
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId),
  { modelProfileId: "model-b", sandboxEnvironmentId: "" },
  "refresh must restore the unsent per-conversation draft before canonical cache"
)
assert.equal(
  reconcileCanonicalComposerRuntimeSelection(selectionStorage, conversationId, {
    modelProfileId: "model-b",
    sandboxEnvironmentId: "",
  }),
  true,
  "matching canonical input must clear an accepted queued draft fence"
)
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId),
  { modelProfileId: "model-b", sandboxEnvironmentId: "" },
  "accepted explicit no-sandbox selection becomes the canonical cache"
)
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, null),
  { modelProfileId: "model-b", sandboxEnvironmentId: "" },
  "a new conversation must inherit the most recently accepted selection"
)
writeComposerRuntimeSelectionDraft(selectionStorage, conversationId, {
  modelProfileId: "model-c",
  sandboxEnvironmentId: "sandbox-c",
})
commitAcceptedComposerRuntimeSelection(selectionStorage, conversationId, {
  modelProfileId: "model-c",
  sandboxEnvironmentId: "sandbox-c",
})
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId),
  { modelProfileId: "model-c", sandboxEnvironmentId: "sandbox-c" },
  "a directly accepted run must commit and clear its manual draft"
)
writeComposerRuntimeSelectionDraft(selectionStorage, conversationId, {
  modelProfileId: "model-a-submitted",
  sandboxEnvironmentId: "sandbox-a-submitted",
})
writeComposerRuntimeSelectionDraft(selectionStorage, conversationId, {
  modelProfileId: "model-b-selected-after-submit",
  sandboxEnvironmentId: "sandbox-b-selected-after-submit",
})
commitAcceptedComposerRuntimeSelection(selectionStorage, conversationId, {
  modelProfileId: "model-a-submitted",
  sandboxEnvironmentId: "sandbox-a-submitted",
})
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId),
  {
    modelProfileId: "model-b-selected-after-submit",
    sandboxEnvironmentId: "sandbox-b-selected-after-submit",
  },
  "an older request acknowledgement must not delete a newer manual draft"
)
assert.equal(
  reconcileCanonicalComposerRuntimeSelection(selectionStorage, conversationId, {
    modelProfileId: "model-a-submitted",
    sandboxEnvironmentId: "sandbox-a-submitted",
  }),
  false,
  "the newer draft must continue fencing terminal canonical resync for the older request"
)
writeComposerRuntimeSelectionDraft(selectionStorage, conversationId, {
  modelProfileId: "removed-model",
  sandboxEnvironmentId: "removed-sandbox",
})
clearUnavailableComposerRuntimeSelectionField(
  selectionStorage,
  conversationId,
  "model"
)
clearUnavailableComposerRuntimeSelectionField(
  selectionStorage,
  conversationId,
  "sandbox"
)
assert.deepEqual(
  readCachedComposerRuntimeSelection(selectionStorage, conversationId),
  { modelProfileId: "", sandboxEnvironmentId: "" },
  "removed options must be cleared inside the draft instead of reappearing after refresh"
)

const runningCommand = {
  id: "tool-command",
  name: "exec_command",
  input: JSON.stringify({ command: "npm   run  build\n" }),
  output: "",
  status: "running",
}
assert.equal(getToolCallSummary(runningCommand), "npm run build")
assert.equal(
  getToolCallSummary({
    ...runningCommand,
    status: "succeeded",
    output: JSON.stringify({ exit_code: 0, output: "build complete\nnext line" }),
  }),
  `${i18n.t("chat.agent.exitCode")} 0 · build complete next line`
)
assert.equal(
  getToolCallSummary({
    ...runningCommand,
    status: "failed",
    output: JSON.stringify({ error: "permission denied\nretry with access" }),
  }),
  "permission denied retry with access"
)
const fileRead = {
  id: "tool-read",
  name: "read_file",
  input: JSON.stringify({ path: "src/app.ts" }),
  output: JSON.stringify({ start_line: 1, end_line: 100 }),
  status: "succeeded",
}
assert.match(getToolCallTitle(fileRead), /src\/app\.ts/)
assert.equal(
  getToolCallSummary(fileRead),
  `${i18n.t("chat.agent.lineRange")} 1–100`
)
assert.equal(
  getToolCallPresentation({ ...fileRead, output: "", status: "running" }).summary,
  null,
  "the collapsed row must not repeat a target already present in its title"
)
assert.equal(
  getToolCallSummary({
    id: "tool-unknown",
    name: "unknown_tool",
    input: "plain   streaming input",
    output: "",
    status: "running",
  }),
  "plain streaming input"
)
assert.equal(
  getToolCallSummary({
    id: "tool-search",
    name: "web_search",
    input: JSON.stringify({ query: "latest agent runtime" }),
    output: "",
    status: "running",
  }),
  "latest agent runtime"
)
assert.equal(
  getToolCallSummary({
    id: "tool-terminal-history",
    name: "terminal_read",
    input: JSON.stringify({ session_id: "session-1" }),
    output: JSON.stringify({
      start_line: 1,
      end_line: 77,
      exit_code: null,
      stdout: "first terminal line\nsecond terminal line",
      output_tail: "second terminal line",
    }).repeat(2),
    status: "succeeded",
  }),
  `${i18n.t("chat.agent.lineRange")} 1–77 · first terminal line second terminal line`
)
assert.equal(
  getToolCallSummary({
    id: "tool-incomplete",
    name: "exec_command",
    input: '{"command":"npm run',
    output: "",
    status: "running",
  }),
  null,
  "partial JSON must degrade safely until the canonical arguments are complete"
)
assert.equal(
  getToolCallSummary({
    ...runningCommand,
    status: "failed",
    output: JSON.stringify({ result: "permission denied" }),
  }),
  "permission denied"
)
assert.equal(
  getToolCallSummary({
    ...fileRead,
    status: "cancelled",
    output: JSON.stringify({ error: "cancelled by user" }),
  }),
  "cancelled by user"
)
const repeatedArtifactOutput = JSON.stringify({
  workspace_id: "workspace-1",
  object_id: "object-1",
  version_id: "version-1",
  path: "reports/result.md",
  mime_type: "text/markdown",
  size_bytes: 42,
}).repeat(2)
assert.deepEqual(
  parseLeadingJsonObject(repeatedArtifactOutput),
  JSON.parse(repeatedArtifactOutput.slice(0, repeatedArtifactOutput.length / 2))
)
assert.equal(
  extractWorkspaceArtifact({
    id: "tool-artifact",
    name: "publish_sandbox_file",
    input: "",
    output: repeatedArtifactOutput,
    status: "succeeded",
  })?.artifactId,
  "workspace-1:object-1:version-1"
)

function event(seq, kind, content = null, metadata = {}, scope = "main") {
  return {
    run_id: runId,
    seq,
    ts_ms: seq,
    stream: "chat",
    event: kind,
    scope,
    content,
    metadata: {
      schema_version: 1,
      conversation_id: conversationId,
      conversation_run_id: runId,
      ...metadata,
    },
  }
}

const resumedCanonicalMessages = [
  {
    role: "assistant",
    messageType: "output",
    content: "我会查询三个来源。",
  },
  {
    role: "tool_call",
    messageType: "tool_call",
    content: "",
    metadata: {
      tool_calls: [1, 2, 3].map((index) => ({
        id: `search-${index}`,
        name: "web_search",
        input: { query: `agents ${index}` },
      })),
    },
  },
  ...[1, 2, 3].map((index) => ({
      role: "tool",
      messageType: "tool_result",
      content: `provider ${index} returned 502`,
      metadata: {
        tool_call_id: `search-${index}`,
        tool_name: "web_search",
        settlement_status: "failed",
        success: false,
      },
    })),
  {
    role: "assistant",
    messageType: "output",
    content: "搜索服务暂时不可用。",
  },
]
assert.equal(hasCanonicalAssistantOutput(resumedCanonicalMessages), true)
let resumedEntry
canonicalMessagesToGatewayEvents(resumedCanonicalMessages, {
    stream: "resume",
    phase: "resume",
    defaultRunId: runId,
    conversationId,
    tsMs: 1,
}).forEach((projected) => {
  resumedEntry = projectConversationOutputEvent(resumedEntry, projected, runId)
})
const resumedBlocks = getPaneBlocks(resumedEntry.pane)
assert.equal(resumedBlocks.filter((block) => block.type === "tool").length, 3)
assert.deepEqual(
  Object.values(resumedEntry.pane.tools).map((tool) => tool.status),
  ["failed", "failed", "failed"]
)
assert.deepEqual(
  resumedBlocks
    .filter((block) => block.type === "text")
    .map((block) => block.content),
  ["我会查询三个来源。", "搜索服务暂时不可用。"],
  "tool failures must remain structural tool output instead of assistant Markdown"
)

const reusedCallMessages = [
  {
    role: "tool_call",
    messageType: "tool_call",
    content: "",
    metadata: { tool_call_id: "reused", tool_name: "web_search", full_arguments: "{}" },
  },
  {
    role: "tool",
    messageType: "tool_result",
    content: "first",
    metadata: { tool_call_id: "reused", tool_name: "web_search", settlement_status: "succeeded" },
  },
  {
    role: "tool_call",
    messageType: "tool_call",
    content: "",
    metadata: { tool_call_id: "reused", tool_name: "web_search", full_arguments: "{}" },
  },
  {
    role: "tool",
    messageType: "tool_result",
    content: "second",
    metadata: { tool_call_id: "reused", tool_name: "web_search" },
  },
]
let reusedCallEntry
canonicalMessagesToGatewayEvents(reusedCallMessages, {
  stream: "resume",
  phase: "resume",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
}).forEach((projected) => {
  reusedCallEntry = projectConversationOutputEvent(reusedCallEntry, projected, runId)
})
assert.equal(
  getPaneBlocks(reusedCallEntry.pane).filter((block) => block.type === "tool").length,
  2,
  "cross-batch protocol ID reuse must retain two occurrence-keyed tool cards"
)
assert.deepEqual(
  Object.values(reusedCallEntry.pane.tools).map((tool) => tool.status),
  ["succeeded", "failed"],
  "missing typed settlement must fail closed"
)

const canonicalToolCallWithAssistantParts = canonicalMessagesToGatewayEvents([
  {
    role: "tool_call",
    messageType: "tool_call",
    content: "I found one source.",
    metadata: {
      canonical_message: {
        role: "Assistant",
        content: "I found one source.",
        reasoning_content: "Inspecting the source.",
        tool_calls: [{ id: "search-with-text", name: "web_search", input: { query: "agents" } }],
        extra_fields: {
          scope: "sub",
          subagent_id: "researcher-1",
          web_view: { renderer: "fallback", node_id: "search-view" },
        },
      },
    },
  },
], {
  stream: "resume",
  phase: "resume",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.deepEqual(
  canonicalToolCallWithAssistantParts.map((item) => item.event),
  ["model.reasoning.delta", "assistant.snapshot", "tool.call.completed"],
  "a canonical assistant tool-call message must preserve reasoning, body, and calls"
)
assert.equal(canonicalToolCallWithAssistantParts[1].content, "I found one source.")
assert.equal(canonicalToolCallWithAssistantParts[1].scope, "sub")
assert.equal(canonicalToolCallWithAssistantParts[1].metadata.subagent_id, "researcher-1")
assert.equal(
  canonicalToolCallWithAssistantParts.filter((item) => item.metadata.web_view).length,
  1,
  "one canonical message must project its declared Web node exactly once"
)
assert.equal(
  canonicalToolCallWithAssistantParts.find((item) => item.metadata.web_view)
    .metadata.web_view.node_id,
  "search-view"
)
assert.equal(
  hasCanonicalAssistantOutput([{
    role: "tool_call",
    messageType: "tool_call",
    content: "I found one source.",
  }]),
  true,
  "tool-call assistant body must suppress the legacy response.output fallback"
)

const malformedToolCallEvents = canonicalMessagesToGatewayEvents([{
  role: "tool_call",
  messageType: "tool_call",
  content: "",
  metadata: {},
}], {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.equal(malformedToolCallEvents.length, 1)
assert.equal(malformedToolCallEvents[0].event, "tool.call.completed")
assert.equal(malformedToolCallEvents[0].metadata.settlement_status, "outcome_unknown")
assert.equal(malformedToolCallEvents[0].metadata.success, false)

const productionHistoryReasoning = "The user asked for one question."
const reconciledProductionHistory = canonicalMessagesToGatewayEvents([
  {
    role: "assistant",
    messageType: "output",
    content: `<think>${productionHistoryReasoning}</think>`,
    reasoningContent: productionHistoryReasoning,
    metadata: { tool_call_id: "ask-1", scope: "run::segment:1" },
  },
  {
    role: "assistant",
    messageType: "tool_call",
    content: "",
    metadata: {
      tool_call_id: "ask-1",
      tool_name: "request_user_input",
      full_arguments: "{\"questions\":[]}",
      transcript_occurrence_id: "ask-1#1",
      reasoning_content: productionHistoryReasoning,
      canonical_message: {
        content: "",
        reasoning_content: productionHistoryReasoning,
        tool_calls: [{ id: "ask-1", name: "request_user_input", input: { questions: [] } }],
      },
    },
  },
], {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.equal(
  reconciledProductionHistory.filter((item) => item.event === "model.reasoning.delta").length,
  1,
  "process and canonical views of one model batch must share one reasoning block"
)
assert.equal(
  reconciledProductionHistory.filter((item) => item.event === "tool.call.completed").length,
  1,
  "an occurrence-expanded history call must not expand its canonical batch again"
)
assert.equal(
  reconciledProductionHistory.find((item) => item.event === "tool.call.completed")
    .metadata.transcript_occurrence_id,
  "ask-1",
  "the first persisted occurrence must reuse the live protocol identity"
)
assert.equal(
  reconciledProductionHistory.some((item) => item.content?.startsWith("tool=")),
  false,
  "legacy tool envelopes must never become assistant content"
)

const cachedLegacyEnvelope = canonicalMessagesToGatewayEvents([{
  role: "assistant",
  messageType: "tool_call",
  content: "tool=request_user_input call_id=ask-old\n{\"questions\":[]}",
  metadata: {
    tool_call_id: "ask-old",
    tool_name: "request_user_input",
    transcript_occurrence_id: "ask-old#1",
    canonical_message: {
      content: "",
      tool_calls: [{ id: "ask-old", name: "request_user_input", input: { questions: [] } }],
    },
  },
}], {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.equal(
  cachedLegacyEnvelope.some((item) => item.event === "assistant.snapshot"),
  false,
  "an occurrence-expanded cache row must only trust canonical assistant content"
)

const repeatedProtocolId = canonicalMessagesToGatewayEvents([1, 2].map((occurrence) => ({
  role: "assistant",
  messageType: "tool_call",
  content: "",
  metadata: {
    tool_call_id: "reused-call",
    tool_name: "web_search",
    transcript_occurrence_id: `reused-call#${occurrence}`,
    canonical_message: {
      content: "",
      tool_calls: [{ id: "reused-call", name: "web_search", input: { query: occurrence } }],
    },
  },
})), {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.deepEqual(
  repeatedProtocolId.map((item) => item.metadata.transcript_occurrence_id),
  ["reused-call", "reused-call#2"],
  "only a genuinely repeated protocol id may allocate a second UI identity"
)

const expandedParallelHistory = canonicalMessagesToGatewayEvents(["parallel-1", "parallel-2"].map(
  (callId) => ({
    role: "assistant",
    messageType: "tool_call",
    content: "",
    metadata: {
      tool_call_id: callId,
      tool_name: "web_search",
      transcript_occurrence_id: `${callId}#1`,
      tool_calls: [
        { id: "parallel-1", name: "web_search", input: { query: "one" } },
        { id: "parallel-2", name: "web_search", input: { query: "two" } },
      ],
    },
  })
), {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.deepEqual(
  expandedParallelHistory
    .filter((item) => item.event === "tool.call.completed")
    .map((item) => item.metadata.tool_call_id),
  ["parallel-1", "parallel-2"],
  "occurrence-expanded parallel history must retain exactly two calls"
)

const singleResumeCall = canonicalMessagesToGatewayEvents([{
  role: "assistant",
  messageType: "tool_call",
  content: "",
  metadata: {
    tool_call_id: "resume-ask-1",
    tool_name: "request_user_input",
    tool_calls: [{
      id: "resume-ask-1",
      name: "request_user_input",
      input: { questions: [{ id: "style", question: "How?", options: [] }] },
    }],
  },
}], {
  stream: "resume",
  phase: "resume",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.deepEqual(
  JSON.parse(singleResumeCall[0].metadata.full_arguments),
  { questions: [{ id: "style", question: "How?", options: [] }] },
  "a single resume call with a direct ID must retain tool_calls[0].input"
)

const identityReasoningMessages = [
  {
    role: "assistant",
    messageType: "output",
    content: "",
    reasoningContent: "same",
    metadata: { tool_call_id: "identity-1", subagent_id: "child-1" },
  },
  {
    role: "assistant",
    messageType: "output",
    content: "",
    reasoningContent: "same",
    metadata: { tool_call_id: "identity-1" },
  },
  {
    role: "assistant",
    messageType: "tool_call",
    content: "",
    reasoningContent: "same\n",
    metadata: {
      tool_call_id: "identity-1",
      tool_name: "web_search",
      transcript_occurrence_id: "identity-1#1",
      full_arguments: "{}",
    },
  },
]
const identityReasoningEvents = canonicalMessagesToGatewayEvents(
  identityReasoningMessages,
  {
    stream: "history",
    phase: "history",
    defaultRunId: runId,
    conversationId,
    tsMs: 1,
  }
).filter((item) => item.event === "model.reasoning.delta")
assert.equal(
  identityReasoningEvents.length,
  2,
  "main and subagent reasoning identities must remain independent while one batch reconciles"
)
assert.deepEqual(
  identityReasoningEvents.map((item) => item.metadata.subagent_id ?? "main"),
  ["child-1", "main"]
)

const repeatedUnidentifiedReasoning = canonicalMessagesToGatewayEvents([1, 2].map(() => ({
  role: "assistant",
  messageType: "output",
  content: "",
  reasoningContent: "legitimately repeated",
  metadata: {},
})), {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.equal(
  repeatedUnidentifiedReasoning.filter((item) => item.event === "model.reasoning.delta").length,
  2,
  "reasoning without a shared canonical identity must never be deduplicated by text"
)

const reusedReasoningCallId = canonicalMessagesToGatewayEvents([
  {
    role: "assistant", messageType: "output", content: "",
    reasoningContent: "same", metadata: { tool_call_id: "reuse-reasoning" },
  },
  {
    role: "tool", messageType: "tool_result", content: "first",
    metadata: { tool_call_id: "reuse-reasoning", settlement_status: "succeeded" },
  },
  {
    role: "assistant", messageType: "output", content: "",
    reasoningContent: "same", metadata: { tool_call_id: "reuse-reasoning" },
  },
], {
  stream: "history",
  phase: "history",
  defaultRunId: runId,
  conversationId,
  tsMs: 1,
})
assert.equal(
  reusedReasoningCallId.filter((item) => item.event === "model.reasoning.delta").length,
  2,
  "a settled protocol call ID may be reused by a later reasoning batch"
)

const userInputQuestions = [
  {
    id: "topic",
    header: "Topic",
    question: "Which task?",
    options: [{ label: "Code", description: "Implement a change." }],
  },
]
const userInputNeed = {
  kind: "user_input",
  need_id: "tool-user-input",
  questions: userInputQuestions,
}
const userInputCall = event(90, "tool.call.completed", null, {
  tool_call_id: "tool-user-input",
  tool_name: "request_user_input",
  full_arguments: JSON.stringify({ questions: userInputQuestions }),
})
const userInputResult = event(
  91,
  "tool.result",
  JSON.stringify({ status: "waiting", blocking_need: userInputNeed }),
  {
    tool_call_id: "tool-user-input",
    tool_name: "request_user_input",
  }
)
const canonicalUserInputCall = event(92, "tool.call.completed", null, {
  tool_call_id: "tool-user-input",
  tool_name: "request_user_input",
  full_arguments: JSON.stringify({ questions: userInputQuestions }),
  event_provenance: "canonical_transcript_finalizer",
})
const canonicalUserInputResult = event(
  93,
  "tool.result",
  JSON.stringify({ status: "waiting", blocking_need: userInputNeed }),
  {
    tool_call_id: "tool-user-input",
    tool_name: "request_user_input",
    event_provenance: "canonical_transcript_finalizer",
  }
)
const awaitingUserInput = event(94, "run.awaiting_human", null, {
  pending_need: userInputNeed,
  run_state: "awaiting_human",
})

let userInputEntry = projectConversationOutputEvent(undefined, userInputCall, runId)
const userInputBlockId = userInputEntry.pane.blockOrder[0]
for (const userInputEvent of [
  userInputResult,
  canonicalUserInputCall,
  canonicalUserInputResult,
  awaitingUserInput,
]) {
  const need = userInputNeedFromEvent(userInputEvent)
  userInputEntry = need
    ? projectConversationUserInputNeed(userInputEntry, userInputEvent, need)
    : projectConversationOutputEvent(userInputEntry, userInputEvent, runId)
}
assert.equal(userInputEntry.pane.blockOrder.length, 1)
assert.equal(userInputEntry.pane.blockOrder[0], userInputBlockId)
assert.equal(userInputEntry.pane.tools["tool-user-input"].status, "waiting")

const restoredUserInputEntries = reconcilePendingUserInput(
  mapConversationMessagesToEntries([
    {
      id: "user-input-call-history",
      conversation_id: conversationId,
      run_id: runId,
      role: "assistant",
      message_type: "tool_call",
      content: "",
      metadata_json: userInputCall.metadata,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    {
      id: "user-input-result-history",
      conversation_id: conversationId,
      run_id: runId,
      role: "tool",
      message_type: "tool_result",
      content: userInputResult.content,
      metadata_json: userInputResult.metadata,
      created_at: "2026-08-30T00:00:01Z",
      updated_at: "2026-08-30T00:00:01Z",
    },
  ]),
  {
    needId: "tool-user-input",
    questions: userInputQuestions,
    runId,
    sessionKey: null,
  }
)
assert.equal(restoredUserInputEntries.length, 1)
assert.equal(restoredUserInputEntries[0].role, "assistant")
assert.equal(
  restoredUserInputEntries[0].pane.tools["tool-user-input"].status,
  "waiting",
  "the authoritative current-run need must restore interactivity after refresh"
)

const previousRunEntry = {
  ...restoredUserInputEntries[0],
  id: "assistant-previous-run",
  runId: "run-previous",
  pane: {
    ...restoredUserInputEntries[0].pane,
    tools: {
      ...restoredUserInputEntries[0].pane.tools,
      "tool-user-input": {
        ...restoredUserInputEntries[0].pane.tools["tool-user-input"],
        runId: "run-previous",
        status: "succeeded",
        answer: "previous answer",
      },
    },
  },
}
const sameNeedIdAcrossRuns = reconcilePendingUserInput([previousRunEntry], {
  needId: "tool-user-input",
  questions: userInputQuestions,
  runId,
  sessionKey: null,
})
assert.equal(sameNeedIdAcrossRuns.length, 2)
assert.equal(
  sameNeedIdAcrossRuns[0].pane.tools["tool-user-input"].status,
  "succeeded",
  "a current pending need must not reactivate an older run with the same need id"
)
assert.equal(
  sameNeedIdAcrossRuns[1].pane.tools["tool-user-input"].runId,
  runId,
  "pending need identity is the run id and need id pair"
)

let reusedProtocolIdEntry
for (const repeatedToolEvent of [
  event(95, "tool.call.completed", null, {
    tool_call_id: "reused-call-id",
    transcript_occurrence_id: "reused-call-id#1",
    tool_name: "exec_command",
    full_arguments: "first",
  }),
  event(96, "tool.result", "first-result", {
    tool_call_id: "reused-call-id",
    transcript_occurrence_id: "reused-call-id#1",
    tool_name: "exec_command",
    status: "succeeded",
  }),
  event(97, "tool.call.completed", null, {
    tool_call_id: "reused-call-id",
    transcript_occurrence_id: "reused-call-id#2",
    tool_name: "exec_command",
    full_arguments: "second",
  }),
  event(98, "tool.result", "second-result", {
    tool_call_id: "reused-call-id",
    transcript_occurrence_id: "reused-call-id#2",
    tool_name: "exec_command",
    status: "succeeded",
  }),
]) {
  reusedProtocolIdEntry = projectConversationOutputEvent(
    reusedProtocolIdEntry,
    repeatedToolEvent,
    runId
  )
}
assert.deepEqual(reusedProtocolIdEntry.pane.blockOrder.length, 2)
assert.equal(reusedProtocolIdEntry.pane.tools["reused-call-id#1"].output, "first-result")
assert.equal(reusedProtocolIdEntry.pane.tools["reused-call-id#2"].output, "second-result")
assert.equal(
  reusedProtocolIdEntry.pane.tools["reused-call-id#2"].protocolId,
  "reused-call-id"
)

const duplicateTerminalPayload = JSON.stringify({
  session_id: "session-history",
  status: "exited",
  start_line: 1,
  end_line: 2,
  exit_code: 0,
  stdout: "done",
})
const liveTerminalCall = event(101, "tool.call.completed", null, {
  tool_call_id: "tool-terminal-replay",
  tool_name: "terminal_read",
  full_arguments: JSON.stringify({ session_id: "session-history" }),
})
const liveTerminalResult = event(
  102,
  "tool.result",
  duplicateTerminalPayload.repeat(2),
  {
    tool_call_id: "tool-terminal-replay",
    tool_name: "terminal_read",
    status: "succeeded",
  }
)
const runningTerminalEntry = projectConversationOutputEvent(
  undefined,
  liveTerminalCall,
  runId
)
const liveTerminalBlockId = runningTerminalEntry.pane.blockOrder[0]
const liveTerminalEntry = projectConversationOutputEvent(
  runningTerminalEntry,
  liveTerminalResult,
  runId
)
assert.equal(
  liveTerminalEntry.pane.blockOrder[0],
  liveTerminalBlockId,
  "tool settlement must update the original canonical tool block"
)
const terminalHistoryEntries = mapConversationMessagesToEntries([
  {
    id: "terminal-call-history",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "tool_call",
    content: JSON.stringify({ session_id: "session-history" }),
    metadata_json: {
      scope: "main",
      tool_call_id: "tool-terminal-replay",
      tool_name: "terminal_read",
      full_arguments: JSON.stringify({ session_id: "session-history" }),
    },
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
  {
    id: "terminal-result-history",
    conversation_id: conversationId,
    run_id: runId,
    role: "tool",
    message_type: "tool_result",
    content: duplicateTerminalPayload.repeat(2),
    metadata_json: {
      scope: "main",
      tool_call_id: "tool-terminal-replay",
      tool_name: "terminal_read",
      status: "succeeded",
    },
    created_at: "2026-08-22T00:00:01Z",
    updated_at: "2026-08-22T00:00:01Z",
  },
])
assert.equal(terminalHistoryEntries.length, 1)
assert.equal(terminalHistoryEntries[0].role, "assistant")
const liveTerminalTool = liveTerminalEntry.pane.tools["tool-terminal-replay"]
const historyTerminalTool =
  terminalHistoryEntries[0].role === "assistant"
    ? terminalHistoryEntries[0].pane.tools["tool-terminal-replay"]
    : null
assert.ok(liveTerminalTool && historyTerminalTool)
assert.equal(
  getToolCallSummary(historyTerminalTool),
  getToolCallSummary(liveTerminalTool),
  "history replay and live projection must derive the same terminal summary"
)

const canonicalWatermarkEntries = mapConversationMessagesToEntries([
  {
    id: "canonical-final-output",
    conversation_id: conversationId,
    run_id: "terminal-watermark-run",
    definition_fingerprint: "sha256:candidate-v1",
    agent_id: "default",
    model_profile_id: "glm-5.3",
    sandbox_environment_id: "sandbox-alpha",
    run_started_at: "2026-08-22T00:00:00Z",
    run_completed_at: "2026-08-22T00:00:02.250Z",
    run_duration_ms: 2250,
    role: "assistant",
    message_type: "output",
    content: "final body",
    metadata_json: {},
    timeline_seq: 82,
    timeline_unit_id: "run:terminal-watermark-run:anchor:82",
    canonical_seq: 83,
    created_at: "2026-08-22T00:00:02Z",
    updated_at: "2026-08-22T00:00:02Z",
  },
])
assert.equal(canonicalWatermarkEntries.length, 1)
assert.equal(canonicalWatermarkEntries[0].role, "assistant")
assert.equal(
  canonicalWatermarkEntries[0].canonicalMessageSeqEnd,
  83,
  "history projection must retain canonical message identity for terminal handoff"
)
assert.equal(canonicalWatermarkEntries[0].timelineSeq, 82)
assert.equal(
  canonicalWatermarkEntries[0].definitionFingerprint,
  "sha256:candidate-v1",
  "history projection must retain the exact Definition that produced the answer"
)
assert.equal(canonicalWatermarkEntries[0].agentId, "default")
assert.equal(canonicalWatermarkEntries[0].modelProfileId, "glm-5.3")
assert.equal(
  canonicalWatermarkEntries[0].sandboxEnvironmentId,
  "sandbox-alpha"
)
assert.equal(canonicalWatermarkEntries[0].runStartedAt, "2026-08-22T00:00:00Z")
assert.equal(
  canonicalWatermarkEntries[0].runCompletedAt,
  "2026-08-22T00:00:02.250Z"
)
assert.equal(canonicalWatermarkEntries[0].runDurationMs, 2250)
assert.equal(
  canonicalWatermarkEntries[0].id,
  "run:terminal-watermark-run:anchor:82",
  "history must retain the server-owned timeline unit identity"
)

const legacyAnswer = {
  ...createAssistantEntry("done", "legacy-answer-run"),
  id: "legacy-answer",
  pane: {
    ...createAssistantEntry("done").pane,
    blockOrder: ["legacy-answer-text"],
    blocks: {
      "legacy-answer-text": {
        id: "legacy-answer-text",
        type: "text",
        content: "legacy body",
      },
    },
  },
}
const answerListProps = {
  entries: [legacyAnswer, canonicalWatermarkEntries[0]],
  modelDisplayNames: { "glm-5.3": "GLM 5.3" },
  sandboxDisplayNames: { "sandbox-alpha": "开发 Sandbox" },
  hasOlderEntries: false,
  isLoadingOlderEntries: false,
  olderEntriesError: null,
  isAwaitingResponse: false,
  isLoadingInitial: false,
  showScrollToBottom: false,
  scrollViewportRef: { current: null },
  onViewportScroll() {},
  onLoadOlderConversationMessagesPage() {},
  onScrollToBottomClick() {},
  onStreamingContentProgress() {},
  onApproveApproval() {},
  onRejectApproval() {},
  activeHumanRunId: null,
  async onSubmitUserInput() {},
  isFullScreen: false,
  trialVerdict: {
    entryId: canonicalWatermarkEntries[0].id,
    busyAction: null,
    canAccept: true,
    canRollback: true,
    onAccept() {},
    onRollback() {},
  },
}
let answerFooterTree
await act(async () => {
  answerFooterTree = TestRenderer.create(
    React.createElement(ChatMessageList, answerListProps)
  )
})
assert.equal(
  answerFooterTree.root.findAll(
    (node) => node.props["data-assistant-answer-footer"] !== undefined
  ).length,
  2,
  "each completed text answer must render exactly one footer"
)
assert.equal(
  answerFooterTree.root.findAll(
    (node) => node.props["data-answer-run-metadata"] !== undefined
  ).length,
  1,
  "legacy answers must hide unavailable provenance without losing copy"
)
assert.equal(
  answerFooterTree.root.findAll(
    (node) =>
      node.type === "button" && node.props["aria-label"] === "复制这条回答"
  ).length,
  2
)
assert.equal(
  answerFooterTree.root.findAll(
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "保留生成这条回答的 Agent 版本"
  ).length,
  1,
  "only the eligible trial answer gets an accept action"
)
assert.equal(
  answerFooterTree.root.findAll(
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "恢复到生成这条回答之前的 Agent 版本"
  ).length,
  1,
  "only the eligible trial answer gets a rollback action"
)
assert.match(JSON.stringify(answerFooterTree.toJSON()), /GLM 5\.3/)
assert.match(JSON.stringify(answerFooterTree.toJSON()), /开发 Sandbox/)
await act(async () => {
  answerFooterTree.update(
    React.createElement(ChatMessageList, {
      ...answerListProps,
      modelDisplayNames: {},
      sandboxDisplayNames: {},
    })
  )
})
assert.match(
  JSON.stringify(answerFooterTree.toJSON()),
  /glm-5\.3/,
  "unknown or archived profiles must fall back to the persisted model id"
)
assert.match(
  JSON.stringify(answerFooterTree.toJSON()),
  /sandbox-alpha/,
  "unknown or archived sandboxes must fall back to the persisted environment id"
)
await act(async () => answerFooterTree.unmount())

const trialProjection = {
  trial_binding: {
    mode: "trial",
    active_fingerprint: "sha256:candidate-v1",
    updated_at: "2026-08-22T00:00:05Z",
  },
}
const oldCandidateAnswer = {
  ...createAssistantEntry("done", "old-candidate-run"),
  id: "old-candidate-answer",
  definitionFingerprint: "sha256:candidate-v1",
  createdAt: "2026-08-22T00:00:04Z",
  pane: {
    ...createAssistantEntry("done").pane,
    blockOrder: ["old-answer"],
    blocks: {
      "old-answer": { id: "old-answer", type: "text", content: "old answer" },
    },
  },
}
assert.equal(
  findEligibleTrialAnswer([oldCandidateAnswer], trialProjection),
  null,
  "restarting the same candidate trial must not make an earlier generation eligible"
)
const currentCandidateAnswer = {
  ...oldCandidateAnswer,
  id: "current-candidate-answer",
  createdAt: "2026-08-22T00:00:06Z",
}
assert.equal(
  findEligibleTrialAnswer(
    [oldCandidateAnswer, currentCandidateAnswer],
    trialProjection
  )?.id,
  "current-candidate-answer",
  "only an answer produced after the current trial boundary is eligible"
)

const sameRunMultipleUnits = mapConversationMessagesToEntries([
  {
    id: "same-run-output-one",
    conversation_id: conversationId,
    run_id: "same-run-multiple-units",
    role: "assistant",
    message_type: "output",
    content: "first unit",
    metadata_json: {},
    timeline_seq: 90,
    timeline_unit_id: "run:same-run-multiple-units:anchor:90",
    canonical_seq: 91,
    created_at: "2026-08-22T00:00:03Z",
    updated_at: "2026-08-22T00:00:03Z",
  },
  {
    id: "same-run-output-two",
    conversation_id: conversationId,
    run_id: "same-run-multiple-units",
    role: "assistant",
    message_type: "output",
    content: "second unit",
    metadata_json: {},
    timeline_seq: 92,
    timeline_unit_id: "run:same-run-multiple-units:anchor:92",
    canonical_seq: 93,
    created_at: "2026-08-22T00:00:04Z",
    updated_at: "2026-08-22T00:00:04Z",
  },
])
assert.deepEqual(
  sameRunMultipleUnits.map((entry) => entry.id),
  [
    "run:same-run-multiple-units:anchor:90",
    "run:same-run-multiple-units:anchor:92",
  ],
  "same-run history must preserve distinct server-owned timeline units"
)

const terminalBodyAfterCumulativeSnapshots = mapConversationMessagesToEntries([
  {
    id: "cumulative-tool-call-one",
    conversation_id: conversationId,
    run_id: "terminal-body-after-cumulative-snapshots",
    role: "assistant",
    message_type: "tool_call",
    content: "",
    metadata_json: {
      scope: "main",
      tool_call_id: "cumulative-call-one",
      tool_name: "read_file",
      full_arguments: "{}",
      canonical_message_seq: 100,
      canonical_message: {
        content: "先检查文件。",
        tool_calls: [
          { id: "cumulative-call-one", name: "read_file", input: {} },
        ],
      },
    },
    timeline_seq: 100,
    timeline_unit_id: "run:terminal-body-after-cumulative-snapshots:anchor:100",
    canonical_seq: 100,
    created_at: "2026-08-22T00:00:05Z",
    updated_at: "2026-08-22T00:00:05Z",
  },
  {
    id: "cumulative-tool-result-one",
    conversation_id: conversationId,
    run_id: "terminal-body-after-cumulative-snapshots",
    role: "tool",
    message_type: "tool_result",
    content: "ok",
    metadata_json: {
      scope: "main",
      tool_call_id: "cumulative-call-one",
      tool_name: "read_file",
      status: "succeeded",
    },
    timeline_seq: 100,
    timeline_unit_id: "run:terminal-body-after-cumulative-snapshots:anchor:100",
    canonical_seq: 101,
    created_at: "2026-08-22T00:00:06Z",
    updated_at: "2026-08-22T00:00:06Z",
  },
  {
    id: "cumulative-tool-call-two",
    conversation_id: conversationId,
    run_id: "terminal-body-after-cumulative-snapshots",
    role: "assistant",
    message_type: "tool_call",
    content: "",
    metadata_json: {
      scope: "main",
      tool_call_id: "cumulative-call-two",
      tool_name: "read_file",
      full_arguments: "{}",
      canonical_message_seq: 102,
      canonical_message: {
        content: "先检查文件。\n继续检查。",
        tool_calls: [
          { id: "cumulative-call-two", name: "read_file", input: {} },
        ],
      },
    },
    timeline_seq: 100,
    timeline_unit_id: "run:terminal-body-after-cumulative-snapshots:anchor:100",
    canonical_seq: 102,
    created_at: "2026-08-22T00:00:07Z",
    updated_at: "2026-08-22T00:00:07Z",
  },
  {
    id: "canonical-terminal-output",
    conversation_id: conversationId,
    run_id: "terminal-body-after-cumulative-snapshots",
    role: "assistant",
    message_type: "output",
    content: "这是必须在 agent loop 结束后继续显示的最终正文。",
    metadata_json: {
      scope: "main::segment:1",
      canonical_message_seq: 103,
      reasoning_content: "准备最终回答。",
    },
    timeline_seq: 100,
    timeline_unit_id: "run:terminal-body-after-cumulative-snapshots:anchor:100",
    canonical_seq: 103,
    created_at: "2026-08-22T00:00:08Z",
    updated_at: "2026-08-22T00:00:08Z",
  },
])
assert.equal(terminalBodyAfterCumulativeSnapshots.length, 1)
assert.equal(terminalBodyAfterCumulativeSnapshots[0].role, "assistant")
assert.ok(
  terminalBodyAfterCumulativeSnapshots[0].pane.blockOrder.some((blockId) => {
    const block = terminalBodyAfterCumulativeSnapshots[0].pane.blocks[blockId]
    return block?.type === "text" && block.content.includes("最终正文")
  }),
  "canonical terminal output must survive earlier cumulative snapshot deltas"
)

let toolWebNodeTree
await act(() => {
  toolWebNodeTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: runningTerminalEntry.pane,
      isStreaming: true,
    })
  )
})
let renderedToolButtons = toolWebNodeTree.root.findAll(
  (node) => node.props["data-tool-call-id"] === "tool-terminal-replay"
)
assert.equal(renderedToolButtons.length, 1)
assert.equal(renderedToolButtons[0].props["data-tool-status"], "running")
await act(() => {
  toolWebNodeTree.update(
    React.createElement(WebNodeList, {
      pane: liveTerminalEntry.pane,
      isStreaming: false,
    })
  )
})
renderedToolButtons = toolWebNodeTree.root.findAll(
  (node) => node.props["data-tool-call-id"] === "tool-terminal-replay"
)
assert.equal(renderedToolButtons.length, 1)
assert.equal(renderedToolButtons[0].props["data-tool-status"], "succeeded")
const liveSummaryNodes = toolWebNodeTree.root.findAll(
  (node) => node.props["data-tool-summary"] === true
)
assert.equal(liveSummaryNodes.length, 1)
assert.equal(
  liveSummaryNodes[0].children.join(""),
  getToolCallSummary(liveTerminalTool),
  "the production Tool WebNode must update its collapsed summary in place"
)
await act(() => renderedToolButtons[0].props.onClick({ defaultPrevented: false }))
const expandedTerminalTree = JSON.stringify(toolWebNodeTree.toJSON())
assert.match(expandedTerminalTree, new RegExp(i18n.t("chat.agent.session")))
assert.match(expandedTerminalTree, new RegExp(i18n.t("chat.agent.exitCode")))
await act(() => toolWebNodeTree.unmount())

let historyToolWebNodeTree
await act(() => {
  historyToolWebNodeTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: terminalHistoryEntries[0].pane,
      isStreaming: false,
    })
  )
})
const historyToolButton = historyToolWebNodeTree.root.findAll(
  (node) => node.props["data-tool-call-id"] === "tool-terminal-replay"
)
assert.equal(historyToolButton.length, 1)
assert.equal(historyToolButton[0].props["data-tool-status"], "succeeded")
const historySummaryNodes = historyToolWebNodeTree.root.findAll(
  (node) => node.props["data-tool-summary"] === true
)
assert.equal(historySummaryNodes.length, 1)
assert.equal(
  historySummaryNodes[0].children.join(""),
  getToolCallSummary(historyTerminalTool),
  "history refresh must render the same Tool WebNode identity and summary"
)
await act(() => historyToolWebNodeTree.unmount())

const previewCall = event(103, "tool.call.completed", null, {
  tool_call_id: "tool-preview-replay",
  tool_name: "expose_sandbox_port",
  full_arguments: JSON.stringify({ port: 4173 }),
})
const repeatedPreviewPayload = JSON.stringify({
  exposure_id: "exposure-history",
  preview_url: "https://preview.example.test",
  label: "Agent Preview",
  port: 4173,
  status: "active",
}).repeat(2)
const previewResult = event(104, "tool.result", repeatedPreviewPayload, {
  tool_call_id: "tool-preview-replay",
  tool_name: "expose_sandbox_port",
  status: "succeeded",
})
const previewEntry = projectConversationOutputEvent(
  projectConversationOutputEvent(undefined, previewCall, runId),
  previewResult,
  runId
)
let previewWebNodeTree
await act(() => {
  previewWebNodeTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: previewEntry.pane,
      isStreaming: false,
    })
  )
})
assert.match(
  JSON.stringify(previewWebNodeTree.toJSON()),
  /Agent Preview/,
  "concatenated JSON must still select the production sandbox preview renderer"
)
await act(() => previewWebNodeTree.unmount())

const longText = `${"A long streaming paragraph with stable markdown.\n\n".repeat(2600)}Done.`
const events = [
  event(1, "run.started"),
  event(2, "model.reasoning.delta", "Inspecting the request."),
  event(3, "model.text.delta", longText.slice(0, 60_000)),
  event(4, "model.text.delta", longText.slice(60_000)),
  event(5, "tool.call.started", null, { tool_call_id: "tool-a", tool_name: "exec_command" }),
  event(6, "tool.call.started", null, { tool_call_id: "tool-b", tool_name: "web_search" }),
  event(7, "tool.result", "command failed", {
    tool_call_id: "tool-a",
    tool_name: "exec_command",
    status: "failed",
  }),
  event(8, "tool.result", "search succeeded", {
    tool_call_id: "tool-b",
    tool_name: "web_search",
    status: "succeeded",
  }),
  event(9, "model.reasoning.delta", "Delegating a bounded check.", {
    subagent_id: "sub-1",
    subagent_name: "Verifier",
  }, "sub"),
  event(10, "model.text.delta", "Subagent result.", {
    subagent_id: "sub-1",
    subagent_name: "Verifier",
  }, "sub"),
  event(11, "subagent.completed", null, {
    subagent_id: "sub-1",
    subagent_name: "Verifier",
  }, "sub"),
  event(12, "tool.call.started", null, {
    tool_call_id: "approval-1",
    tool_name: "request_user_input",
  }),
  event(13, "tool.result", "Approval required", {
    tool_call_id: "approval-1",
    tool_name: "request_user_input",
    status: "waiting",
  }),
  event(14, "run.awaiting_human"),
  event(15, "run.resumed"),
  event(16, "model.text.delta", "\n\nFinal summary."),
  event(17, "model.text.delta", "Plugin explanation.", {
    web_view: {
      schemaVersion: 1,
      pluginId: "ineffable.web.frontend",
      renderer: "notice",
      nodeId: "notice-terminal",
      status: "settled",
      payload: { title: "Plugin result" },
      fallback: { title: "Plugin result" },
    },
  }),
  event(18, "run.completed"),
]

const encoder = new TextEncoder()
const wire = events
  .map((item) => `data: ${JSON.stringify({ type: "event", event: item })}\n\n`)
  .join("")
const byteChunks = []
for (let offset = 0; offset < wire.length; offset += 137) {
  byteChunks.push(encoder.encode(wire.slice(offset, offset + 137)))
}
const response = new Response(
  new ReadableStream({
    start(controller) {
      for (const chunk of byteChunks) controller.enqueue(chunk)
      controller.close()
    },
  })
)
const parsed = []
await parseSseStream(response, normalizeGatewayEnvelope, (envelope) => {
  if (envelope.type === "event") parsed.push(envelope.event)
})
assert.deepEqual(parsed, events, "arbitrarily chunked SSE must preserve canonical events")

function project(inputEvents) {
  let entry
  let runtime = createConversationRunRuntime(conversationId)
  for (const item of inputEvents) {
    runtime = reduceConversationRunRuntime(runtime, { type: "event", event: item })
    if (
      item.event.startsWith("model.") ||
      item.event.startsWith("tool.") ||
      item.event.startsWith("subagent.")
    ) {
      entry = projectConversationOutputEvent(entry, item, runId)
    }
  }
  assert.ok(entry)
  return {
    runtime,
    entry: {
      ...entry,
      pane: finalizePane(entry.pane),
    },
  }
}

const live = project(parsed)
const replay = project(events)
function semanticPane(pane) {
  return {
    blocks: getPaneBlocks(pane).map((block) => {
      if (block.type === "tool") return { type: block.type, toolId: block.toolId }
      if (block.type === "plugin") return { type: block.type, node: block.node }
      return { type: block.type, content: block.content, ...(block.type === "think" ? { open: block.open } : {}) }
    }),
    tools: pane.tools,
  }
}
assert.equal(live.runtime.lifecycle, "completed")
assert.equal(live.runtime.terminalEventSeen, true)
assert.equal(live.runtime.lastSeq, 18)
assert.deepEqual(semanticPane(live.entry.pane), semanticPane(replay.entry.pane))
assert.equal(live.entry.subagentOrder.length, 1)
assert.equal(live.entry.subagents["sub-1"].status, "done")
assert.equal(live.entry.pane.tools["tool-a"].status, "failed")
assert.equal(live.entry.pane.tools["tool-b"].status, "succeeded")
assert.equal(live.entry.pane.tools["approval-1"].status, "waiting")
assert.ok(
  getPaneBlocks(live.entry.pane).some(
    (block) => block.type === "text" && block.content.includes("Final summary.")
  )
)
assert.ok(
  getPaneBlocks(live.entry.pane).some(
    (block) => block.type === "text" && block.content.includes("Plugin explanation.")
  ),
  "declarative view must not swallow content from the same event"
)
assert.ok(
  getPaneBlocks(live.entry.pane).some(
    (block) => block.type === "plugin" && block.node.nodeId === "notice-terminal"
  )
)

const historyEntries = mapConversationMessagesToEntries([
  {
    id: "message-plugin",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "output",
    content: "Plugin explanation.",
    content_json: null,
    metadata_json: events[16].metadata,
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
])
assert.equal(historyEntries.length, 1)
const historyAssistant = historyEntries[0]
assert.equal(historyAssistant.role, "assistant")
assert.ok(
  historyAssistant.role === "assistant" &&
    getPaneBlocks(historyAssistant.pane).some(
      (block) => block.type === "plugin" && block.node.nodeId === "notice-terminal"
    ),
  "canonical history must rebuild the declared Plugin node"
)
const isolatedLivePlugin = projectConversationOutputEvent(
  undefined,
  events[16],
  runId
)
assert.ok(historyAssistant.role === "assistant")
assert.deepEqual(
  semanticPane(finalizePane(isolatedLivePlugin.pane)),
  semanticPane(historyAssistant.pane),
  "live Plugin projection and canonical terminal history must reconcile"
)

const cumulativePluginNode = events[16].metadata.web_view
let cumulativeLive = projectConversationOutputEvent(
  undefined,
  event(30, "model.text.delta", "A", { web_view: cumulativePluginNode }),
  runId
)
cumulativeLive = projectConversationOutputEvent(
  cumulativeLive,
  event(31, "model.text.delta", "B"),
  runId
)
const cumulativeHistory = mapConversationMessagesToEntries([
  {
    id: "plugin-snapshot",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "output",
    content: "A",
    metadata_json: { web_view: cumulativePluginNode },
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
  {
    id: "terminal-snapshot",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "output",
    content: "AB",
    metadata_json: {},
    created_at: "2026-08-22T00:00:01Z",
    updated_at: "2026-08-22T00:00:01Z",
  },
])
assert.equal(cumulativeHistory.length, 1)
assert.ok(cumulativeHistory[0].role === "assistant")
assert.deepEqual(
  semanticPane(finalizePane(cumulativeLive.pane)),
  semanticPane(cumulativeHistory[0].pane),
  "cumulative terminal snapshot must append only the suffix around a Plugin node"
)

const partialMarkdownTable = [
  "| # | Node | Stage |",
  "| --- | --- | --- |",
  "| 1 | input_recorder | before_model |",
].join("\n")
const refreshedEntries = mapConversationMessagesToEntries([
  {
    id: "partial-markdown-snapshot",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "output",
    content: partialMarkdownTable,
    metadata_json: {},
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
])
const refreshedAssistantId = findAssistantEntryIdForRun(refreshedEntries, runId)
assert.equal(refreshedAssistantId, "partial-markdown-snapshot")
const refreshedAssistant = refreshedEntries.find(
  (entry) => entry.role === "assistant" && entry.id === refreshedAssistantId
)
assert.ok(refreshedAssistant?.role === "assistant")
const continuedAssistant = projectConversationOutputEvent(
  refreshedAssistant,
  event(32, "model.text.delta", "\n| 2 | compact | before_model |"),
  runId
)
const continuedTextBlock = getPaneBlocks(continuedAssistant.pane).find(
  (block) => block.type === "text"
)
assert.equal(
  continuedTextBlock?.content,
  `${partialMarkdownTable}\n| 2 | compact | before_model |`,
  "refresh resume must append SSE Markdown to the persisted entry for the same run"
)
let refreshedMarkdownTree
await act(() => {
  refreshedMarkdownTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: continuedAssistant.pane,
      isStreaming: true,
    })
  )
})
const refreshedMarkdownJson = JSON.stringify(refreshedMarkdownTree.toJSON())
assert.match(refreshedMarkdownJson, /<table>/)
assert.match(refreshedMarkdownJson, /compact/)
await act(() => refreshedMarkdownTree.unmount())

const lazyImagePane = {
  blockOrder: ["lazy-image"],
  blocks: {
    "lazy-image": {
      id: "lazy-image",
      type: "text",
      content: "![preview](https://example.com/preview.png)",
    },
  },
  tools: {},
  activeThinkBlockId: null,
  activeTextBlockId: null,
  pendingTagBuffer: "",
  receivedTextDelta: false,
}
let lazyImageTree
await act(() => {
  lazyImageTree = TestRenderer.create(
    React.createElement(WebNodeList, { pane: lazyImagePane })
  )
})
const lazyImageJson = JSON.stringify(lazyImageTree.toJSON())
assert.match(lazyImageJson, /loading=\\"lazy\\"/)
assert.match(lazyImageJson, /decoding=\\"async\\"/)
await act(() => lazyImageTree.unmount())

const oversizedTailMarker = "OVERSIZED_MARKDOWN_TAIL_MUST_STAY_DEFERRED"
const oversizedMarkdownPane = {
  ...lazyImagePane,
  blockOrder: ["oversized-markdown"],
  blocks: {
    "oversized-markdown": {
      id: "oversized-markdown",
      type: "text",
      content: `${"# bounded preview\n".repeat(20_000)}${oversizedTailMarker}`,
    },
  },
}
let oversizedMarkdownTree
await act(() => {
  oversizedMarkdownTree = TestRenderer.create(
    React.createElement(WebNodeList, { pane: oversizedMarkdownPane })
  )
})
assert.equal(
  oversizedMarkdownTree.root.findAll(
    (node) => node.props["data-oversized-markdown"] !== undefined
  ).length,
  1,
  "a single oversized visible Web Node must use the bounded preview"
)
assert.doesNotMatch(
  JSON.stringify(oversizedMarkdownTree.toJSON()),
  new RegExp(oversizedTailMarker),
  "the collapsed oversized node must not parse or materialize its full tail"
)
await act(() => oversizedMarkdownTree.unmount())
let oversizedStreamingTree
await act(() => {
  oversizedStreamingTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: oversizedMarkdownPane,
      isStreaming: true,
    })
  )
})
assert.match(
  JSON.stringify(oversizedStreamingTree.toJSON()),
  new RegExp(oversizedTailMarker),
  "an oversized streaming node must retain a bounded live tail"
)
await act(() => oversizedStreamingTree.unmount())

const partialReasoningTable = [
  "| # | Check | Result |",
  "| --- | --- | --- |",
  "| 1 | schema | valid |",
].join("\n")
const refreshedReasoningEntries = mapConversationMessagesToEntries([
  {
    id: "partial-reasoning-snapshot",
    conversation_id: conversationId,
    run_id: runId,
    role: "assistant",
    message_type: "output",
    content: "",
    content_json: { reasoning_content: partialReasoningTable },
    metadata_json: {},
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
])
const refreshedReasoning = refreshedReasoningEntries[0]
assert.ok(refreshedReasoning?.role === "assistant")
const continuedReasoning = projectConversationOutputEvent(
  refreshedReasoning,
  event(
    33,
    "model.text.delta",
    "\n| 2 | resume | valid |</think>\n\nFinal answer."
  ),
  runId
)
const continuedReasoningBlocks = getPaneBlocks(continuedReasoning.pane)
const continuedThinkBlock = continuedReasoningBlocks.find(
  (block) => block.type === "think"
)
assert.equal(
  continuedThinkBlock?.content,
  `${partialReasoningTable}\n| 2 | resume | valid |`,
  "refresh resume must append a mid-think SSE suffix to the persisted reasoning block"
)
assert.equal(
  continuedReasoningBlocks.filter((block) => block.type === "think").length,
  1,
  "refresh resume must not split one Markdown reasoning document into two think blocks"
)
let refreshedReasoningTree
await act(() => {
  refreshedReasoningTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: continuedReasoning.pane,
      isStreaming: true,
    })
  )
})
const reasoningTrigger = refreshedReasoningTree.root.findAllByType("button")[0]
await act(() => reasoningTrigger.props.onClick({ defaultPrevented: false }))
const refreshedReasoningJson = JSON.stringify(refreshedReasoningTree.toJSON())
assert.match(refreshedReasoningJson, /<table>/)
assert.match(refreshedReasoningJson, /resume/)
assert.match(refreshedReasoningJson, /Final answer/)
await act(() => refreshedReasoningTree.unmount())

const thousandNodeBlocks = Array.from({ length: 1000 }, (_, index) => {
  const id = `perf-${index}`
  if (index % 4 === 1) {
    return [id, { id, type: "think", content: `reasoning ${index}`, open: false }]
  }
  if (index % 4 === 2) {
    return [id, { id, type: "tool", toolId: id }]
  }
  if (index % 4 === 3) {
    return [id, { id, type: "update", content: `update ${index}` }]
  }
  return [
    id,
    {
      id,
      type: "text",
      content:
        index === 996
          ? `\`\`\`typescript\n${"const value = 1;\n".repeat(2000)}\`\`\``
          : `row ${index}`,
    },
  ]
})
const thousandNodeTools = Object.fromEntries(
  Array.from({ length: 1000 }, (_, index) => index)
    .filter((index) => index % 4 === 2)
    .map((index) => {
      const id = `perf-${index}`
      const publishesArtifact = index % 100 === 2
      return [
        id,
        {
          id,
          name: publishesArtifact ? "publish_sandbox_file" : "exec_command",
          input: publishesArtifact ? "" : JSON.stringify({ command: `echo ${index}` }),
          output: publishesArtifact
            ? JSON.stringify({
                workspace_id: "workspace-perf",
                object_id: `object-${index}`,
                version_id: `version-${index}`,
                path: `reports/${index}.md`,
                mime_type: "text/markdown",
                size_bytes: index,
              })
            : `result ${index}`,
          status: "succeeded",
        },
      ]
    })
)
const perfSubagentOrder = Array.from({ length: 100 }, (_, index) => `perf-sub-${index}`)
const perfSubagents = Object.fromEntries(
  perfSubagentOrder.map((id, index) => [
    id,
    {
      id,
      name: `Subagent ${index}`,
      status: "completed",
      blockOrder: [`${id}-text`],
      blocks: {
        [`${id}-text`]: { id: `${id}-text`, type: "text", content: `done ${index}` },
      },
      tools: {},
      activeThinkBlockId: null,
      activeThinkMode: null,
      pendingTagBuffer: "",
      receivedTextDelta: false,
    },
  ])
)
const thousandNodePane = {
  blockOrder: Array.from({ length: 1000 }, (_, index) => `perf-${index}`),
  blocks: Object.fromEntries(thousandNodeBlocks),
  tools: thousandNodeTools,
  activeThinkBlockId: null,
  activeThinkMode: null,
  activeTextBlockId: null,
  pendingTagBuffer: "",
  receivedTextDelta: false,
}
let virtualizedThousandNodeTree
await act(() => {
  virtualizedThousandNodeTree = TestRenderer.create(
    React.createElement(WebNodeList, {
      pane: thousandNodePane,
      subagentOrder: perfSubagentOrder,
      subagents: perfSubagents,
    })
  )
})
const materializedNodeRows = virtualizedThousandNodeTree.root.findAll(
  (node) => node.props["data-web-node-row"] !== undefined
)
assert.ok(
  materializedNodeRows.length <= 80,
  `1000 canonical Web Nodes must materialize a bounded normal-flow window, got ${materializedNodeRows.length}`
)
await act(() => virtualizedThousandNodeTree.unmount())

const subagentToolHistory = mapConversationMessagesToEntries([
  {
    id: "subagent-tool-plugin",
    conversation_id: conversationId,
    run_id: runId,
    role: "tool",
    message_type: "tool_result",
    content: "done",
    metadata_json: {
      scope: "sub",
      subagent_id: "sub-tool",
      subagent_name: "Tool verifier",
      tool_call_id: "sub-tool-call",
      tool_name: "web_search",
      status: "succeeded",
      web_view: {
        ...cumulativePluginNode,
        nodeId: "subagent-tool-view",
      },
    },
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:00Z",
  },
])
assert.equal(subagentToolHistory.length, 1)
assert.ok(subagentToolHistory[0].role === "assistant")
assert.ok(
  subagentToolHistory[0].role === "assistant" &&
    getPaneBlocks(subagentToolHistory[0].subagents["sub-tool"]).some(
      (block) =>
        block.type === "plugin" && block.node.nodeId === "subagent-tool-view"
    ),
  "subagent tool history must preserve the declared Plugin node"
)

let disconnected = createConversationRunRuntime(conversationId)
for (const item of events.slice(0, 8)) {
  disconnected = reduceConversationRunRuntime(disconnected, { type: "event", event: item })
}
disconnected = reduceConversationRunRuntime(disconnected, { type: "transport_closed" })
assert.equal(disconnected.lifecycle, "running")
assert.equal(disconnected.terminalEventSeen, false)
for (const item of events.slice(5)) {
  disconnected = reduceConversationRunRuntime(disconnected, { type: "event", event: item })
}
assert.equal(disconnected.lifecycle, "completed")
assert.equal(disconnected.lastSeq, 18)

let cancelled = createConversationRunRuntime("conversation-cancelled")
cancelled = reduceConversationRunRuntime(cancelled, {
  type: "event",
  event: {
    ...event(1, "run.started"),
    run_id: "run-cancelled",
    metadata: {
      schema_version: 1,
      conversation_id: "conversation-cancelled",
      conversation_run_id: "run-cancelled",
    },
  },
})
cancelled = reduceConversationRunRuntime(cancelled, {
  type: "event",
  event: {
    ...event(2, "run.cancelled"),
    run_id: "run-cancelled",
    metadata: {
      schema_version: 1,
      conversation_id: "conversation-cancelled",
      conversation_run_id: "run-cancelled",
    },
  },
})
assert.equal(cancelled.lifecycle, "cancelled")
assert.equal(cancelled.terminalEventSeen, true)

const exceptionRegistry = new WebNodeRendererRegistry().register(
  "ineffable.web.fixture",
  "exception",
  ({ node }) => {
    if (node.payload.fail) throw new Error("fixture renderer failed")
    return React.createElement("span", null, node.payload.label)
  }
)
const fallbackRenderer = ({ node }) =>
  React.createElement("span", null, `fallback:${node.fallback.title}`)
const exceptionNode = {
  schemaVersion: WEB_NODE_SCHEMA_VERSION,
  pluginId: "ineffable.web.fixture",
  renderer: "exception",
  nodeId: "exception-node",
  status: "settled",
  payload: { fail: true, label: "broken" },
  fallback: { title: "Safe view" },
}
const originalConsoleError = console.error
console.error = () => {}
let exceptionTree
try {
  await act(() => {
    exceptionTree = TestRenderer.create(
      React.createElement(WebNodeSeat, {
        node: exceptionNode,
        registry: exceptionRegistry,
        context: { prefersReducedMotion: false },
        fallbackRenderer,
      })
    )
  })
  assert.match(JSON.stringify(exceptionTree.toJSON()), /fallback:Safe view/)
  await act(() => {
    exceptionTree.update(
      React.createElement(WebNodeSeat, {
        node: { ...exceptionNode, payload: { fail: false, label: "recovered" } },
        registry: exceptionRegistry,
        context: { prefersReducedMotion: false },
        fallbackRenderer,
      })
    )
  })
  assert.match(JSON.stringify(exceptionTree.toJSON()), /recovered/)
} finally {
  console.error = originalConsoleError
  if (exceptionTree) await act(() => exceptionTree.unmount())
}

console.log("chat web integration checks passed")
