import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { ConversationPageLoader } from "../src/features/chat/model/conversation-page-loader.ts"
import { AgentDescriptorDirectory } from "../src/features/chat/model/agent-descriptor-directory.ts"
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const loader = new ConversationPageLoader()
let calls = 0
let gate = deferred()
const read = () => { calls++; return gate.promise }
const a = loader.load("user/a", read), b = loader.load("user/a", read)
assert.equal(calls, 1)
const fresh = loader.load("user/a", read, true)
assert.equal(calls, 1)
const oldGate = gate; gate = deferred(); oldGate.resolve("old")
assert.equal(await a, "old"); assert.equal(await b, "old")
await Promise.resolve(); assert.equal(calls, 2)
gate.resolve("canonical"); assert.equal(await fresh, "canonical")
assert.equal(await loader.load("user/a", async () => "new"), "new")
await assert.rejects(loader.load("user/a", async () => { throw Error("network") }))
assert.equal(await loader.load("user/a", async () => "retry"), "retry")
const held = deferred(); const one = loader.load("user/a", () => held.promise)
assert.equal(await loader.load("other-user/a", async () => "other"), "other")
assert.equal(await loader.load("user/b", async () => "b"), "b"); held.resolve("a"); await one

// Invoke the production callbacks: initial hydration and page-active catchup overlap.
const source = readFileSync(new URL("../src/features/chat/gateway-chat-sidebar.tsx", import.meta.url), "utf8")
const ast = ts.createSourceFile("sidebar.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function callback(name, scope) {
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer.arguments[0].getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast); assert.ok(expression, name)
  const code = ts.transpile(`const callback = ${expression}`, { target: ts.ScriptTarget.ES2022 })
  return new Function("scope", `with(scope) { ${code}; return callback }`)(scope)
}
let messages = 0, details = 0
const scope = {
  accessToken: "fixture", currentConversationIdRef: { current: "a" }, messageProjectionRequestRef: { current: 0 },
  setIsLoadingMessages() {}, CONVERSATION_MESSAGES_PAGE_LIMIT: 40,
  latestPageLoader: new ConversationPageLoader(),
  getConversationMessages: () => { messages++; return new Promise(() => {}) },
  getConversation: () => { details++; return new Promise(() => {}) },
  catchupInFlightRef: { current: false }, activeStreamConversationIdRef: { current: null },
  streamStatusRef: { current: "idle" }, conversationSeqRef: { current: new Map() }, hydratedConversationIdRef: { current: null },
}
scope.syncLatestConversationMessagesPage = callback("syncLatestConversationMessagesPage", scope)
void scope.syncLatestConversationMessagesPage("a")
void callback("syncConversationIfBehind", scope)("a")
assert.deepEqual({ messages, details }, { messages: 1, details: 1 })

let clock = 0, searches = 0, fail = false
const missing = Error("missing")
const directory = new AgentDescriptorDirectory(async () => {
  searches++
  if (fail) throw Error("offline")
  throw missing
}, error => error === missing, () => clock)
const spaces = [{ id: "a", name: "A" }]
assert.equal(searches, 0)
assert.deepEqual(await directory.load(spaces), [])
assert.deepEqual(await directory.load(spaces), [])
assert.equal(searches, 1)
clock = 30_001
await directory.load(spaces); assert.equal(searches, 2)
directory.invalidate("a"); fail = true
await assert.rejects(directory.load(spaces), /offline/)
await Promise.resolve(); fail = false
await directory.load(spaces); assert.equal(searches, 4)

const stale = deferred(); let loads = 0
const changing = new AgentDescriptorDirectory(() => ++loads === 1 ? stale.promise : Promise.resolve({ matches: [{ object: { kind: "file", path: "system/agents/new.md", name: "new" } }] }), () => false)
const staleLoad = changing.load(spaces)
changing.invalidate("a")
assert.equal((await changing.load(spaces))[0].label, "new")
stale.resolve({ matches: [] }); await staleLoad
assert.equal((await changing.load(spaces))[0].label, "new")
console.log("Request efficiency checks passed: production callbacks, handoff freshness, auth isolation, retry, lazy/negative cache and invalidation")
