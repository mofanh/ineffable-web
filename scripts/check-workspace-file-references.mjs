import assert from "node:assert/strict"
import { fileMentionAt, splitFileReferences, joinFileReferences, normalizeReferencePaste, referenceMarkdown, referenceUri, mergeReferences } from "../src/lib/workspace-file-reference.ts"
const a = { workspaceId: "11111111-1111-1111-1111-111111111111", objectId: "22222222-2222-2222-2222-222222222222", versionId: "33333333-3333-3333-3333-333333333333", label: "空间 A/报告 [中文](1).pdf" }
const b = { ...a, workspaceId: "44444444-4444-4444-4444-444444444444", objectId: "55555555-5555-5555-5555-555555555555", label: "空间 B/报告 [中文](1).pdf" }
const text = "比较这些资料，保留后面的文字。"
assert.deepEqual(splitFileReferences(joinFileReferences(text, [a, b, a])), { text, references: [a, b] })
for (const body of ["line\n", "line\n\n", "\n", "", "line\nnext line\n"]) {
  assert.equal(splitFileReferences(joinFileReferences(body, [a, b])).text, body, "references preserve user newlines")
}
assert.deepEqual(mergeReferences([a], [b, a]), [a, b])
const copied = `${referenceMarkdown(a, "https://local.test")} and ${referenceMarkdown(b, "https://local.test")}`
assert.deepEqual(splitFileReferences(normalizeReferencePaste(copied, "https://local.test")).references, [a, b])
assert.equal(normalizeReferencePaste(copied, "https://other.test"), copied)
assert.equal(normalizeReferencePaste("ordinary https://local.test/example", "https://local.test"), "ordinary https://local.test/example")
assert.equal(splitFileReferences("[fake](workspace://bad/object/version)").references.length, 0)
assert.equal(splitFileReferences(`[fake](${referenceUri(a)}/suffix)`).references.length, 0)
const trigger = fileMentionAt("前文 @报 后文", 5)
assert.deepEqual(trigger, { start: 3, end: 5, query: "报" })
assert.equal(fileMentionAt("name@example.com", 16), null)
console.log("Workspace references: immutable multi-space identities, escaping, dedupe, same-origin clipboard and cursor selection passed")
