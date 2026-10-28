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
assert.deepEqual({ ...ignoredSecondTerminal, lastSeq: completed.lastSeq }, completed)
assert.equal(ignoredSecondTerminal.lastSeq, 3, "ignored lifecycle remains covered in ordered replay")

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
let oldCallback, oldOpen, liveOpen
let finishOld
const oldConnection = runtime.connect("conversation-a", "run-a", 10, value => received.push(value),
  async (_conversation, _run, _cursor, _signal, callback, onOpen) => {
    oldOpen = onOpen
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
}, async (conversation, run, cursor, signal, callback, onOpen) => {
  liveOpen = onOpen
  assert.equal(conversation, "conversation-a")
  assert.equal(run, "run-a")
  assert.equal(cursor, 11, "resume forwards the conversation cursor")
  assert.equal(signal.aborted, false)
  await parseSseStream(new Response(stream), raw => raw, callback)
}).then(outcome => { closed = true; return outcome })
assert.equal(liveStore.get("conversation-a").executionEpoch, 2, "reconnect preserves resumed epoch")
assert.equal(liveStore.get("conversation-a").connection, "connecting")
oldOpen()
assert.equal(liveStore.get("conversation-a").connection, "connecting", "stale open cannot establish the replacement stream")
const lifecycleBeforeOpen = liveStore.get("conversation-a").lifecycle
liveOpen()
assert.equal(liveStore.get("conversation-a").connection, "open", "HTTP stream open is observed before any model event")
assert.equal(liveStore.get("conversation-a").lifecycle, lifecycleBeforeOpen, "connection establishment cannot start an Agent")
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
reduceActivity({type:"event",event:compactEvent(13,"agent.compaction.completed",1)})
assert.equal(activity.compacting,true,"stale epoch cannot end current compaction")
reduceActivity({type:"event",event:{...compactEvent(13,"agent.compaction.started"),metadata:{conversation_id:"other",conversation_run_id:"run-c"}}})
assert.equal(activity.lastSeq,13,"other conversation is ignored")
reduceActivity({type:"event",event:compactEvent(14,"run.cancelled")})
assert.equal(activity.compacting,false,"stop clears activity")
reduceActivity({type:"event",event:compactEvent(15,"agent.compaction.started")})
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

for (const kind of ["conversation.task_result"]) {
  const notification = { ...event("notify", "conversation:notify", 4, kind), metadata: {
    conversation_id: "notify", event_scope: "conversation",
  } }
  let idle = createConversationRunRuntime("notify")
  idle = reduceConversationRunRuntime(idle, { type: "event", event: notification })
  assert.equal(idle.runId, null)
  assert.equal(idle.lastSeq, 4)
  const running = reduceConversationRunRuntime(idle, { type: "event", event: event("notify", "real-run", 5, "run.started") })
  assert.equal(running.runId, "real-run")
  const updated = reduceConversationRunRuntime(running, { type: "event", event: { ...notification, seq: 6 } })
  assert.deepEqual({ ...updated, lastSeq: 5 }, running, "notification changes only conversation cursor")
  assert.equal(updated.lastSeq, 6)
  assert.equal(reduceConversationRunRuntime(updated, {type:"event",event:notification}), updated)
}

// HTTP, restored history and SSE converge without sharing their coverage cursor.
const snapshot = (status, version, epoch, seq, extra = {}) => ({
  id: "run-state", status, version, execution_epoch: epoch, lifecycle_seq: seq,
  is_streaming: status === "streaming", is_live: false, accepts_guided_input: false, ...extra,
})
let canonical = createConversationRunRuntime("state")
canonical = reduceConversationRunRuntime(canonical, {type:"run-snapshot",run:snapshot("awaiting_human",3,1,30,{pending_need:{kind:"approval",need_id:"need"}})})
assert.equal(canonical.lastSeq,0)
const staleStart = {...event("state","run-state",10,"run.started"),metadata:{conversation_id:"state",conversation_run_id:"run-state",execution_epoch:1,run_version:1}}
const { acceptsRunLifecycleEvent } = await import("../src/features/chat/runtime/conversation-run-reducer.ts")
assert.equal(acceptsRunLifecycleEvent(canonical,staleStart),false)
canonical = reduceConversationRunRuntime(canonical,{type:"event",event:staleStart})
assert.equal(canonical.lifecycle,"awaiting_human")
assert.equal(canonical.currentRun.pending_need.need_id,"need")
assert.equal(canonical.lastSeq,10)
canonical = reduceConversationRunRuntime(canonical,{type:"event",event:{...staleStart,seq:11,event:"tool.completed"}})
assert.equal(canonical.lastSeq,11,"history tool events remain available for timeline projection")
assert.equal(reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("streaming",2,1,20)}),canonical)
canonical = reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("streaming",4,2,30)})
assert.equal(canonical.lifecycle,"running","expired lease still represents unfinished streaming")
assert.equal(canonical.executionEpoch,2)
canonical = reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("suspended",5,2,40,{resume_mode:"automatic",pending_segments:[{segment_seq:2,attempt:0,status:"pending"}]})})
assert.equal(canonical.lifecycle,"suspended")
assert.equal(canonical.currentRun.resume_mode,"automatic")
assert.equal(canonical.terminalEventSeen,false)
canonical = reduceConversationRunRuntime(canonical,{type:"reset-coverage"})
assert.equal(canonical.lifecycle,"suspended","rebuilding transcript coverage preserves product controls")
canonical = reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("completed",6,3,50)})
const terminalSnapshot = canonical
assert.equal(reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("streaming",6,3,50)}),terminalSnapshot)
canonical = reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:{...snapshot("streaming",1,1,51),id:"successor"}})
assert.equal(canonical.runId,"successor")
assert.equal(reduceConversationRunRuntime(canonical,{type:"run-snapshot",run:snapshot("completed",6,3,50)}),canonical,"stale predecessor snapshot cannot displace successor")
const stableStore = new ChatRuntimeStore()
assert.equal(stableStore.get("new"),stableStore.get("new"),"external-store snapshot must have stable object identity")
console.log("canonical run snapshot and lifecycle fences passed")

