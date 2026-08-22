import assert from "node:assert/strict"

import { finalizePane, getPaneBlocks } from "../src/features/chat/chat-pane-state.ts"
import { createAssistantEntry } from "../src/features/chat/model/chat-history.ts"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector.ts"
import {
  createConversationRunRuntime,
  reduceConversationRunRuntime,
} from "../src/features/chat/runtime/conversation-run-reducer.ts"
import {
  normalizeGatewayEnvelope,
} from "../src/lib/api/chat/gateway-events.ts"
import { parseSseStream } from "../src/lib/api/chat/sse-stream.ts"

const conversationId = "conversation-web-integration"
const runId = "run-web-integration"

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
  event(17, "run.completed"),
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
    receivedTextDelta: pane.receivedTextDelta,
  }
}
assert.equal(live.runtime.lifecycle, "completed")
assert.equal(live.runtime.terminalEventSeen, true)
assert.equal(live.runtime.lastSeq, 17)
assert.deepEqual(semanticPane(live.entry.pane), semanticPane(replay.entry.pane))
assert.equal(live.entry.subagentOrder.length, 1)
assert.equal(live.entry.subagents["sub-1"].status, "done")
assert.equal(live.entry.pane.tools["tool-a"].status, "failed")
assert.equal(live.entry.pane.tools["tool-b"].status, "succeeded")
assert.equal(live.entry.pane.tools["approval-1"].status, "waiting")
assert.ok(
  getPaneBlocks(live.entry.pane).some(
    (block) => block.type === "text" && block.content.endsWith("Final summary.")
  )
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
assert.equal(disconnected.lastSeq, 17)

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

console.log("chat web integration checks passed")
