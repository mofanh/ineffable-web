import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

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
assert.match(
  sidebar,
  /new Map<string, \{ requested: boolean \}>\(\)/,
  "handoffs need stable object identity so stale requests cannot settle replacements"
)
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
  /getAgentEvolutionProjection\(accessToken, conversationId, workspaceId\)[\s\S]{0,180}pendingAgentIterationHandoffsRef\.current\.get\(targetKey\) !== handoff[\s\S]{0,120}pendingAgentIterationHandoffsRef\.current\.delete\(targetKey\)/,
  "handoff reconciliation must settle its own identity independently of global hydration generations"
)
assert.match(
  sidebar,
  /\.catch\(\(caught\) => \{[\s\S]{0,180}pendingAgentIterationHandoffsRef\.current\.get\(targetKey\) !== handoff[\s\S]{0,120}pendingAgentIterationHandoffsRef\.current\.delete\(targetKey\)/,
  "failed reconciliation must release its own pending handoff even after navigation"
)
// Check actual function/catch ownership, not a character budget that changes
// when unrelated capability reconciliation is inserted before the handoff.
function descendants(node, predicate) {
  const result = []
  function visit(child) {
    if (predicate(child)) result.push(child)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return result
}

function checkSubmissionHandoffs(source) {
  const file = ts.createSourceFile("sidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assert.equal(file.parseDiagnostics.length, 0, "handoff source must parse")
  function unique(predicate, message) {
    const matches = descendants(file, predicate)
    assert.equal(matches.length, 1, message)
    return matches[0]
  }
  function handoff(block, message) {
    // Require the call directly in this body, not a comment, sibling callback,
    // nested function or unreachable conditional branch elsewhere in the file.
    const calls = block.statements.filter(statement => ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      statement.expression.expression.getText(file) === "reconcileAgentIterationHandoff")
    assert.equal(calls.length, 1, message)
    const call = calls[0].expression
    assert.deepEqual(call.arguments.map(argument => argument.getText(file)),
      ["targetConversationId", "submissionAgentEvolutionWorkspaceId"], message)
    return calls[0]
  }
  const accepted = unique(node => ts.isVariableDeclaration(node) && node.name.getText(file) === "acceptSubmission",
    "first-send acceptance must have a unique callback")
  assert.ok(accepted.initializer && ts.isArrowFunction(accepted.initializer) && ts.isBlock(accepted.initializer.body))
  const acceptedCall = handoff(accepted.initializer.body, "accepted and queued first sends must reconcile the handoff")
  const prime = unique(node => ts.isCatchClause(node) && node.variableDeclaration?.name.getText(file) === "primeError",
    "cursor priming must have a unique failure handler")
  const primeCall = handoff(prime.block, "cursor priming failure must reconcile the handoff")
  const send = unique(node => ts.isCatchClause(node) && node.variableDeclaration?.name.getText(file) === "sendError" &&
    descendants(node.parent.tryBlock, child => ts.isCallExpression(child) && child.expression.getText(file) === "streamConversationSend").length === 1,
  "input admission must have a unique failure handler")
  const sendCall = handoff(send.block, "a send failure before acceptance must reconcile the handoff")
  const guard = send.block.statements[0]
  assert.ok(ts.isIfStatement(guard) && guard.expression.getText(file) === "accepted" &&
    ts.isReturnStatement(guard.thenStatement) && guard.thenStatement.expression?.kind === ts.SyntaxKind.TrueKeyword,
  "an observation error after admission must return success before failure reconciliation")
  assert.ok(sendCall.getStart(file) > guard.end)
  return [acceptedCall, primeCall, sendCall, guard].map(node => [node.getStart(file), node.end])
}

const protectedRanges = checkSubmissionHandoffs(sidebar)
// Negative controls: removing any real call or the post-ACK guard must fail,
// even though other calls and the helper remain in the same source file.
for (const [start, end] of protectedRanges) {
  assert.throws(() => checkSubmissionHandoffs(sidebar.slice(0, start) + sidebar.slice(end)),
    { code: "ERR_ASSERTION" }, "missing handoff or post-ACK guard must be detected")
}

console.log("agent iteration first-send handoff checks passed")
