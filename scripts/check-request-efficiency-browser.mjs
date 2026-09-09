import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  const errors = []; page.on("pageerror", error => errors.push(error.message))
  const requests = []; let label = "initial.md", failed = false
  await page.route("**/gateway/v1/workspaces/*/search?*", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)
    requests.push(id)
    await new Promise(resolve => setTimeout(resolve, 120))
    await route.fulfill({ status: failed ? 503 : id === "workspace-b" ? 404 : 200,
      contentType: "application/json", body: JSON.stringify(failed ? { error: "fixture offline" } : id === "workspace-b" ? { error: "parent folder not found" } : {
        matches: [{ object: { id: "file-a", kind: "file", path: `system/agents/${label}`, name: label } }], next_cursor: null,
      }) })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/request-efficiency-fixture.html`)
  const input = page.getByRole("textbox").first(); await input.waitFor()
  assert.equal(requests.length, 0, "mount does not scan workspaces")
  await input.fill("@")
  await page.getByRole("status").filter({ hasText: /加载|Loading/ }).waitFor()
  await page.getByRole("button", { name: /initial.md/ }).waitFor()
  assert.equal(requests.length, 2)
  await input.fill(""); await input.fill("@")
  await page.getByRole("button", { name: /initial.md/ }).waitFor()
  assert.equal(requests.length, 2, "opening again reuses positive and negative cache")
  label = "updated.md"
  await page.evaluate(() => window.efficiencyFixture.change())
  await page.getByRole("button", { name: /updated.md/ }).waitFor()
  assert.equal(requests.length, 3, "file change invalidates only affected workspace")
  failed = true
  await page.evaluate(() => window.efficiencyFixture.change())
  await page.getByRole("alert").filter({ hasText: "fixture offline" }).waitFor()
  failed = false
  await page.getByRole("button", { name: /重试|Retry/ }).click()
  await page.getByRole("button", { name: /updated.md/ }).waitFor()
  const beforeAuth = requests.length
  await page.evaluate(() => window.efficiencyFixture.setToken("fixture-b"))
  await page.getByRole("status").filter({ hasText: /加载|Loading/ }).waitFor()
  await page.getByRole("button", { name: /updated.md/ }).waitFor()
  assert.equal(requests.length, beforeAuth + 2, "new auth identity cannot reuse old directory")
  assert.deepEqual(errors, [])
  console.log("Request efficiency browser checks passed: no eager search, loading, mention options, cache, mutation invalidation, visible error/retry, auth switch")
} finally { await browser?.close(); await server.close() }
