import assert from "node:assert/strict"
import { existsSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { installShellFixture, apiRequests, countPath, waitForShell, measureToggle, workspace, imageId, image } from "./shell-performance-fixture.mjs"

const production = process.argv.includes("--production")
const baseline = process.env.INEFFABLE_SHELL_BASELINE_REF
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required")
const instrumented = new Map([
  ["src/app/app-shell.tsx", ["function AppShellContent() {", "shell"]],
  ["src/features/workspace/app-sidebar.tsx", ["export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {", "navigation"]],
  ["src/features/chat/gateway-chat-sidebar.tsx", ["}: GatewayChatSidebarProps) {", "chat"]],
])
const baselineFiles = new Set([...instrumented.keys(), "src/components/ui/sidebar.tsx", "src/features/workspace/components/workspace-image-preview.tsx", "src/lib/image-reference-events.ts"])
const server = production
  ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
  : await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{ name: "shell-measure", enforce: "pre", transform(source, id) {
    const path = id.split("?")[0].slice(process.cwd().length + 1)
    let code = baseline && baselineFiles.has(path) ? execFileSync("git", ["show", `${baseline}:${path}`], { encoding: "utf8" }) : source
    const counter = instrumented.get(path)
    if (counter) code = code.replace(counter[0], `${counter[0]}\nwindow.__shellRenders.${counter[1]}++;`)
    // Only expose the real selection command in this test build; it still updates
    // the production identity/version used by both sender and receiver.
    if (path === "src/features/auth/app-session.tsx") code = code.replace("<AuthSessionContext.Provider value={authValue}>", "<AuthSessionContext.Provider value={authValue}>{(window.__shellSelectConversation = selectConversation, window.__shellSelection = getConversationSelectionIdentity, null)}")
    if (path === "src/features/chat/gateway-chat-sidebar.tsx") code = code.replace("onStartNewChat={startNewChat}", "onStartNewChat={(window.__shellStartNewChat = startNewChat)}")
    return { code, map: null }
  } }] })
const results = { mode: production ? "production" : "development", baseline, scenarios: [] }
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
        assert.equal(sample.renders.chat, 0, "left animation does not render the chat owner")
      }
      assert.ok(sample.frames >= 10 && sample.p95 < 100, `sidebar frame budget: ${JSON.stringify(sample)}`)
    }
    const responseTimes = scenario.toggles.map(sample => sample.firstFrameMs).sort((a, b) => a - b)
    assert.ok((responseTimes[1] + responseTimes[2]) / 2 < 100, "median toggle-to-first-frame stays below 100 ms")
    assert.equal(countPath(initialApi, "/workspace-invitations/incoming"), 1, "sidebar shares the canonical invitation resource")
    if (!open) {
      assert.equal(countPath(initialApi, "/models/profiles"), 0, "closed first visit does not initialize chat")
      assert.equal(countPath(initialApi, "/conversations/preferences"), 0)
      assert.equal(initialApi.length, 6, "only auth, conversation summary, roots, invitations and current page load")
      await page.getByRole("button", { name: "Open AI assistant", exact: true }).click()
    }
    const composer = page.locator('[data-side="right"] textarea').first()
    await composer.waitFor()
    await composer.fill("KEEP_SIDEBAR_DRAFT")
    await page.waitForLoadState("networkidle")
    const beforeReopen = apiRequests(fixture.requests).length
    await page.getByRole("button", { name: "Close AI assistant", exact: true }).click()
    await page.getByRole("button", { name: "Open AI assistant", exact: true }).click()
    assert.equal(await composer.inputValue(), "KEEP_SIDEBAR_DRAFT", "closing an initialized panel preserves the draft")
    await page.waitForTimeout(300)
    assert.equal(apiRequests(fixture.requests).length, beforeReopen, "reopen preserves the mounted conversation, with no new reads or stop")

    // Rapid reversal still commits the correct final boundary; resizing the right
    // side afterward uses that boundary, not an intermediate animation width.
    await page.evaluate(async () => {
      document.querySelector('[data-slot="sidebar-trigger"]').click()
      await new Promise(resolve => setTimeout(resolve, 60))
      document.querySelector('[data-slot="sidebar-trigger"]').click()
    })
    await page.waitForTimeout(350)
    const resize = page.getByRole("separator", { name: "Resize AI assistant", exact: true })
    await resize.focus(); await page.keyboard.press("End")
    assert.equal(Number(await resize.getAttribute("aria-valuemax")), 864)
    // Restore the minimum before using the shell header, which a maximized
    // docked panel can legitimately cover.
    await page.keyboard.press("Home")
    await page.getByRole("button", { name: "Close AI assistant", exact: true }).click()
    await page.setViewportSize({ width: 900, height: 900 })
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await page.locator('[data-side="left"][data-compact="true"]').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-side="left"][data-compact="true"]')?.contains(document.activeElement))
    await page.locator('[data-side="left"][data-compact="true"]').focus()
    await page.waitForTimeout(100)
    await page.keyboard.press("Escape")
    await page.locator('[data-side="left"][data-compact="true"]').waitFor({ state: "hidden" })
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.waitForTimeout(350)
    assert.equal(Number(await resize.getAttribute("aria-valuemax")), 880, "compact close leaves desktop left sidebar collapsed")
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
    console.log(`${results.mode}: shell cold load, toggle budget, draft and breakpoints passed (chat initially ${open ? "open" : "closed"})`)
  }

  // Reference handoff must survive a real first lazy mount and reject a selection
  // change while that chunk is still unavailable. No image is queued in the shell.
  for (const scenario of production ? ["success"] : ["success", "selection", "session", "unmount", "timeout"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await installShellFixture(page, false)
    let release, started = false
    const hold = new Promise(resolve => { release = resolve })
    if (!production) await page.route("**/src/components/right-sidebar.tsx*", async route => {
      started = true; await hold; await route.continue()
    })
    await page.goto(`${url}/workspace/${workspace}/objects/${imageId}`)
    const reference = page.getByRole("button", { name: "Use as reference", exact: true })
    const attachments = page.getByRole("button", { name: "Remove attachment", exact: true })
    await reference.click()
    if (!production) {
      const deadline = Date.now() + 10_000
      while (!started && Date.now() < deadline) await page.waitForTimeout(20)
      assert.ok(started, "reference opens the previously unloaded composer")
      if (scenario === "selection") await page.evaluate(() => window.__shellSelectConversation(null))
      if (scenario === "session") await page.evaluate(() => {
        localStorage.setItem("ineffable.auth.session_id", "fixture-session-b")
        localStorage.setItem("ineffable.auth.access_token", "fixture-token-b")
        window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
      })
      if (scenario === "unmount") {
        await page.getByRole("button", { name: "Message channels", exact: true }).click()
        await reference.waitFor({ state: "hidden" })
      }
      if (scenario === "timeout") {
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Use as reference" && !b.disabled), null, { timeout: 15_000 })
        assert.equal(await page.evaluate(() => window.__shellNotifications.length), 1, "timeout is reported once")
      }
      release()
    }
    await page.locator('[data-side="right"] textarea').first().waitFor()
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
