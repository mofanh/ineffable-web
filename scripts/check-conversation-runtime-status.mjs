import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const {
  findNewlyTerminalConversationIds,
  getLiveRunResumeCursor,
  getConversationRunLifecycle,
  getConversationRuntimeStatus,
  observeConversationRuns,
} = await import("../src/features/chat/model/conversation-runtime-status.ts")
const {
  commitConversationSelection,
} = await import("../src/features/chat/model/conversation-selection.ts")

function conversation(id, run) {
  return {
    id,
    created_by: "user",
    title: id,
    visibility: "private",
    status: "active",
    current_run_id: run?.id ?? null,
    current_run: run,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

function run(id, status, isLive) {
  return {
    id,
    status,
    is_streaming: status === "streaming",
    is_live: isLive,
  }
}

const active = conversation("conversation-a", run("run-a", "streaming", true))
const awaiting = conversation(
  "conversation-b",
  run("run-b", "awaiting_human", false)
)
const failed = conversation("conversation-c", run("run-c", "failed", false))

assert.equal(getConversationRunLifecycle(active), "active")
assert.equal(getConversationRuntimeStatus(active, false), "running")
assert.equal(getConversationRuntimeStatus(awaiting, false), "awaiting_human")
assert.equal(getConversationRuntimeStatus(failed, false), "failed")

const previous = observeConversationRuns([active, awaiting])
const completedA = conversation(
  "conversation-a",
  run("run-a", "completed", false)
)
const completedB = conversation(
  "conversation-b",
  run("run-b", "completed", false)
)

assert.deepEqual(
  findNewlyTerminalConversationIds(
    previous,
    [completedA, completedB],
    "conversation-b"
  ),
  ["conversation-a"]
)
assert.equal(
  getConversationRuntimeStatus(completedA, true),
  "completed_unread"
)
assert.equal(getConversationRuntimeStatus(completedA, false), null)
assert.deepEqual(getLiveRunResumeCursor("run-a", "run-a", 12), {
  runId: "run-a",
  afterSeq: 12,
})
assert.deepEqual(getLiveRunResumeCursor("run-a", null, 12), {
  runId: "run-a",
  afterSeq: null,
})
assert.deepEqual(getLiveRunResumeCursor("run-a", "run-stale", 12), {
  runId: "run-a",
  afterSeq: null,
})
assert.equal(getLiveRunResumeCursor(null, "run-stale", 12), null)

const selectionRef = { current: "conversation-old" }
let selectedConversationId = "conversation-old"
let refObservedBySelector = null
commitConversationSelection(
  selectionRef,
  (conversationId) => {
    refObservedBySelector = selectionRef.current
    selectedConversationId = conversationId
  },
  null
)
assert.equal(selectionRef.current, null)
assert.equal(refObservedBySelector, null)
assert.equal(selectedConversationId, null)

commitConversationSelection(
  selectionRef,
  (conversationId) => {
    refObservedBySelector = selectionRef.current
    selectedConversationId = conversationId
  },
  "conversation-new"
)
assert.equal(selectionRef.current, "conversation-new")
assert.equal(refObservedBySelector, "conversation-new")
assert.equal(selectedConversationId, "conversation-new")

const sidebarSource = readFileSync(
  new URL(
    "../src/features/chat/gateway-chat-sidebar.tsx",
    import.meta.url
  ),
  "utf8"
)
assert.match(sidebarSource, /selectConversationTarget\(null\)/)
assert.match(
  sidebarSource,
  /selectConversationTarget\(targetConversationId\)/
)
assert.match(
  sidebarSource,
  /onSelectConversation=\{selectConversationTarget\}/
)
assert.doesNotMatch(
  sidebarSource,
  /onSelectConversation=\{selectConversation\}/
)

console.log("conversation runtime status checks passed")
