import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture, apiRequests, countPath } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{
  name: "auth-entry-observer", enforce: "pre", transform(code, id) {
    if (!id.split("?")[0].endsWith("/src/features/auth/app-session.tsx")) return
    return { code: code.replace("<AuthSessionContext.Provider value={authValue}>", "<AuthSessionContext.Provider value={authValue}>{(window.__entryAuth = authValue, window.__entrySelect = selectConversation, window.__entryConversation = currentConversationId, null)}"), map: null }
  },
}] })
function gate() {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}
async function within(promise, label) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 10000) })]) }
  finally { clearTimeout(timer) }
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const scenarios = ["selected", "removed", "draft", "selection-change", "session-change", "chunk-failure", "unauthenticated"]
  assert.ok(!process.argv[2] || scenarios.includes(process.argv[2]))
  const cases = ["/", "/automation"].flatMap(entryPath =>
    (process.argv[2] ? [process.argv[2]] : scenarios).map(scenario => ({ entryPath, scenario })))
  for (const { entryPath, scenario } of cases) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: "en-US" })
    const fixture = await installShellFixture(page, false)
    await page.addInitScript(scenario => {
      if (scenario === "draft") localStorage.removeItem("ineffable.chat.conversation_id")
      else localStorage.setItem("ineffable.chat.conversation_id", "old")
      if (scenario !== "draft") localStorage.removeItem("ineffable.chat.new_conversation_draft")
    }, scenario)
    const meEntered = gate(), meRelease = gate(), listEntered = gate(), listRelease = gate(), appEntered = gate()
    let moduleRequests = 0, listRequests = 0
    await page.route("**/src/App.tsx*", async route => {
      moduleRequests++; appEntered.release()
      if (scenario === "chunk-failure") return route.abort("failed")
      await route.continue()
    })
    await page.route("**/gateway/v1/auth/me", async route => {
      if (route.request().headers().authorization !== "Bearer fixture-token-b") {
        meEntered.release(); await meRelease.promise
        if (scenario === "unauthenticated") return route.fulfill({ status: 401, json: { error: "Invalid session" } })
      }
      await route.fallback()
    })
    await page.route("**/gateway/v1/conversations/list*", async route => {
      listRequests++
      if (route.request().headers().authorization === "Bearer fixture-token-b") return route.fulfill({ json: { conversations: [{ id: "new-account", title: "New account conversation" }] } })
      listEntered.release(); await listRelease.promise
      await route.fulfill({ json: { conversations: scenario === "removed" ? [] : [{ id: "old", title: "Old conversation" }, ...(scenario === "selection-change" && listRequests > 1 ? [{ id: "chosen", title: "Chosen conversation" }] : [])] } })
    })
    await page.route("**/gateway/v1/automations*", route => route.fulfill({ json: { automations: [], runs: [] } }))
    try {
      await page.goto(origin + entryPath)
      await within(meEntered.promise, "auth request did not start")
      assert.equal(moduleRequests, 0, "unverified local token must not preload App")
      assert.equal(await page.locator('[data-slot="sidebar-trigger"]').count(), 0)
      meRelease.release()
      if (scenario === "unauthenticated") {
        await page.waitForFunction(() => window.__entryAuth?.status === "unauthenticated")
        assert.equal(moduleRequests, 0)
        assert.equal(listRequests, 0)
      } else {
        await within(listEntered.promise, "initial list did not start")
        await within(appEntered.promise, "authenticated entry must overlap App module with held list")
        assert.equal(listRequests, 1, "preload does not duplicate bootstrap list")
        assert.equal(await page.evaluate(() => window.__entryAuth.isBootstrapping), true)
        assert.equal(await page.locator('[data-slot="sidebar-trigger"]').count(), 0, "preload must not mount App before existing bootstrap")
        assert.equal(countPath(apiRequests(fixture.requests), "/messages"), 0, "preloading must not read an unconfirmed stored selection")
        if (scenario === "selection-change") await page.evaluate(() => window.__entrySelect("chosen"))
        if (scenario === "session-change") {
          await page.evaluate(() => {
            localStorage.setItem("ineffable.auth.session_id", "fixture-session-b")
            localStorage.setItem("ineffable.auth.access_token", "fixture-token-b")
            window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
          })
          await page.waitForFunction(() => window.__entryAuth?.currentUser?.id === "user-b" && !window.__entryAuth.isBootstrapping)
        }
        listRelease.release()
        if (scenario === "chunk-failure") {
          await page.getByRole("button", { name: "Refresh page", exact: true }).waitFor()
          assert.equal(await page.locator('[data-slot="sidebar-trigger"]').count(), 0)
        } else {
          await page.locator('[data-slot="sidebar-trigger"]').waitFor()
          await page.waitForFunction(() => !window.__entryAuth.isBootstrapping)
          const expected = scenario === "removed" || scenario === "draft" ? null : scenario === "selection-change" ? "chosen" : scenario === "session-change" ? "new-account" : "old"
          await page.waitForFunction(id => window.__entryConversation === id, expected)
          assert.equal(countPath(apiRequests(fixture.requests), "/models/profiles"), 0, "closed chat remains unloaded")
          if (scenario === "session-change") assert.equal(await page.evaluate(() => window.__entryAuth.currentUser.id), "user-b")
        }
        assert.equal(moduleRequests, 1, "preload and route reuse one module request, including rejection")
        // The existing Automation landing page refreshes the list once after mounting.
        const expectedLists = scenario === "chunk-failure" ? 1 : scenario === "session-change" ? 3 : 2
        if (scenario !== "chunk-failure") await page.getByRole("heading", { name: /automation/i }).first().waitFor()
        assert.equal(listRequests, expectedLists, `${scenario}: only bootstrap and existing landing-page refresh`)
      }
      assert.deepEqual(fixture.errors, [], scenario)
      assert.deepEqual(fixture.unexpected, [], scenario)
      console.log(`auth entry: ${entryPath} ${scenario} passed`)
    } catch (error) {
      console.error({ entryPath, scenario, url: page.url(), text: await page.locator("body").innerText(), errors: fixture.errors, listRequests, moduleRequests })
      throw error
    } finally {
      meRelease.release(); listRelease.release(); await page.close()
    }
  }
} finally { await browser?.close(); await server.close() }
