import assert from "node:assert/strict"
import { existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { installShellFixture, apiRequests, countPath, waitForShell, measureToggle, workspace, imageId, image } from "./shell-performance-fixture.mjs"

const production = process.argv.includes("--production")
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required")
const instrumented = new Map([
  ["src/app/app-shell.tsx", ["function WorkbenchContent() {", "shell"]],
  ["src/features/workspace/app-sidebar.tsx", ["export function AppSidebar({ children, ...props }: React.ComponentProps<typeof Sidebar>) {", "navigation"]],
  ["src/features/chat/gateway-chat-sidebar.tsx", ["}: GatewayChatSidebarProps) {", "chat"]],
])
const server = production
  ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
  : await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{ name: "shell-measure", enforce: "pre", transform(source, id) {
    const path = id.split("?")[0].slice(process.cwd().length + 1)
    let code = source
    const counter = instrumented.get(path)
    if (counter) code = code.replace(counter[0], `${counter[0]}\nwindow.__shellRenders.${counter[1]}++;`)
    if (path === "src/components/ui/sidebar.tsx") {
      const geometryRead = "const rect = element.getBoundingClientRect()"
      assert.ok(code.includes(geometryRead), "instrument Sidebar focus-return geometry")
      code = code.replace(geometryRead, `window.__shellFocusReturnReads++;\n${geometryRead}`)
    }
    // Only expose the real selection command in this test build; it still updates
    // the production identity/version used by both sender and receiver.
    if (path === "src/features/auth/app-session.tsx") code = code.replace("<AuthSessionContext.Provider value={authValue}>", "<AuthSessionContext.Provider value={authValue}>{(window.__shellSelectConversation = selectConversation, window.__shellSelection = getConversationSelectionIdentity, window.__shellRefreshConversations = refreshConversationList, null)}")
    if (path === "src/features/chat/gateway-chat-sidebar.tsx") code = code.replace("onStartNewChat={startNewChat}", "onStartNewChat={(window.__shellStartNewChat = startNewChat)}")
    return { code, map: null }
  } }] })
