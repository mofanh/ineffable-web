import assert from "node:assert/strict"

const {
  findNewlyTerminalConversationIds,
  getConversationRunLifecycle,
  getConversationRuntimeStatus,
  observeConversationRuns,
} = await import("../src/features/chat/model/conversation-runtime-status.ts")

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

console.log("conversation runtime status checks passed")
