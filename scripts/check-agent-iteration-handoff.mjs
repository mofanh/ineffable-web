import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { agentNodeManagementTargetKey } from "../src/features/chat/model/agent-node-management.ts"

const sidebar = readFileSync(
  new URL("../src/features/chat/gateway-chat-sidebar.tsx", import.meta.url),
  "utf8"
)

assert.notEqual(
  agentNodeManagementTargetKey("conversation-1", undefined),
  agentNodeManagementTargetKey("conversation-1", "workspace-1"),
  "a handoff must not cross user and team workspace scopes"
)
assert.notEqual(
  agentNodeManagementTargetKey("conversation-1", "workspace-1"),
  agentNodeManagementTargetKey("conversation-2", "workspace-1"),
  "a handoff must not cross conversations"
)
assert.match(sidebar, /pendingAgentIterationHandoffsRef = React\.useRef\(new Map<string, boolean>\(\)\)/)
assert.match(
  sidebar,
  /pendingAgentIterationHandoffsRef\.current\.has\(requestTargetKey\)[\s\S]{0,420}setIsAgentIterationLoading\(true\)[\s\S]{0,80}return/,
  "matching hydration must preserve and lock the pending preference"
)
assert.match(
  sidebar,
  /pendingAgentIterationHandoffsRef\.current\.set\([\s\S]{0,420}selectConversationTarget\(targetConversationId\)/,
  "the handoff must be registered before selecting the newly created conversation"
)
assert.match(
  sidebar,
  /pendingAgentIterationHandoffsRef\.current\.delete\(requestTargetKey\)[\s\S]{0,160}setAgentEvolution\(projection\)/,
  "an authoritative projection must settle the pending handoff"
)
assert.match(
  sidebar,
  /const acceptSubmission[\s\S]{0,900}reconcileAgentIterationHandoff\(/,
  "accepted and queued first sends must reconcile the handoff"
)
assert.match(
  sidebar,
  /catch \(primeError\)[\s\S]{0,500}reconcileAgentIterationHandoff\(/,
  "cursor priming failure must reconcile the handoff"
)
assert.match(
  sidebar,
  /catch \(streamError\)[\s\S]{0,220}if \(!accepted\)[\s\S]{0,220}reconcileAgentIterationHandoff\(/,
  "a send failure before acceptance must reconcile the handoff"
)

console.log("agent iteration first-send handoff checks passed")