const results = { mode: production ? "production" : "development", scenarios: [] }
const output = process.env.INEFFABLE_SHELL_BENCHMARK_OUTPUT || join(tmpdir(), `ineffable-shell-${results.mode}.json`)
let browser
try {
  if (!production) await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const open of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await installShellFixture(page, open)
    await page.goto(`${url}/channels`)
    await waitForShell(page)
    {
      // The eager chat mount has its own async initialization. On slower CI
      // runners its final state updates can land inside the first left toggle,
      // even though the toggle did not cause those renders.
      await page.locator('[data-slot="chat-workbench"] textarea').first().waitFor({ state: "attached" })
      await page.waitForLoadState("networkidle")
      const chatSettled = await page.evaluate(async () => {
        let lastRenders = window.__shellRenders.chat
        let idleSince = performance.now()
        const deadline = idleSince + 10_000
        while (performance.now() - idleSince < 300 && performance.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50))
          if (window.__shellRenders.chat !== lastRenders) {
            lastRenders = window.__shellRenders.chat
            idleSince = performance.now()
          }
        }
        return performance.now() - idleSince >= 300
      })
      assert.ok(chatSettled, "chat initialization settles before measuring left toggles")
    }
    const initialApi = apiRequests(fixture.requests)
    const scenario = { open, requests: fixture.requests.length, api: initialApi.map(r => r.path), toggles: [] }
    results.scenarios.push(scenario)
    for (let i = 0; i < 4; i++) {
      const before = apiRequests(fixture.requests).length
      const sample = await measureToggle(page)
      scenario.toggles.push(sample)
      assert.equal(apiRequests(fixture.requests).length, before, "left toggle does not reload data")
      assert.ok(Math.abs(sample.gap - (i % 2 ? 256 : 0)) < 1, "the original layout animation settles")
    }
    writeFileSync(output, JSON.stringify(results, null, 2))
    for (const sample of scenario.toggles) {
      if (!production) {
        assert.ok(sample.renders.shell <= 4, `no per-frame shell renders: ${JSON.stringify(sample.renders)}`)
        assert.equal(sample.renders.navigation, 0, "left animation does not render the workspace tree owner")
        assert.ok(sample.renders.chat <= 2, "one shared sidebar context transition, never per-frame chat renders")
        assert.equal(sample.focusReturnReads, 0, "ordinary toggles do not measure focus-return targets")
      }
      assert.ok(sample.frames >= 10 && sample.p95 < 100, `sidebar frame budget: ${JSON.stringify(sample)}`)
    }
    const responseTimes = scenario.toggles.map(sample => sample.firstFrameMs).sort((a, b) => a - b)
    assert.ok((responseTimes[1] + responseTimes[2]) / 2 < 100, "median toggle-to-first-frame stays below 100 ms")
    assert.equal(countPath(initialApi, "/workspace-invitations/incoming"), 1, "sidebar shares the canonical invitation resource")
    assert.equal(countPath(initialApi, "/models/profiles"), 1, "central chat initializes regardless of retired sidebar preference")
    const composer = page.locator('[data-slot="chat-workbench"] textarea').first()
    assert.equal(await composer.isVisible(), false, "management deep link focuses resources")
    await page.getByRole("button", { name: "Conversations", exact: true }).click()
    await composer.waitFor()
    await composer.fill("KEEP_SIDEBAR_DRAFT")
    await page.waitForLoadState("networkidle")
    const beforeReopen = apiRequests(fixture.requests).length
    const chat = page.locator('[data-slot="chat-workbench"]')
    const node = await composer.elementHandle()
    assert.equal(await chat.isVisible(), true)
    await page.getByRole("button", { name: "Focus resource", exact: true }).click()
    await page.getByRole("button", { name: "Conversations", exact: true }).click()
    assert.equal(await composer.inputValue(), "KEEP_SIDEBAR_DRAFT")
    assert.equal(await node.evaluate(el => el.isConnected), true)
    await page.waitForLoadState("networkidle")
    assert.equal(apiRequests(fixture.requests).length, beforeReopen, "focus/hide do not reload business data or stop execution")
    await page.setViewportSize({ width: 900, height: 900 })
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await page.locator('[data-side="left"][data-compact="true"]').waitFor()
    await page.keyboard.press("Escape")
    await page.locator('[data-side="left"][data-compact="true"]').waitFor({ state: "hidden" })
    assert.equal(await node.evaluate(el => el.isConnected), true)
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
    console.log(`${results.mode}: shell cold load, toggle budget, draft and breakpoints passed (chat initially ${open ? "open" : "closed"})`)
  }

  // Reference handoff must survive a real first lazy mount and reject a selection
  // change while that chunk is still unavailable. No image is queued in the shell.
  for (const scenario of production ? ["success"] : ["reconcile", "success", "selection", "session", "unmount", "timeout"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await installShellFixture(page, false)
    let release, started = false
    const hold = new Promise(resolve => { release = resolve })
    let releaseList
    if (scenario === "reconcile") {
      const listHold = new Promise(resolve => { releaseList = resolve })
      let listReads = 0
      await page.addInitScript(() => localStorage.setItem("ineffable.chat.conversation_id", "removed-conversation"))
      await page.route("**/gateway/v1/conversations/list*", async route => {
        if (++listReads === 1) return route.fulfill({ json: { conversations: [{ id: "removed-conversation", title: "Old conversation", created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" }] } })
        await listHold
        await route.fulfill({ json: { conversations: [] } })
      })
    }
    if (!production) await page.route("**/src/features/chat/gateway-chat-sidebar.tsx*", async route => {
      started = true; await hold; await route.continue()
    })
    await page.goto(`${url}/workspace/${workspace}/objects/${imageId}`)
    const reference = page.getByRole("button", { name: "Use as reference", exact: true })
    const attachments = page.getByRole("button", { name: "Remove attachment", exact: true })
    if (scenario === "reconcile") {
      await reference.waitFor()
      await page.evaluate(() => { void window.__shellRefreshConversations() })
    }
    await reference.click()
    if (!production) {
      const deadline = Date.now() + 10_000
      while (!started && Date.now() < deadline) await page.waitForTimeout(20)
      assert.ok(started, "central composer deferred module is held for readiness fencing")
      if (scenario === "reconcile") {
        releaseList()
        await page.waitForFunction(() => localStorage.getItem("ineffable.chat.conversation_id") === null)
      }
      if (scenario === "selection") await page.evaluate(() => window.__shellSelectConversation(null))
      if (scenario === "session") await page.evaluate(() => {
        localStorage.setItem("ineffable.auth.session_id", "fixture-session-b")
        localStorage.setItem("ineffable.auth.access_token", "fixture-token-b")
        window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
      })
      if (scenario === "unmount") {
        await page.getByRole("link", { name: "Settings", exact: true }).click()
        await reference.waitFor({ state: "hidden" })
      }
      if (scenario === "timeout") {
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Use as reference" && !b.disabled), null, { timeout: 15_000 })
        assert.equal(await page.evaluate(() => window.__shellNotifications.length), 1, "timeout is reported once")
      }
      release()
    }
    await page.locator('[data-slot="chat-workbench"] textarea').first().waitFor({ state: "attached" })
    if (scenario === "success") {
      await attachments.waitFor()
      if (!production) {
        // Change the real draft and dispatch before React can replace the old
        // receiver effect. Neither the old nor the new identity belongs to it.
        const accepted = await page.evaluate(image => {
          const old = window.__shellSelection()
          window.__shellStartNewChat()
          return [old, window.__shellSelection()].map(owner => !window.dispatchEvent(new CustomEvent("ineffable:image-reference-request", { cancelable: true, detail: { ...owner, image } })))
        }, image)
        assert.deepEqual(accepted, [false, false], "a stale mounted receiver cannot accept into either draft")
        await attachments.waitFor({ state: "hidden" })
        await reference.click()
        await attachments.waitFor()
        await attachments.click()
        await page.waitForLoadState("networkidle")
        await page.evaluate(() => window.__shellSelectConversation(null))
        await reference.click()
        await attachments.waitFor({ timeout: 2_000 })
        assert.equal(await page.evaluate(() => window.__shellNotifications.length), 0, "selecting the same draft republishes its owner without waiting for unrelated rerenders")
      }
    } else {
      if (scenario !== "unmount") await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Use as reference" && !b.disabled))
      await page.waitForLoadState("networkidle")
      assert.equal(await attachments.count(), 0, `${scenario}: a cancelled or expired reference never arrives late`)
      if (scenario !== "timeout") assert.equal(await page.evaluate(() => window.__shellNotifications.length), 0, "stale intent is discarded silently")
      if (scenario !== "unmount") {
        await reference.click()
        await attachments.waitFor()
        assert.equal(await attachments.count(), 1, "a fresh reference still succeeds")
      }
    }
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    assert.equal(apiRequests(fixture.requests).filter(r => r.method !== "GET").length, 0, "referencing never uploads bytes or creates a run")
    await page.close()
    console.log(`${results.mode}: image reference ${scenario} passed`)
  }
} finally {
  writeFileSync(output, JSON.stringify(results, null, 2))
  await browser?.close()
  if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  else await server.close()
}
