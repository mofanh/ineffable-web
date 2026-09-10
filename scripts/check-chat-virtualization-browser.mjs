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
  // Role locators below assert Chinese labels; do not inherit the runner's locale.
  const page = await browser.newPage({
    viewport: { width: 900, height: 700 },
    locale: "zh-CN",
  })
  await page.goto(
    `http://127.0.0.1:${address.port}/scripts/chat-virtualization-fixture.html`
  )
  await page.waitForFunction(() => Boolean(window.chatVirtualizationFixture))
  const renameRequests = []
  let rejectRename = false
  let releaseRename
  let holdRename = false
  await page.route("**/gateway/v1/conversations/rename", async (route) => {
    const body = route.request().postDataJSON()
    renameRequests.push(body)
    if (holdRename) await new Promise((resolve) => { releaseRename = resolve })
    await route.fulfill({
      status: rejectRename ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(rejectRename ? { error: "title save failed" } : { id: body.conversation_id, title: body.title }),
    })
  })
  const editTitle = page.getByRole("button", { name: "编辑对话标题", exact: true })
  await editTitle.click()
  const titleInput = page.getByRole("textbox", { name: "对话标题", exact: true })
  await titleInput.fill("   ")
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true)
  await titleInput.fill("  Renamed history  ")
  await titleInput.press("Enter")
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  assert.deepEqual(renameRequests, [{ conversation_id: "fixture", title: "Renamed history" }])
  assert.equal(await page.locator('[data-sidebar="header"] button[title="Renamed history"]').count(), 1)
  rejectRename = true
  await editTitle.click()
  await titleInput.fill("Retry title")
  await titleInput.press("Enter")
  await page.getByRole("alert").waitFor()
  assert.equal(await titleInput.inputValue(), "Retry title", "failed save retains the draft")
  rejectRename = false
  holdRename = true
  await titleInput.press("Enter")
  await page.waitForFunction(() => document.querySelector('input:disabled') !== null)
  const renameDeadline = Date.now() + 5_000
  while (!releaseRename && Date.now() < renameDeadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(releaseRename, "rename request must reach the API")
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await editTitle.click()
  await titleInput.fill("New editor draft")
  await titleInput.press("Enter")
  await page.waitForTimeout(100)
  assert.equal(renameRequests.length, 3, "a second save must wait until the previous write settles")
  holdRename = false
  releaseRename()
  await page.getByRole("dialog").waitFor({ state: "hidden" })
  await page.locator('[data-sidebar="header"] button[title="New editor draft"]').waitFor()
  assert.equal(renameRequests[3].title, "New editor draft", "latest title must be the final persisted write")
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 700 })
    const layout = await page.locator('[data-terminal-chat]').evaluate((root) => {
      const header = root.querySelector('[data-sidebar="header"]')
      const viewport = root.querySelector('[data-chat-scroll-region]')
      const content = root.querySelector('[data-chat-scroll-content]')
      return {
        headerBottom: header.getBoundingClientRect().bottom,
        headerTop: header.getBoundingClientRect().top,
        viewportTop: viewport.getBoundingClientRect().top,
        contentTop: content.getBoundingClientRect().top,
        blur: getComputedStyle(header).backdropFilter,
        background: getComputedStyle(header).backgroundColor,
      }
    })
    assert.equal(layout.viewportTop, layout.headerTop, "history must extend beneath the floating header")
    assert.ok(layout.contentTop >= layout.headerBottom, "initial content must clear the header")
    assert.equal(layout.blur, "none", "focus mode must not blur history underneath its header")
    assert.equal(layout.background, "rgba(0, 0, 0, 0)", "focus mode header must be transparent")
  }
  await page.setViewportSize({ width: 900, height: 700 })
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
  const guidance = page.locator('[data-terminal-chat] [data-chat-entry-role="user"]').filter({ hasText: "引导输入" })
  await page.evaluate(() => window.chatVirtualizationFixture.guidedInput("waiting"))
  assert.equal(await guidance.locator('[data-input-waiting]').evaluate((node) => getComputedStyle(node).opacity), "0.5")
  for (const phase of ["accepted", "refresh"]) {
    await page.evaluate((phase) => window.chatVirtualizationFixture.guidedInput(phase), phase)
    assert.equal(await guidance.locator('[data-input-waiting]').count(), 0)
    const rows = await page.locator('[data-terminal-chat] [data-chat-entry-role]').allTextContents()
    assert.equal(rows.length, 4)
    assert.ok(rows[0].includes("原输入") && rows[1].includes("原输入的回答") && rows[2].includes("引导输入") && rows[3].includes("引导输入的回答"), `${phase}: answers must stay on each side of guidance`)
  }
  for (const phase of ["multiple", "multiple-refresh"]) {
    await page.evaluate((phase) => window.chatVirtualizationFixture.guidedInput(phase), phase)
    const rows = await page.locator('[data-terminal-chat] [data-chat-entry-role]').allTextContents()
    assert.equal(rows.length, 5)
    assert.ok(rows[3].includes("引导输入的回答") && rows[4].includes("尚未读取的C"), `${phase}: B answer precedes waiting C`)
  }
  await page.evaluate(() => window.chatVirtualizationFixture.guidedInput("downgrade"))
  assert.equal(await guidance.count(), 0, "unaccepted downgraded input belongs only in the queue")
  console.log("chat virtualization and input queue browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
