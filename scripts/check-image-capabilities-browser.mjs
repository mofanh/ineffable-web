import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find((path) => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  const image = { workspace_id: "00000000-0000-0000-0000-000000000001", object_id: "00000000-0000-0000-0000-000000000002", version_id: "00000000-0000-0000-0000-000000000003", mime_type: "image/png", width: 1, height: 1, size_bytes: 68 }
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64")
  let release
  let uploads = 0
  await page.route("**/gateway/v1/workspaces/*/images", async (route) => {
    assert.ok(["Bearer image-fixture-token", "Bearer refreshed-fixture-token"].includes(route.request().headers().authorization))
    uploads++
    await new Promise((resolve) => { release = resolve })
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ image }) })
  })
  await page.route("**/gateway/v1/workspace-object-versions/*/image-preview", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }))
  await page.route("**/gateway/v1/workspace-object-versions/*/raw", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-capabilities-fixture.html`)
  await page.locator('input[type="file"]').setInputFiles({ name: "image.png", mimeType: "image/png", buffer: png })
  await page.getByRole("button", { name: "switch", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-scope]').textContent === "b")
  const deadline = Date.now() + 5000
  while (!release && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(release)
  release()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('[data-count]').textContent(), "0", "old upload cannot populate the selected conversation")
  await page.getByRole("button", { name: "switch", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-count]').textContent === "1")
  await page.getByRole("button", { name: "create", exact: true }).click()
  assert.equal(await page.locator('[data-count]').textContent(), "1", "creating a conversation preserves ready images")
  await page.locator("img").first().waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile attachments must not overflow")
  assert.equal(uploads, 1, "switching or creating conversations never re-uploads")
  await page.getByRole("button", {name:"new",exact:true}).click()
  assert.equal(await page.locator('[data-count]').textContent(), "0")
  release = undefined
  await page.locator('input[type="file"]').setInputFiles({name:"second.png",mimeType:"image/png",buffer:png})
  await page.getByRole("button", {name:"refresh-token",exact:true}).click()
  await page.waitForTimeout(100)
  assert.ok(release)
  release()
  await page.waitForFunction(() => document.querySelector('[data-count]').textContent === "1")
  await page.getByRole("button", {name:"old",exact:true}).click()
  assert.equal(await page.locator('[data-count]').textContent(), "1", "new draft must not append to the previous conversation")
  await page.getByRole("button", {name:"new",exact:true}).click()
  assert.equal(await page.locator('[data-count]').textContent(), "1", "refreshed token must keep the current draft")
  assert.deepEqual(errors, [])
  console.log("image upload, conversation isolation, migration and mobile checks passed")
} finally { await browser?.close(); await server.close() }