const projectionStore = new ChatRuntimeStore()
projectionStore.dispatch("background",{type:"run-snapshot",run:snapshot("streaming",1,1,10)})
const initialProjection = projectionStore.getRunProjection()
projectionStore.dispatch("background",{type:"transport_closed"})
projectionStore.applyEvent({...event("background","run-state",11,"model.text.delta","tail"),metadata:{conversation_id:"background",execution_epoch:1}})
assert.equal(projectionStore.getRunProjection(),initialProjection,"transport and text updates do not rebuild run-list projection")
projectionStore.dispatch("background",{type:"run-snapshot",run:snapshot("completed",3,1,30)})
assert.notEqual(projectionStore.getRunProjection(),initialProjection,"background controls notify the shared list projection")
const terminalProjection = projectionStore.getRunProjection()
projectionStore.dispatch("background",{type:"run-snapshot",run:snapshot("streaming",1,1,10)})
assert.equal(projectionStore.getRunProjection(),terminalProjection,"rejected list snapshots cannot change menu or observation gates")

// Admission is an independent monotonic fact, not evidence that a run exists.
const admissionStore = new ChatRuntimeStore()
const admission = { conversation_id: "waiting", queued_count: 1, consuming_count: 0, queue_paused: false, generation: 0, revision: 2 }
admissionStore.dispatch("waiting", { type: "admission-snapshot", admission })
assert.equal(admissionStore.get("waiting").runId, null)
assert.equal(admissionStore.get("waiting").lifecycle, "idle")
assert.deepEqual(admissionStore.getRunProjection().getAdmission("waiting"), admission)
admissionStore.dispatch("waiting", { type: "run-snapshot", run: null, admission: { ...admission, queued_count: 0, revision: 1 } })
assert.deepEqual(admissionStore.get("waiting").admission, admission, "a GET started before the ACK cannot erase its queue")
const paused = { ...admission, queue_paused: true, generation: 1, revision: 3 }
admissionStore.dispatch("waiting", { type: "admission-snapshot", admission: paused })
admissionStore.dispatch("waiting", { type: "admission-snapshot", admission: { ...admission, revision: 4 } })
assert.deepEqual(admissionStore.get("waiting").admission, paused, "a regressing Stop generation cannot be accepted")
admissionStore.dispatch("waiting", { type: "admission-snapshot", admission: { ...paused, conversation_id: "other", revision: 5 } })
assert.deepEqual(admissionStore.get("waiting").admission, paused)
admissionStore.applyEvent(event("waiting", "dispatched", 10, "run.started"))
assert.equal(admissionStore.get("waiting").runId, "dispatched")
assert.deepEqual(admissionStore.get("waiting").admission, paused, "run SSE must preserve the independent admission revision")
admissionStore.dispatch("waiting", { type: "reset" })
assert.deepEqual(admissionStore.get("waiting").admission, paused)
console.log("admission receipt and stale snapshot checks passed")

const { hasUnsettledConversationInput } = await import("../src/lib/api/chat/conversation-admission.ts")
const awaitingRecorder = { ...admission, queued_count: 0, consuming_count: 1, revision: 8 }
assert.equal(hasUnsettledConversationInput(awaitingRecorder), true, "claim cannot stop background observation before run.started")
assert.equal(hasUnsettledConversationInput({ ...awaitingRecorder, queue_paused: true }), true, "an executing root remains stoppable while its successors are paused")
assert.equal(hasUnsettledConversationInput({ ...paused, consuming_count: 0 }), false)
