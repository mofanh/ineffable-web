import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { inputProgressLabel, mergeInputProgress, parseInputProgress } from "../src/features/chat/model/input-progress.ts"
import { reduceConversationTimeline } from "../src/features/chat/model/conversation-entry-reconciliation.ts"

const received = parseInputProgress({ message_id: "m", conversation_id: "c", kind: "guided", phase: "received", run_id: "r", run_state: "streaming", execution_epoch: 2, run_version: 4 })
assert.equal(inputProgressLabel(received), "inputProgress.received", "delivery is not consumption")
const accepted = { ...received, phase: "accepted" }
assert.equal(inputProgressLabel(accepted), "inputProgress.processing")
assert.equal(inputProgressLabel({ ...accepted, run_state: "failed" }), "inputProgress.acceptedFailed")
assert.equal(inputProgressLabel({ ...received, phase: "resuming" }), "inputProgress.resuming")
assert.equal(inputProgressLabel({ ...received, kind: "pre_input", phase: "queued", run_state: "awaiting_human" }), "inputProgress.blocked")
assert.equal(inputProgressLabel({ ...received, run_state: "completed" }), "inputProgress.unconfirmed", "terminal output is not proof of input acceptance")
assert.equal(mergeInputProgress(accepted, { ...received, execution_epoch: 1 }), accepted)
const user = { id: "message:m", timelineUnitId: "message:m", timelineSeq: 3, role: "user", content: "adjust the plan", inputProgress: received }
const live = reduceConversationTimeline([user], { type: "input-progress", progress: accepted })
assert.equal(live.length, 1)
assert.equal(live[0].role, "user")
assert.equal(live[0].inputProgress.phase, "accepted")
const staleHydration = reduceConversationTimeline(live, { type: "canonical-patch", entries: [user] })
assert.equal(staleHydration[0].inputProgress.phase, "accepted", "a racing history page must not erase a confirmed receipt")
const refreshed = reduceConversationTimeline(live, { type: "canonical-patch", entries: [{ ...user, inputProgress: { ...accepted, run_state: "failed", run_version: 5 } }] })
assert.equal(inputProgressLabel(refreshed[0].inputProgress), "inputProgress.acceptedFailed")
assert.equal(refreshed.length, 1, "progress never creates a second message")
console.log("input acceptance projection and timeline checks passed")

const sidebar = readFileSync(new URL("../src/features/chat/gateway-chat-sidebar.tsx", import.meta.url), "utf8")
const guidedSubmission = sidebar.slice(sidebar.indexOf("function beginGuidedUserTurn("), sidebar.indexOf("function beginGuidedUserTurn(") + 220)
assert.ok(!guidedSubmission.includes("completeAssistantEntry"), "submitting guidance must not complete the active assistant")
assert.match(sidebar, /progress.kind === "guided"[\s\S]{0,100}completeAssistantEntry\(\)/, "the confirmed acceptance establishes the guided reply boundary")

const queuedA = { ...user, inputProgress: { ...received, kind: "pre_input", phase: "queued" } }
const queuedB = { ...queuedA, id: "message:m2", timelineUnitId: "message:m2", inputProgress: { ...queuedA.inputProgress, message_id: "m2" } }
for (const type of ["hydrate", "canonical-patch", "prepend-history"]) {
  assert.deepEqual(reduceConversationTimeline([], { type, entries: [queuedA, queuedB] }), [], `${type}: pending input must stay in the queue`)
}
assert.deepEqual(reduceConversationTimeline([queuedA, queuedB], { type: "canonical-patch", entries: [] }), [], "a fresh page removes cached queued bubbles even when it omits them")
const consuming = { ...queuedA, inputProgress: { ...queuedA.inputProgress, phase: "received", run_id: "successor" } }
const started = reduceConversationTimeline([], { type: "canonical-patch", entries: [consuming, queuedB] })
assert.equal(started.length, 1, "only the claimed input enters the timeline")
assert.equal(started[0].id, queuedA.id)
const replayed = reduceConversationTimeline(started, { type: "canonical-patch", entries: [consuming] })
assert.equal(replayed.length, 1, "consumption and refresh preserve canonical identity")
assert.deepEqual(reduceConversationTimeline([], { type: "hydrate", entries: [{ ...queuedA, inputProgress: { ...queuedA.inputProgress, phase: "cancelled" } }] }), [], "cleared input must not reappear")
