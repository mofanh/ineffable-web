import assert from "node:assert/strict"
import React from "react"
import TestRenderer, { act } from "react-test-renderer"

import { finalizePane, getPaneBlocks } from "../src/features/chat/chat-pane-state.ts"
import {
  createAssistantEntry,
  mapConversationMessagesToEntries,
} from "../src/features/chat/model/chat-history.ts"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector.ts"
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

const conversationId = "conversation-web-integration"
const runId = "run-web-integration"

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
let liveTerminalEntry = projectConversationOutputEvent(
  undefined,
  liveTerminalCall,
  runId
)
const liveTerminalBlockId = liveTerminalEntry.pane.blockOrder[0]
liveTerminalEntry = projectConversationOutputEvent(
  liveTerminalEntry,
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
  exceptionTree?.unmount()
}

console.log("chat web integration checks passed")
