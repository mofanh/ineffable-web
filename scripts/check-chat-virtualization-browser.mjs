import assert from "node:assert/strict"
import { existsSync } from "node:fs"

import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((candidate) => candidate && existsSync(candidate))

assert.ok(executablePath, "Chrome/Chromium is required for the chat layout gate")

const server = await createServer({
  root: process.cwd(),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
})
let browser
try {
  await server.listen()
  const address = server.httpServer?.address()
  assert.ok(address && typeof address === "object")
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  await page.goto(
    `http://127.0.0.1:${address.port}/scripts/chat-virtualization-fixture.html`
  )
  await page.waitForFunction(() => Boolean(window.chatVirtualizationFixture))
  await page.evaluate(() => window.chatVirtualizationFixture.scrollTo(40_000))

  const before = await page.evaluate(() =>
    window.chatVirtualizationFixture.visibleAnchor()
  )
  assert.ok(before?.key, "deep scrolling must materialize a visible stable row")
  assert.ok(
    (await page.evaluate(() =>
      window.chatVirtualizationFixture.materializedRows()
    )) <= 80,
    "the browser DOM must retain a bounded normal-flow node window"
  )
  assert.equal(
    await page.evaluate(() => window.chatVirtualizationFixture.hasAbsoluteRows()),
    false,
    "assistant nodes must not use absolute positioning against the conversation scroller"
  )

  await page.evaluate(() => window.chatVirtualizationFixture.prepend())
  const after = await page.evaluate(() =>
    window.chatVirtualizationFixture.visibleAnchor()
  )
  assert.equal(after?.key, before.key, "prepend must preserve the visible row identity")
  assert.ok(
    Math.abs((after?.top ?? 0) - before.top) < 2,
    `prepend must preserve the row offset (${before.top} -> ${after?.top})`
  )

  await page.evaluate(() => window.chatVirtualizationFixture.settleTerminal())
  const terminalLayout = await page.evaluate(() =>
    window.chatVirtualizationFixture.terminalLayout()
  )
  assert.deepEqual(
    terminalLayout.map((entry) => entry.role),
    ["user", "assistant"],
    "terminal canonical handoff must preserve canonical DOM order"
  )
  assert.ok(
    terminalLayout[0].bottom <= terminalLayout[1].top,
    `terminal rows must not overlap (${JSON.stringify(terminalLayout)})`
  )
  const queuedBubbles = page.locator('[data-terminal-chat] [data-chat-entry-role="user"]').filter({ hasText: "继续" })
  for (const phase of ["queued", "hydrate", "cached", "downgrade", "missing-progress", "stale-page"]) {
    await page.evaluate((phase) => window.chatVirtualizationFixture.inputQueue(phase), phase)
    assert.equal(await queuedBubbles.count(), 0, `${phase}: two queued inputs must not render as chat bubbles`)
  }
  await page.evaluate(() => window.chatVirtualizationFixture.inputQueue("consuming"))
  assert.equal(await queuedBubbles.count(), 1, "only the consuming input renders")
  await page.evaluate(() => window.chatVirtualizationFixture.inputQueue("consuming"))
  assert.equal(await queuedBubbles.count(), 1, "canonical refresh cannot duplicate the consuming input")
  console.log("chat virtualization and input queue browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
