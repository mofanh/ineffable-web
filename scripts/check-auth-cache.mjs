import assert from "node:assert/strict"
import { clearApiResourceCache, getApiResourceEntry, loadApiResource } from "../src/lib/app/api-resource-cache.ts"

for (const fails of [false, true]) {
  clearApiResourceCache()
  const entry = getApiResourceEntry("account-data")
  await loadApiResource(entry, async () => "old-account", true, 60_000)
  let settle
  const late = loadApiResource(entry, () => new Promise((resolve, reject) => {
    settle = () => fails ? reject(Error("old session expired")) : resolve("late-old-account")
  }), true, 60_000)
  await Promise.resolve()
  clearApiResourceCache()
  settle()
  assert.equal(await late, null)
  assert.equal(entry.getSnapshot().data, undefined, "late success/error must not resurrect data after logout")
  assert.equal(entry.getSnapshot().error, undefined)
  let reads = 0
  assert.equal(await loadApiResource(getApiResourceEntry("account-data"), async () => { reads++; return "new-account" }, false, 60_000), "new-account")
  assert.equal(reads, 1)
}
console.log("auth cache isolation checks passed")
