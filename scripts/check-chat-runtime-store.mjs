import assert from "node:assert/strict"

const {
  createConversationRunRuntime,
  reduceConversationRunRuntime,
} = await import(
  "../src/features/chat/runtime/conversation-run-reducer.ts"
)
const { ChatRuntimeStore } = await import(
  "../src/features/chat/runtime/chat-runtime-store.ts"
)

function event(conversationId, runId, seq, kind, content = null) {
  return {
    run_id: runId,
    seq,
    ts_ms: seq,
    stream: "chat",
    event: kind,
    content,
    metadata: {
      schema_version: 1,
      conversation_id: conversationId,
      conversation_run_id: runId,
    },
  }
}

let state = createConversationRunRuntime("conversation-a")
state = reduceConversationRunRuntime(state, {
  type: "event",
  event: event("conversation-a", "run-a", 1, "run.started"),
})
assert.equal(state.lifecycle, "running")
assert.equal(state.terminalEventSeen, false)

const afterTransportClose = reduceConversationRunRuntime(state, {
  type: "transport_closed",
})
assert.equal(afterTransportClose.lifecycle, "running")
assert.equal(
  afterTransportClose.terminalEventSeen,
  false,
  "transport EOF must not create a business terminal state"
)

const afterOutOfOrder = reduceConversationRunRuntime(afterTransportClose, {
  type: "event",
  event: event("conversation-a", "run-a", 1, "run.completed"),
})
assert.equal(afterOutOfOrder, afterTransportClose)

const completed = reduceConversationRunRuntime(afterTransportClose, {
  type: "event",
  event: event("conversation-a", "run-a", 2, "run.completed"),
})
assert.equal(completed.lifecycle, "completed")
assert.equal(completed.terminalEventSeen, true)

const ignoredSecondTerminal = reduceConversationRunRuntime(completed, {
  type: "event",
  event: event("conversation-a", "run-a", 3, "run.failed", "late failure"),
})
assert.equal(ignoredSecondTerminal, completed)

const store = new ChatRuntimeStore()
store.applyEvent(event("conversation-a", "run-a", 1, "run.started"))
store.applyEvent(event("conversation-b", "run-b", 1, "run.started"))
store.applyEvent(event("conversation-a", "run-a", 2, "run.completed"))
assert.equal(store.get("conversation-a").lifecycle, "completed")
assert.equal(store.get("conversation-b").lifecycle, "running")

console.log("chat runtime store checks passed")
