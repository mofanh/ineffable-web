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
const messageList = source("src/features/chat/components/chat-message-list.tsx")
const agentPane = source("src/features/chat/components/agent-pane.tsx")
const toolCallShell = source(
  "src/features/chat/components/tool-call-shell.tsx"
)
const webNodeRegistry = source(
  "src/features/chat/components/web-node-registry.tsx"
)
const history = source("src/features/chat/model/chat-history.ts")
const canonicalMessageEvent = source(
  "src/features/chat/model/canonical-message-event.ts"
)
const toolPresentation = source(
  "src/features/chat/model/tool-call-presentation.ts"
)
const workspaceArtifacts = source(
  "src/features/chat/runtime/workspace-artifacts.ts"
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
assert.match(sidebar, /messageProjectionRequestRef/)
assert.match(sidebar, /shouldApplyConversationProjection/)
assert.match(
  sidebar,
  /clearConversation\(\)[\s\S]*selectConversationTarget\(targetConversationId\)/
)
assert.match(projector, /"assistant\.snapshot"/)
assert.match(projector, /"subagent\.completed"/)
assert.doesNotMatch(messageList, /\bAgentPane\b/)
assert.doesNotMatch(agentPane, /export const AgentPane/)
assert.match(agentPane, /<WebNodeSeat/)
assert.match(agentPane, /getToolCallPresentation\(tool\)/)
assert.match(toolCallShell, /data-tool-call-id=\{tool\.id\}/)
assert.doesNotMatch(toolPresentation, /tool\.output\.(includes|startsWith)/)
assert.match(agentPane, /parseLeadingJsonObject\(tool\.output\)/)
assert.match(workspaceArtifacts, /parseLeadingJsonObject\(tool\.output\)/)
assert.match(webNodeRegistry, /registry\.render\(node, context, fallbackRenderer\)/)
assert.doesNotMatch(messageList, /SubagentNodeGroup|subagentOrder\.map/)
assert.match(agentPane, /registerDefaultWebNodeRenderer\([\s\S]*"subagent"/)
assert.match(history, /projectDeclaredWebNode/)
assert.match(history, /canonicalMessagesToGatewayEvents/)
assert.match(history, /modelProfileId/)
assert.match(history, /runDurationMs/)
assert.match(messageList, /data-assistant-answer-footer/)
assert.match(messageList, /data-answer-run-metadata/)
assert.match(sidebar, /modelDisplayNames=\{modelDisplayNames\}/)
assert.match(sidebar, /canonicalMessagesToGatewayEvents/)
assert.doesNotMatch(
  sidebar,
  /forward_messages[\s\S]{0,800}event:\s*["']assistant\.snapshot["']/
)
assert.match(canonicalMessageEvent, /messageType === "tool_result"/)
assert.match(canonicalMessageEvent, /normalizedCalls\.forEach/)
assert.match(sidebar, /response\.output\?\.trim\(\) && !hasForwardAssistantOutput/)
assert.match(history, /metadata_json\.web_view !== undefined/)

console.log("chat runtime architecture checks passed")
