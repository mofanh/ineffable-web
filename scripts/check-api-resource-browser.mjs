import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required for resource cache checks")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const scenario of ["mutation-success", "mutation-error", "invalidate", "clear-success", "clear-error", "key-switch", "unmount"]) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(`${origin}/scripts/api-resource-fixture.html`)
    await page.waitForFunction(() => window.resourceHarness.requests.length === 1)
    if (scenario.startsWith("mutation")) {
      await page.evaluate(() => window.resourceHarness.resources.first.setData(() => { window.resourceHarness.updaterCalls++; return "saved" }))
      await page.waitForFunction(() => [...document.querySelectorAll("[data-probe]")].every(node => JSON.parse(node.textContent).data === "saved"), null, { timeout: 2000 })
      await page.evaluate(fails => {
        const request = window.resourceHarness.requests[0]
        if (fails) request.reject(Error("late read error")); else request.resolve("stale")
      }, scenario === "mutation-error")
      await page.waitForTimeout(50)
      for (const node of await page.locator("[data-probe]").allTextContents()) assert.deepEqual(JSON.parse(node), { data: "saved", state: "success", error: null })
      assert.equal(await page.evaluate(() => window.resourceHarness.updaterCalls), 1, "mutation updater executes once under StrictMode")
    } else if (scenario === "invalidate") {
      await page.evaluate(() => window.resourceHarness.invalidate("a"))
      await page.waitForFunction(() => window.resourceHarness.requests.length === 2)
      await page.evaluate(() => window.resourceHarness.requests[1].resolve("fresh"))
      await page.waitForFunction(() => window.resourceHarness.resources.first.data === "fresh")
      await page.evaluate(() => window.resourceHarness.requests[0].resolve("stale"))
      await page.waitForTimeout(50)
      for (const node of await page.locator("[data-probe]").allTextContents()) assert.equal(JSON.parse(node).data, "fresh")
    } else if (scenario.startsWith("clear")) {
      await page.evaluate(() => window.resourceHarness.clear())
      await page.evaluate(fails => {
        const request = window.resourceHarness.requests[0]
        if (fails) request.reject(Error("old account")); else request.resolve("old account")
      }, scenario === "clear-error")
      await page.waitForTimeout(50)
      for (const node of await page.locator("[data-probe]").allTextContents()) assert.deepEqual(JSON.parse(node), { data: null, state: "idle", error: null })
      await page.evaluate(() => { void window.resourceHarness.resources.first.reload() })
      await page.waitForFunction(() => window.resourceHarness.requests.length === 2)
      await page.evaluate(() => window.resourceHarness.requests[1].resolve("new account"))
      await page.waitForFunction(() => window.resourceHarness.resources.second.data === "new account")
    } else if (scenario === "key-switch") {
      await page.evaluate(() => { window.oldResource = window.resourceHarness.resources.first; window.resourceHarness.configure({ cacheKey: "b", second: true }) })
      await page.waitForFunction(() => window.resourceHarness.requests.length === 2)
      await page.evaluate(() => { window.oldResource.setData("old mutation"); window.resourceHarness.requests[0].resolve("old data"); window.resourceHarness.requests[1].resolve("new data") })
      await page.waitForFunction(() => window.resourceHarness.resources.second.data === "new data")
      assert.equal(await page.evaluate(() => window.resourceHarness.resources.first.data), "new data")
    } else {
      await page.evaluate(() => window.resourceHarness.configure({ cacheKey: "a", second: false }))
      await page.waitForFunction(() => !window.resourceHarness.resources.second)
      await page.evaluate(() => window.resourceHarness.requests[0].resolve("shared"))
      await page.waitForFunction(() => window.resourceHarness.resources.first.data === "shared")
      await page.evaluate(() => window.resourceHarness.configure({ cacheKey: "a", second: true }))
      await page.waitForFunction(() => window.resourceHarness.resources.second?.data === "shared")
      assert.equal(await page.evaluate(() => window.resourceHarness.requests.length), 1)
    }
    assert.deepEqual(errors, [], scenario)
    await page.close()
  }
  const page = await browser.newPage()
  await page.goto(`${origin}/scripts/api-resource-fixture.html?uncached=1`)
  await page.waitForFunction(() => window.resourceHarness.requests.length > 0)
  await page.evaluate(() => window.resourceHarness.requests.at(-1).resolve("initial"))
  await page.waitForFunction(() => window.resourceHarness.resources.first.data === "initial")
  await page.evaluate(() => window.resourceHarness.configure({ cacheKey: "b", second: false }))
  await page.waitForFunction(() => window.resourceHarness.requests.at(-1).key === "b")
  await page.evaluate(() => {
    for (const request of window.resourceHarness.requests.filter(item => item.key === "a")) request.resolve("stale")
    window.resourceHarness.requests.at(-1).resolve("changed parameters")
  })
  await page.waitForFunction(() => window.resourceHarness.resources.first.data === "changed parameters")
  await page.close()
  console.log("resource cache browser checks passed (8 scenarios, actual hook, StrictMode)")
} finally { await browser?.close(); await server.close() }
