import assert from "node:assert/strict"

import {
  eventBelongsToConversation,
  getConversationEventIdentity,
} from "../src/features/chat/model/conversation-event-routing.ts"

const event = {
  run_id: "runtime-run",
  seq: 7,
  ts_ms: 1,
  stream: "chat",
  event: "run.completed",
  metadata: {
    conversation_id: "conversation-a",
    conversation_run_id: "product-run-a",
  },
}

assert.deepEqual(getConversationEventIdentity(event), {
  conversationId: "conversation-a",
  runId: "product-run-a",
})
assert.equal(eventBelongsToConversation(event, "conversation-a"), true)
assert.equal(eventBelongsToConversation(event, "conversation-b"), false)
assert.equal(
  getConversationEventIdentity({ ...event, metadata: null }),
  null,
  "events without authoritative conversation identity must be rejected"
)

console.log("conversation event routing checks passed")
