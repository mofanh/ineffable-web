import assert from "node:assert/strict"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const output = process.env.INEFFABLE_TOAST_ARTIFACT_DIR
if (output) mkdirSync(output, { recursive: true })
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
const measurements = []
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
    const mobile = width < 1024
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile })
    const fixture = await installShellFixture(page, false)
    const notify = (title, action = false, duration = 60000) => page.evaluate(async ({ title, action, duration }) => {
      const { notify } = await import("/src/lib/app/notifications.ts")
      notify.error({ title, description: "Toast must remain visible above the fullscreen conversation.", duration,
        ...(action ? { action: { label: "Toast action", onClick: () => { window.__toastActions = (window.__toastActions ?? 0) + 1 } } } : {}),
      })
    }, { title, action, duration })
    const toast = title => page.locator('[data-slot="toast"]').filter({ hasText: title })
    async function measure(title) {
      await toast(title).waitFor()
      await toast(title).evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)) })
      const result = await toast(title).evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        return { topmost: element.contains(target), left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, viewport: innerWidth, pointerEvents: getComputedStyle(element).pointerEvents }
      })
      measurements.push({ width, height, title, ...result })
      assert.ok(result.left >= 0 && result.top >= 0 && result.right <= width + 1 && result.bottom <= height + 1, "toast remains inside the visible viewport")
      assert.ok(result.topmost, `toast is actually above the chat: ${JSON.stringify(result)}`)
      assert.equal(result.pointerEvents, "auto", "toast remains interactive across modal mount order")
      assert.equal(await page.locator('[data-slot="toast-viewport"]').evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(bounds.left + 1, bounds.top + 1))
      }), false, "blank viewport padding does not intercept the chat")
    }
    try {
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/channels`)
      await page.getByRole("button", { name: "Open AI assistant", exact: true }).waitFor()
      await notify("Before chat")
      await toast("Before chat").waitFor()
      // The existing toast can cover the header trigger; use the shell's normal
      // open event, also used by in-app workspace references.
      await page.evaluate(() => window.dispatchEvent(new Event("ineffable:right-sidebar:open")))
      const composer = page.locator("textarea")
      await composer.waitFor()
      if (mobile) await page.locator('[role="dialog"][data-compact="true"]').waitFor()
      else await page.getByRole("button", { name: "Use AI assistant full screen", exact: true }).click()
      await page.waitForLoadState("networkidle")
      if (output) await page.screenshot({ path: `${output}/${width}-before-chat-toast.png` })
      await measure("Before chat")
      await notify("Auto dismiss", false, 400)
      await toast("Auto dismiss").waitFor()
      await toast("Auto dismiss").waitFor({ state: "detached" })
      const closeToast = toast("Before chat").locator('[data-slot="toast-close"]')
      if (mobile) await closeToast.tap()
      else await closeToast.click()
      await toast("Before chat").waitFor({ state: "detached" })
      await composer.fill("Keep chat open and this draft intact")
      if (mobile) assert.equal(await page.locator('[role="dialog"][data-compact="true"]').count(), 1, "dismissing toast does not dismiss mobile chat")
      await notify("During chat")
      await measure("During chat")
      if (output) await page.screenshot({ path: `${output}/${width}-during-chat-toast.png` })
      const closeNewToast = toast("During chat").locator('[data-slot="toast-close"]')
      if (mobile) await closeNewToast.tap()
      else await closeNewToast.click()
      await toast("During chat").waitFor({ state: "detached" })
      if (mobile) assert.equal(await page.locator('[role="dialog"][data-compact="true"]').count(), 1, "closing a new toast does not dismiss mobile chat")
      await notify("Action during chat", true)
      await measure("Action during chat")
      const action = toast("Action during chat").locator('[data-slot="toast-action"]')
      if (mobile) await action.tap()
      else await action.click()
      await toast("Action during chat").waitFor({ state: "detached" })
      assert.equal(await page.evaluate(() => window.__toastActions), 1)
      if (mobile) assert.equal(await page.locator('[role="dialog"][data-compact="true"]').count(), 1, "toast action does not dismiss mobile chat")
      await composer.click()
      assert.equal(await composer.inputValue(), "Keep chat open and this draft intact")
      await page.getByRole("button", { name: "Collapse right sidebar", exact: true }).click()
      if (mobile) await page.waitForFunction(() => !document.querySelector('[role="dialog"][data-compact="true"]') && getComputedStyle(document.body).pointerEvents !== "none")
      await page.getByRole("button", { name: "Open AI assistant", exact: true }).click()
      await composer.waitFor()
      if (mobile) assert.equal(await page.locator('[role="dialog"][data-compact="true"]').count(), 1, "empty toast viewport does not intercept the reopen trigger")
      assert.deepEqual(fixture.errors, [])
      assert.deepEqual(fixture.unexpected, [])
      console.log(`toast overlay, close and draft checks passed at ${width}x${height}`)
    } finally { await page.close() }
  }
} finally {
  if (output) writeFileSync(`${output}/measurements.json`, JSON.stringify(measurements, null, 2))
  await browser?.close()
  await server.close()
}
