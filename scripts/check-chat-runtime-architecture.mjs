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
const chatComposer = source("src/features/chat/components/chat-composer.tsx")
const chatHeader = source("src/features/chat/components/chat-sidebar-header.tsx")
const agentNodePage = source("src/pages/agent-node-management-page.tsx")
const agentNodeView = source(
  "src/features/chat/components/agent-evolution-panel.tsx"
)
const agentEvolutionInvalidation = source(
  "src/features/chat/model/agent-evolution-invalidation.ts"
)
const appSidebar = source("src/features/workspace/app-sidebar.tsx")
const router = source("src/routes/router.tsx")
const agentPane = source("src/features/chat/components/agent-pane.tsx")
const toolCallShell = source(
  "src/features/chat/components/tool-call-shell.tsx"
)
const webNodeRegistry = source(
  "src/features/chat/components/web-node-registry.tsx"
)
const history = source("src/features/chat/model/chat-history.ts")
const composerRuntimeSelection = source(
  "src/features/chat/model/composer-runtime-selection.ts"
)
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
assert.match(history, /findLatestConversationRuntimeSelection/)
assert.match(history, /metadata\?\.model_profile_id/)
assert.match(history, /sandbox\.environment_id/)
assert.match(messageList, /data-assistant-answer-footer/)
assert.match(messageList, /data-answer-run-metadata/)
assert.match(sidebar, /modelDisplayNames=\{modelDisplayNames\}/)
assert.match(sidebar, /findLatestConversationRuntimeSelection\(response\.messages\)/)
assert.match(sidebar, /reconcileCanonicalComposerRuntimeSelection/)
assert.match(sidebar, /commitAcceptedComposerRuntimeSelection/)
assert.match(router, /["']\/agent-nodes["']/)
assert.match(appSidebar, /sidebar\.navigation\.agentNodes/)
assert.match(agentNodePage, /getAgentEvolutionProjection/)
assert.match(agentNodePage, /resolveAgentEvolutionWorkspaceId\(currentWorkspace\)/)
assert.match(sidebar, /resolveAgentEvolutionWorkspaceId\(currentWorkspace\)/)
assert.match(agentNodePage, /<AgentNodeManagementView/)
assert.match(agentNodePage, /matchesAgentNodeProjectionTarget/)
assert.match(agentNodePage, /projectionTargetKey === targetKey/)
assert.match(agentNodePage, /disabled=\{conversations\.length === 0 \|\| isMutationBusy\}/)
assert.match(agentNodePage, /subscribeAgentEvolutionChanged/)
assert.match(agentNodeView, /updateAgentDefinitionTrial/)
assert.match(agentNodeView, /updateAgentDefinitionDefault/)
assert.match(agentNodeView, /runRuntimeLabCommand/)
assert.match(agentNodeView, /publishAgentEvolutionChanged/)
assert.match(sidebar, /subscribeAgentEvolutionChanged/)
assert.match(sidebar, /publishAgentEvolutionChanged/)
assert.match(sidebar, /agentEvolutionRequestRef/)
assert.match(sidebar, /requestId !== agentEvolutionRequestRef\.current/)
assert.match(agentEvolutionInvalidation, /CustomEvent<AgentEvolutionChangedDetail>/)
assert.doesNotMatch(chatHeader, /Runtime Lab|onOpenAgentEvolution/)
assert.match(
  sidebar,
  /if \(!accessToken \|\| !currentWorkspace\)[\s\S]{0,500}sandboxOptionsLoadedRef\.current = false/,
  "workspace hydration must keep sandbox availability pending instead of publishing an authoritative empty catalog"
)
assert.match(
  sidebar,
  /sandboxOptionsRequestRef\.current = requestId[\s\S]{0,500}sandboxOptionsLoadedRef\.current = false[\s\S]{0,500}setIsRefreshingSandboxOptions\(true\)/,
  "a workspace-scoped sandbox refresh must fence history reconciliation until its catalog arrives"
)
assert.match(composerRuntimeSelection, /runtime-selection-draft/)
assert.match(composerRuntimeSelection, /RUNTIME_SELECTION_DRAFT_VERSION/)
assert.match(
  chatComposer,
  /!nextValue &&[\s\S]{0,300}!sandboxOptions\.some/,
  "sandbox catalog hydration must not be persisted as an explicit no-sandbox user choice"
)
assert.match(composerRuntimeSelection, /writeCanonicalComposerRuntimeSelection/)
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
