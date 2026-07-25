import assert from "node:assert/strict"

const {
  ACTIVE_REFRESH_MIN_INTERVAL_MS,
  BACKGROUND_CONVERSATION_REFRESH_INTERVAL_MS,
  isPageActive,
} = await import("../src/lib/app/page-activity.ts")

assert.equal(isPageActive("visible", true), true)
assert.equal(isPageActive("hidden", true), false)
assert.equal(isPageActive("visible", false), false)
assert.ok(ACTIVE_REFRESH_MIN_INTERVAL_MS >= 1_000)
assert.ok(BACKGROUND_CONVERSATION_REFRESH_INTERVAL_MS >= 5_000)

console.log("page activity polling policy checks passed")
