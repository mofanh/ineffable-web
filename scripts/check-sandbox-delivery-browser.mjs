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
  const errors=[]; page.on("pageerror", error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/sandbox-delivery-fixture.html`)
  await page.getByRole("status").filter({ hasText: "正在重试" }).waitFor()
  await page.evaluate(() => window.deliveryFixture.select("b"))
  await page.getByRole("status").filter({ hasText: "正在重试" }).waitFor({ state:"hidden" })
  await page.evaluate(() => window.deliveryFixture.select("a"))
  await page.getByRole("status").filter({ hasText: "正在重试" }).waitFor()
  await page.evaluate(() => window.deliveryFixture.update(0))
  await page.getByRole("status").filter({ hasText: "正在重试" }).waitFor({ state:"hidden" })
  assert.deepEqual(errors,[])
  console.log("Sandbox delivery browser checks passed: pending, environment switch, confirmation")
} finally {
  await browser?.close()
  await server.close()
}
