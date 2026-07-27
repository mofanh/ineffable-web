import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

const apiClient = source("src/lib/api/api-client.ts")
const sseParser = source("src/lib/api/chat/sse-stream.ts")
const gatewayEvents = source("src/lib/api/chat/gateway-events.ts")
const sidebar = source("src/features/chat/gateway-chat-sidebar.tsx")
const paneState = source("src/features/chat/chat-pane-state.ts")
const projector = source(
  "src/features/chat/runtime/conversation-event-projector.ts"
)

assert.doesNotMatch(apiClient, /getReader\(\)/)
assert.match(sseParser, /getReader\(\)/)
assert.doesNotMatch(gatewayEvents, /tool=|call_id=|parseToolEnvelopeContent/)
assert.doesNotMatch(paneState, /output\.includes|output\.startsWith/)
assert.doesNotMatch(
  sidebar,
  /"run_completed"|"run_cancelled"|"run_awaiting_human"|"tool_call_done"|"text_delta"/
)
assert.match(sidebar, /new ConversationRuntimeController/)
assert.match(sidebar, /runtimeStoreRef\.current\.applyEvent/)
assert.match(sidebar, /projectConversationOutputEvent/)
assert.match(projector, /"assistant\.snapshot"/)
assert.match(projector, /"subagent\.completed"/)

console.log("chat runtime architecture checks passed")
