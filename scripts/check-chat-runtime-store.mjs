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

// Activity is observation only: durable snapshot and live events share identity/fences.
let activity = createConversationRunRuntime("compact")
const compactEvent = (seq, kind, epoch = 2) => ({ ...event("compact", "run-c", seq, kind), metadata: {
  ...event("compact", "run-c", seq, kind).metadata, execution_epoch: epoch, activity_seq: seq,
}})
const reduceActivity = action => activity = reduceConversationRunRuntime(activity, action)
reduceActivity({type:"activity-snapshot", runId:"run-c", executionEpoch:2, seq:10, activityVersion:10, compacting:true})
assert.equal(activity.compacting, true, "refresh restores an actual in-progress compaction")
assert.equal(activity.lastSeq, 0, "activity snapshot must not skip transcript replay")
reduceActivity({type:"event",event:compactEvent(5,"run.started")})
assert.equal(activity.compacting, true, "older replay cannot erase snapshot activity")
reduceActivity({type:"event",event:compactEvent(6,"run.awaiting_human")})
reduceActivity({type:"event",event:compactEvent(7,"run.resumed")})
assert.equal(activity.compacting, true, "old human pause/resume replay cannot erase a newer activity snapshot")
reduceActivity({type:"event",event:compactEvent(11,"agent.compaction.completed")})
assert.equal(activity.compacting, false)
reduceActivity({type:"activity-snapshot",runId:"run-c",executionEpoch:2,seq:10,activityVersion:10,compacting:true})
assert.equal(activity.compacting, false, "late page cannot restore completed activity")
reduceActivity({type:"event",event:compactEvent(12,"agent.compaction.started")})
assert.equal(activity.compacting,true)
reduceActivity({type:"event",event:compactEvent(100,"agent.compaction.completed",1)})
assert.equal(activity.compacting,true,"stale epoch cannot end current compaction")
reduceActivity({type:"event",event:{...compactEvent(13,"agent.compaction.started"),metadata:{conversation_id:"other",conversation_run_id:"run-c"}}})
assert.equal(activity.lastSeq,12,"other conversation is ignored")
reduceActivity({type:"event",event:compactEvent(13,"run.cancelled")})
assert.equal(activity.compacting,false,"stop clears activity")
reduceActivity({type:"event",event:compactEvent(14,"agent.compaction.started")})
assert.equal(activity.compacting,false,"late process signal cannot reopen terminal activity")
for (const ending of ["agent.compaction.failed", "run.awaiting_human", "run.suspended", "run.failed", "run.completed"]) {
 activity=createConversationRunRuntime("compact")
 reduceActivity({type:"event",event:compactEvent(1,"run.started")})
 reduceActivity({type:"event",event:compactEvent(2,"agent.compaction.started")})
 reduceActivity({type:"event",event:compactEvent(3,ending)})
 assert.equal(activity.compacting,false,ending)
}
console.log("compaction activity snapshot, replay, epoch, terminal and isolation checks passed")

reduceActivity({type:"activity-snapshot",runId:"successor",executionEpoch:0,seq:20,activityVersion:1,compacting:true})
assert.equal(activity.runId,"successor")
assert.equal(activity.compacting,true,"successor epoch is independent of predecessor epoch")

activity=createConversationRunRuntime("compact")
reduceActivity({type:"event",event:compactEvent(1,"run.started")})
reduceActivity({type:"event",event:compactEvent(2,"agent.compaction.started")})
reduceActivity({type:"event",event:compactEvent(3,"agent.compaction.completed")})
const retriedStart=compactEvent(4,"agent.compaction.started")
retriedStart.metadata.activity_seq=2
reduceActivity({type:"event",event:retriedStart})
assert.equal(activity.compacting,false,"a retried start with a newer transport seq cannot reopen completed compaction")
assert.equal(activity.lastSeq,4,"retry remains part of normal transport coverage")

activity=createConversationRunRuntime("compact")
reduceActivity({type:"event",event:compactEvent(100,"agent.compaction.started",2)})
reduceActivity({type:"connect",runId:"run-c",executionEpoch:3})
assert.equal(activity.activityVersion,0,"HTTP resume before SSE must reset the per-epoch activity counter")
assert.equal(activity.compacting,false)
const resumedStart=compactEvent(101,"agent.compaction.started",3)
resumedStart.metadata.activity_seq=1
reduceActivity({type:"event",event:resumedStart})
assert.equal(activity.compacting,true,"new epoch's lower activity counter is valid")
activity=createConversationRunRuntime("compact")
reduceActivity({type:"activity-snapshot",runId:"run-c",executionEpoch:3,seq:100,activityVersion:0,compacting:false})
reduceActivity({type:"event",event:resumedStart})
assert.equal(activity.compacting,true,"refresh followed by a new epoch start")
