import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{
  name: "hydration-observer", enforce: "pre", transform(code, id) {
    if (!id.split("?")[0].endsWith("/src/features/auth/app-session.tsx")) return
    return { code: code.replace("<AuthSessionContext.Provider value={authValue}>", "<AuthSessionContext.Provider value={authValue}>{(window.__auth = authValue, window.__conversation = currentConversationId, null)}"), map: null }
  },
}] })
function gate() { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
async function within(promise) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("hydration test deadline")), 12000) })]) }
  finally { clearTimeout(timer) }
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const entry of ["login", "register", "storage"]) for (const phase of ["me", "list"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" })
    page.setDefaultTimeout(12000)
    const fixture = await installShellFixture(page, true)
    const entered = gate(), release = gate(), recoveryEntered = gate(), recoveryRelease = gate()
    let failed = false, recovered = false, backgroundFailure = false
    await page.route("**/gateway/v1/automations*", route => route.fulfill({ json: { automations: [], runs: [] } }))
    await page.route("**/gateway/v1/conversations/messages*", route => route.fulfill({ json: { messages: [], next_seq: 0, page: { has_older: false, before: null } } }))
    await page.route("**/gateway/v1/conversations/get*", route => route.fulfill({ json: { id: "new-account", title: "Existing conversation", current_run: null } }))
    await page.route("**/gateway/v1/conversations/*/pending-inputs*", route => route.fulfill({ json: { pending_inputs: [] } }))
    await page.route("**/gateway/v1/conversations/events*", route => route.fulfill({ json: { events: [], next_seq: 0, has_more: false } }))
    await page.route("**/gateway/v1/plugins/agent-evolution*", route => route.fulfill({ json: {} }))
    if (entry !== "storage") {
      await page.addInitScript(() => { for (const key of ["access_token", "refresh_token", "session_id"]) localStorage.removeItem(`ineffable.auth.${key}`) })
      await page.route(`**/gateway/v1/${entry === "register" ? "users/register" : "auth/login"}`, route => route.fulfill({ json: {
        user: { id: "user-b" }, tokens: { session_id: "fixture-session-b", access_token: "fixture-token-b", refresh_token: "rb", access_expires_at: Date.now() / 1000 + 3600, refresh_expires_at: Date.now() / 1000 + 7200 },
      } }))
    }
    for (const currentPhase of ["me", "list"]) await page.route(currentPhase === "me" ? "**/gateway/v1/auth/me" : "**/gateway/v1/conversations/list*", async route => {
      if (route.request().headers().authorization !== "Bearer fixture-token-b") return route.fallback()
      if (currentPhase === phase && !failed) {
        failed = true; entered.release(); await release.promise
        return route.fulfill({ status: 503, json: { error: "temporary initialization failure" } })
      }
      if (currentPhase === "me") return route.fallback()
      if (backgroundFailure) return route.fulfill({ status: 503, json: { error: "temporary refresh failure" } })
      if (!recovered) { recoveryEntered.release(); await recoveryRelease.promise; recovered = true }
      return route.fulfill({ json: { conversations: [{ id: "new-account", title: "Existing conversation", current_run: null }] } })
    })
    try {
      await page.goto(origin + (entry === "storage" ? "/automation" : `/${entry}`))
      const composer = page.locator('[data-side="right"] textarea').first()
      if (entry === "storage") {
        await composer.waitFor(); await page.waitForLoadState("networkidle")
        await page.evaluate(() => {
          localStorage.setItem("ineffable.auth.session_id", "fixture-session-b")
          localStorage.setItem("ineffable.auth.access_token", "fixture-token-b")
          localStorage.removeItem("ineffable.chat.new_conversation_draft")
          window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
        })
      } else {
        await page.waitForFunction(() => window.__auth?.status === "unauthenticated")
        await page.evaluate(entry => { window.__action = window.__auth[entry]({ email: "fixture@example.test", password: "test-password", display_name: "Fixture", email_verification_code: "123456" }).then(() => "resolved", () => "rejected") }, entry)
      }
      await within(entered.promise)
      assert.equal(await composer.count(), 0)
      release.release()
      await page.waitForFunction(() => window.__auth.status === "loading" && !window.__auth.isBootstrapping)
      assert.equal(await composer.count(), 0, "first failure must not expose an unreconciled composer")
      if (entry !== "storage") assert.equal(await page.evaluate(() => window.__action), "rejected")
      // Reuse the real online-recovery entry instead of waiting ten seconds for its timer.
      await page.evaluate(() => window.dispatchEvent(new Event("online")))
      await within(recoveryEntered.promise)
      assert.equal(await composer.count(), 0, "retry must finish selection before mounting")
      recoveryRelease.release()
      await page.waitForFunction(() => window.__conversation === "new-account" && !window.__auth.isBootstrapping)
      await composer.waitFor()
      await page.waitForLoadState("networkidle")
      await composer.fill("RECONCILED_DRAFT")
      await composer.evaluate(element => { window.__composer = element })
      backgroundFailure = true
      assert.equal(await page.evaluate(() => window.__auth.refreshAppData()), false)
      await page.waitForFunction(() => !window.__auth.isBootstrapping)
      assert.equal(await page.evaluate(() => window.__auth.status), "authenticated")
      assert.equal(await composer.evaluate(element => element === window.__composer), true)
      assert.equal(await composer.inputValue(), "RECONCILED_DRAFT")
      backgroundFailure = false
      assert.equal(await page.evaluate(() => window.__auth.refreshAppData()), true)
      assert.equal(await composer.inputValue(), "RECONCILED_DRAFT")
      assert.deepEqual(fixture.errors, [])
      assert.deepEqual(fixture.unexpected, [])
      console.log(`auth hydration: ${entry} ${phase} failure/retry and initialized draft passed`)
    } finally { release.release(); recoveryRelease.release(); await page.close() }
  }
} finally { await browser?.close(); await server.close() }
