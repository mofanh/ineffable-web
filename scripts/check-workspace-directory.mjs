import assert from "node:assert/strict"
import { buildWorkspaceEntries } from "../src/features/workspace/model/workspace-tree.ts"
const workspace = { id: "w", name: "Workspace" }
const objects = [
  { id: "folder", name: "Notes", path: "Notes", parent_id: null, kind: "folder" },
  { id: "file", name: "a.md", path: "Notes/a.md", parent_id: "folder", kind: "file" },
]
const pages = { "": "root-cursor", Notes: "notes-cursor" }
let entries = buildWorkspaceEntries(workspace, objects, { collapsedEntryIds: new Set(["folder"]), pages })
assert.equal(entries.some(e => e.id === "file"), false)
assert.deepEqual(entries.at(-1).more, { path: "", cursor: "root-cursor" })
entries = buildWorkspaceEntries(workspace, objects, { collapsedEntryIds: new Set(), pages })
assert.equal(entries.find(e => e.id === "file").depth, 1)
assert.deepEqual(entries.find(e => e.more?.path === "Notes").more, { path: "Notes", cursor: "notes-cursor" })
assert.equal(new Set(entries.map(e => e.id)).size, entries.length)
console.log("Workspace lazy directory and continuation projection passed")
