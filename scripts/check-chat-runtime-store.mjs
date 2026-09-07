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

const suspended = reduceConversationRunRuntime(afterTransportClose, {
  type: "event",
  event: event("conversation-a", "run-a", 2, "run.suspended"),
})
assert.equal(suspended.lifecycle, "suspended")
assert.equal(suspended.terminalEventSeen, false)
assert.equal(suspended.connection, "closed")

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

const { ConversationRuntimeController } = await import(
  "../src/features/chat/runtime/conversation-runtime-controller.ts"
)
const { parseSseStream } = await import("../src/lib/api/chat/sse-stream.ts")
const liveStore = new ChatRuntimeStore()
const runtime = new ConversationRuntimeController(liveStore)
liveStore.dispatch("conversation-a", { type: "connect", runId: "run-a", executionEpoch: 2 })
const received = []
let oldCallback
let finishOld
const oldConnection = runtime.connect("conversation-a", "run-a", 10, value => received.push(value),
  async (_conversation, _run, _cursor, _signal, callback) => {
    oldCallback = callback
    await new Promise(resolve => { finishOld = resolve })
  })
let bytes
let closed = false
const encoder = new TextEncoder()
const stream = new ReadableStream({ start(controller) { bytes = controller } })
const liveConnection = runtime.connect("conversation-a", "run-a", 11, value => {
  received.push(value)
  liveStore.applyEvent(value.event)
}, async (conversation, run, cursor, signal, callback) => {
  assert.equal(conversation, "conversation-a")
  assert.equal(run, "run-a")
  assert.equal(cursor, 11, "resume forwards the conversation cursor")
  assert.equal(signal.aborted, false)
  await parseSseStream(new Response(stream), raw => raw, callback)
}).then(outcome => { closed = true; return outcome })
assert.equal(liveStore.get("conversation-a").executionEpoch, 2, "reconnect preserves resumed epoch")
oldCallback({ type: "event", event: event("conversation-a", "run-a", 12, "run.failed") })
assert.equal(received.length, 0, "superseded callbacks cannot project stale events")
const delta = { type: "event", event: event("conversation-a", "run-a", 12, "assistant.delta", "first") }
bytes.enqueue(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`))
await new Promise(resolve => setImmediate(resolve))
assert.equal(received.length, 1, "first delta is delivered while SSE remains open")
assert.equal(closed, false)
const replacementState = liveStore.get("conversation-a")
finishOld()
assert.equal(await oldConnection, "aborted")
assert.equal(liveStore.get("conversation-a"), replacementState, "old EOF cannot close replacement")
bytes.enqueue(encoder.encode(`data: ${JSON.stringify({ ...delta, event: { ...delta.event, seq: 13, content: "second" } })}\n\n`))
await new Promise(resolve => setImmediate(resolve))
assert.equal(received.length, 2)
bytes.close()
assert.equal(await liveConnection, "closed")
assert.equal(liveStore.get("conversation-a").terminalEventSeen, false, "EOF cannot complete resumed run")

let detachedCallback
let finishDetached
const detached = runtime.connect("conversation-a", "run-a", 13, value => received.push(value),
  async (_conversation, _run, _cursor, _signal, callback) => {
    detachedCallback = callback
    await new Promise(resolve => { finishDetached = resolve })
  })
runtime.disconnectAll()
detachedCallback(delta)
assert.equal(received.length, 2, "disconnected callbacks cannot write into another selection")
finishDetached()
assert.equal(await detached, "aborted")
console.log("human resume SSE delivery and subscription fencing checks passed")
