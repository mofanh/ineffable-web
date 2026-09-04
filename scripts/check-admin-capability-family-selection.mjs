import assert from "node:assert/strict";

import {
  filterCapabilityFamilies,
  selectEveryCurrentCapabilityFamily,
  toggleAllowedCapabilityFamily,
  unavailableSelectedCapabilityFamilies,
} from "../src/pages/system-management/capability-family-selection.ts";

const entries = [
  {
    family: "workspace.files",
    display_name: "Workspace files",
    description: "Read and write durable workspace objects.",
  },
  {
    family: "web.research",
    display_name: "Web research",
    description: "Search public sources.",
  },
];

assert.deepEqual(filterCapabilityFamilies(entries, "workspace"), [entries[0]]);
assert.deepEqual(filterCapabilityFamilies(entries, "PUBLIC SOURCES"), [entries[1]]);
assert.deepEqual(filterCapabilityFamilies(entries, "web.research"), [entries[1]]);

assert.deepEqual(
  toggleAllowedCapabilityFamily([], "web.research", true),
  ["web.research"],
);
assert.deepEqual(
  toggleAllowedCapabilityFamily(
    ["web.research"],
    "workspace.files",
    true,
  ),
  ["web.research", "workspace.files"],
);
assert.deepEqual(
  toggleAllowedCapabilityFamily(
    ["web.research", "workspace.files"],
    "web.research",
    false,
  ),
  ["workspace.files"],
);

const historical = "vendor.retired";
assert.deepEqual(
  unavailableSelectedCapabilityFamilies(
    ["workspace.files", historical],
    entries,
  ),
  [historical],
);
assert.deepEqual(selectEveryCurrentCapabilityFamily(entries, [historical]), [
  historical,
  "web.research",
  "workspace.files",
]);

console.log("admin capability-family selection checks passed");
