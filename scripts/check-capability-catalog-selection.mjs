import assert from "node:assert/strict"

import {
  capabilityCatalogFamilies,
  filterCapabilityCatalog,
  groupCapabilityCatalog,
  updateSelectedCapabilityKeys,
} from "../src/features/chat/model/capability-catalog-selection.ts"

const entries = [
  {
    key: { provider_id: "backend", capability_id: "read" },
    provider_name: "Backend",
    model_tool_name: "read_file",
    name: "read_file",
    description: "Read files",
    kind: "backend",
    family: "workspace.files",
  },
  {
    key: { provider_id: "web", capability_id: "search" },
    provider_name: "Research",
    model_tool_name: "web_search",
    name: "web_search",
    description: "Search public sources",
    kind: "web",
    family: "web.research",
  },
]

assert.deepEqual(capabilityCatalogFamilies(entries), ["web.research", "workspace.files"])
assert.deepEqual(filterCapabilityCatalog(entries, "RESEARCH"), [entries[1]])
assert.deepEqual(filterCapabilityCatalog(entries, "read files"), [entries[0]])
assert.deepEqual(groupCapabilityCatalog(entries), [
  { family: "workspace.files", items: [entries[0]] },
  { family: "web.research", items: [entries[1]] },
])
assert.deepEqual(updateSelectedCapabilityKeys([], entries[0], true), [entries[0].key])
assert.deepEqual(
  updateSelectedCapabilityKeys([entries[0].key], entries[0], true),
  [entries[0].key]
)
assert.deepEqual(updateSelectedCapabilityKeys([entries[0].key], entries[0], false), [])

const largeCatalog = Array.from({ length: 80 }, (_, index) => ({
  ...entries[0],
  key: { provider_id: "backend", capability_id: `tool_${index}` },
}))
const selected = largeCatalog.reduce(
  (keys, entry) => updateSelectedCapabilityKeys(keys, entry, true),
  []
)
assert.deepEqual(selected, largeCatalog.map((entry) => entry.key))
assert.equal(updateSelectedCapabilityKeys(selected, largeCatalog[79], false).length, 79)

console.log("capability catalog selection checks passed")
