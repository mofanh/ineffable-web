import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
// Exercise the production cache operation with controlled response ordering.
const source = readFileSync(new URL("../src/lib/app/use-api-resource.ts", import.meta.url), "utf8")
const ast = ts.createSourceFile("cache.ts", source, ts.ScriptTarget.Latest, true)
const load = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "loadCachedResource")
assert.ok(load)
const cache = new Map()
const compiled = ts.transpile(load.getText(ast), { target: ts.ScriptTarget.ES2022 })
const loadCachedResource = new Function("apiResourceCache", `${compiled}; return loadCachedResource`)(cache)
for (const fails of [false, true]) {
  cache.clear()
  const options = { cacheKey: "account-data", force: true, staleTime: 60000 }
  await loadCachedResource({ ...options, load: async () => "old-account" })
  let settle
  const late = loadCachedResource({ ...options, load: () => new Promise((resolve, reject) => { settle = () => fails ? reject(Error("old session expired")) : resolve("late-old-account") }) }).catch(() => {})
  cache.clear() // AppSession invalidates cache on logout/account switch.
  settle(); await late
  assert.equal(cache.size, 0, "late success/error must not resurrect data after logout")
  let reads = 0
  const current = await loadCachedResource({ ...options, force: false, load: async () => { reads++; return "new-account" } })
  assert.equal(current, "new-account"); assert.equal(reads, 1)
}
console.log("auth cache isolation checks passed")
