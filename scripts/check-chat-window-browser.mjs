import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((path) => path && existsSync(path))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, locale: "zh-CN" })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/chat-window-fixture.html`)
  await page.waitForFunction(() => Boolean(window.chatWindowFixture))
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const anchor = () => page.locator("[data-chat-scroll-region]").evaluate((viewport) => {
    const top = viewport.getBoundingClientRect().top
    const row = [...viewport.querySelectorAll("[data-chat-entry-role]")].find((row) => row.getBoundingClientRect().bottom > top)
    return { key: row?.dataset.chatRowKey, top: row ? row.getBoundingClientRect().top - top : null }
  })
  for (const count of [1000, 10000]) {
    await page.evaluate((count) => window.chatWindowFixture.resize(count), count)
    await page.waitForFunction((count) => Number(document.querySelector("[data-chat-entry-count]").dataset.chatEntryCount) === count, count)
    for (const offset of [0, 40000, 0, 80000]) {
      await page.locator("[data-chat-scroll-region]").evaluate((viewport, offset) => { viewport.scrollTop = offset }, offset)
      await settle()
      assert.ok(await page.locator("[data-chat-entry-role]").count() <= 80, `bounded DOM at ${count}/${offset}`)
      assert.ok((await anchor()).key, "every viewport materializes content")
    }
  }
  const before = await anchor()
  await page.evaluate(() => window.chatWindowFixture.prepend())
  await settle()
  const after = await anchor()
  assert.equal(after.key, before.key, "actual entry prepend retains stable identity")
  assert.ok(Math.abs(after.top - before.top) < 2, `prepend offset ${before.top} -> ${after.top}`)
  await page.evaluate(({ key, top }) => window.chatWindowFixture.restore(key, top), before)
  await page.waitForTimeout(150)
  const restored = await anchor()
  assert.equal(restored.key, before.key)
  assert.ok(Math.abs(restored.top - before.top) < 2, "unmounted row restore uses its measured offset")
  await page.evaluate((key) => window.chatWindowFixture.grow(`input-${Number(key.split("-")[1]) - 1}`), before.key)
  await page.waitForTimeout(300)
  const resized = await anchor()
  assert.equal(resized.key, before.key, "late size change above viewport preserves anchor")
  assert.ok(Math.abs(resized.top - before.top) < 2)
  await page.evaluate(() => window.chatWindowFixture.human())
  await page.getByRole("radio").last().click()
  const answer = page.getByRole("textbox")
  await answer.fill("draft survives both virtual windows")
  for (const offset of [0, 9999999, 0]) {
    await page.locator("[data-chat-scroll-region]").evaluate((viewport, offset) => { viewport.scrollTop = offset }, offset)
    await settle()
    assert.equal(await answer.inputValue(), "draft survives both virtual windows")
    assert.ok(await page.locator("[data-chat-entry-role]").count() <= 80)
    assert.ok(await page.locator("[data-web-node-row]").count() <= 80)
  }
  await page.evaluate(() => window.chatWindowFixture.restore("human-entry", 0, { key: "node-200", top: 30 }))
  await page.waitForTimeout(250)
  const nestedTop = await page.locator('[data-chat-row-key="node-200"]').evaluate((row) => row.getBoundingClientRect().top - row.closest('[data-chat-scroll-region]').getBoundingClientRect().top)
  assert.ok(Math.abs(nestedTop - 30) < 2, `nested node identity restores measured offset: ${nestedTop}`)
  assert.equal(await answer.inputValue(), "draft survives both virtual windows")
  await page.evaluate(() => window.chatWindowFixture.human(40))
  await page.waitForFunction(() => document.querySelector("[data-human-node-count]").dataset.humanNodeCount === "40")
  await page.getByRole("radio").last().click()
  const draft = "draft survives canonical prepend and size threshold"
  await answer.fill(draft)
  for (const count of [41, 40]) {
    await page.evaluate(count => count === 41 ? window.chatWindowFixture.prependHuman() : window.chatWindowFixture.trimHuman(), count)
    await page.waitForFunction(count => Number(document.querySelector("[data-human-node-count]").dataset.humanNodeCount) === count, count)
    await settle()
    assert.equal(await page.getByRole("radio").last().getAttribute("aria-checked"), "true")
    assert.equal(await answer.inputValue(), draft, `draft survives ${count} nodes`)
    assert.ok(await answer.evaluate(input => input === document.activeElement), "threshold retains focus")
  }
  for (const payload of [{}, { tool: null }]) {
    await page.evaluate(payload => window.chatWindowFixture.malformed(payload), payload)
    await page.evaluate(() => window.chatWindowFixture.restore("human-entry", 0, { key: "bad-declared-tool", top: 30 }))
    await page.getByText("Safe fallback", { exact: true }).waitFor({ state: "attached" })
    assert.ok(await page.locator("[data-chat-entry-role]").count() > 1, "invalid declared tool preserves peers")
    assert.equal(await answer.inputValue(), draft, "malformed plugin cannot remove the active question")
  }
  await page.getByRole("button", { name: /提交选择|Submit answer/i }).click()
  const submitted = await page.evaluate(() => window.chatWindowFixture.submission())
  assert.equal(submitted.needId, "need")
  assert.equal(submitted.runId, "human-run")
  assert.ok(submitted.input.includes(draft), "unchanged draft reaches the answer command")
  assert.deepEqual(errors, [])
  console.log("bounded entry/node windows, prepend, restore and pinned human draft passed")
} finally { await browser?.close(); await server.close() }
