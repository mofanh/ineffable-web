import assert from "node:assert/strict"

const values = new Map()
const sessionStorage = {
  getItem(key) {
    return values.get(key) ?? null
  },
  setItem(key, value) {
    values.set(key, String(value))
  },
  removeItem(key) {
    values.delete(key)
  },
}

globalThis.window = { sessionStorage }

const {
  clearConversationResumeState,
  readConversationResumeState,
  writeConversationResumeState,
} = await import("../src/features/chat/model/conversation-resume.ts")

const storageKey = "ineffable:conversation-stream-resume"

values.set(
  storageKey,
  JSON.stringify({
    conversationId: "conversation-a",
    runId: "run-a",
    afterSeq: 7,
  })
)

assert.deepEqual(readConversationResumeState("conversation-a"), {
  conversationId: "conversation-a",
  runId: "run-a",
  afterSeq: 7,
})

writeConversationResumeState({
  conversationId: "conversation-b",
  runId: "run-b",
  afterSeq: 11,
})

assert.deepEqual(readConversationResumeState("conversation-a"), {
  conversationId: "conversation-a",
  runId: "run-a",
  afterSeq: 7,
})
assert.deepEqual(readConversationResumeState("conversation-b"), {
  conversationId: "conversation-b",
  runId: "run-b",
  afterSeq: 11,
})

const migrated = JSON.parse(values.get(storageKey))
assert.equal(migrated.version, 2)
assert.deepEqual(Object.keys(migrated.conversations).sort(), [
  "conversation-a",
  "conversation-b",
])

clearConversationResumeState("conversation-a")
assert.equal(readConversationResumeState("conversation-a"), null)
assert.equal(readConversationResumeState("conversation-b")?.runId, "run-b")

clearConversationResumeState("conversation-b")
assert.equal(values.has(storageKey), false)

values.set(storageKey, "{invalid")
assert.equal(readConversationResumeState("conversation-a"), null)

console.log("conversation resume state checks passed")
