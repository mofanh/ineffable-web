import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
const a = "11111111-1111-1111-1111-111111111111", b = "22222222-2222-2222-2222-222222222222"
const object = "33333333-3333-3333-3333-333333333333", version = "44444444-4444-4444-4444-444444444444"
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  const errors = []; page.on("pageerror", error => errors.push(error.message))
  const requests = []; let failed = false, delay = 30
  await page.route("**/gateway/v1/workspaces/*/*?*", async route => {
    const url = new URL(route.request().url()), id = url.pathname.split("/").at(-2)
    requests.push(url)
    const query = url.searchParams.get("query")
    const objects = [{ id: object, workspace_id: id, kind: "file", path: query ? `资料/${query}.pdf` : "报告 [中文](1).md", name: "报告", current_version_id: version }]
    if (url.searchParams.get("path") === "" && !query && !url.searchParams.has("cursor")) objects.unshift({ id: "folder", workspace_id: id, kind: "folder", path: "folder", name: "folder", current_version_id: null })
    await new Promise(resolve => setTimeout(resolve, delay))
    await route.fulfill({ status: failed ? 503 : 200, contentType: "application/json", body: JSON.stringify(failed ? { error: "fixture offline" } : { objects, matches: objects.map(object => ({ object })), next_cursor: url.searchParams.has("cursor") ? null : "page-two" }) })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/request-efficiency-fixture.html`)
  let input = page.getByRole("textbox").first(); await input.waitFor()
  assert.equal(requests.length, 0, "mount does not scan workspaces")
  await input.fill("@")
  await page.getByRole("option", { name: "folder", exact: true }).waitFor()
  assert.equal(requests.length, 1, "only current space and first page fetched")
  await page.getByRole("option", { name: "folder", exact: true }).click()
  await page.getByRole("option", { name: "报告 [中文](1).md", exact: true }).waitFor()
  assert.equal(requests.at(-1).searchParams.get("path"), "folder")
  await page.getByRole("button", { name: /上一级|Up/, exact: true }).click()
  await page.getByRole("option", { name: "folder", exact: true }).waitFor()
  await page.getByRole("button", { name: /加载更多|Load more/ }).click()
  await page.waitForFunction(() => !document.querySelector('[data-workspace-file-menu] [role="status"]'))
  assert.equal(requests.at(-1).searchParams.get("cursor"), "page-two")
  await input.fill("前文 @报 后文")
  await input.press("End")
  await input.press("ArrowLeft")
  await input.press("ArrowLeft")
  await input.press("ArrowLeft")
  await page.getByRole("option", { name: "资料/报.pdf", exact: true }).waitFor()
  assert.equal(requests.at(-1).searchParams.get("cursor"), null, "query resets pagination")
  await input.press("Enter")
  assert.equal(await input.inputValue(), "前文  后文", "middle completion preserves suffix")
  await page.locator("[data-workspace-file-tags]").getByRole("link").waitFor()
  assert.match(await page.evaluate(() => window.efficiencyFixture.getComposer()), /workspace:\/\//)
  const origin = new URL(page.url()).origin
  const copied = `[B/报告](${origin}/workspace/${b}/objects/${object}?version=${version})`
  async function paste(text) { await input.evaluate((el, text) => { const data = new DataTransfer(); data.setData("text/plain", text); el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })) }, text) }
  await paste(`对比 ${copied}\n${copied}`)
  assert.equal(await page.locator("[data-workspace-file-tags] a").count(), 2, "cross-space refs dedupe by identity")
  assert.match(await input.inputValue(), /对比/)
  await paste(`[外部](https://other.test/workspace/${a}/objects/${object}?version=${version})`)
  assert.equal(await page.locator("[data-workspace-file-tags] a").count(), 2, "external links do not attach")
  await page.locator("[data-workspace-file-tags]").getByRole("button").first().click()
  assert.equal(await page.locator("[data-workspace-file-tags] a").count(), 1)
  await input.fill("@")
  await page.getByRole("option", { name: "folder", exact: true }).waitFor()
  await input.dispatchEvent("compositionstart")
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true })
  assert.equal(await page.locator("[data-workspace-file-tags] a").count(), 1, "IME Enter does not choose/submit")
  await input.dispatchEvent("compositionend")
  await input.press("Escape")
  assert.equal(await page.locator("[data-workspace-file-menu]").count(), 0)
  await input.fill("@again")
  await page.getByRole("option", { name: "资料/again.pdf", exact: true }).waitFor()
  failed = true
  await page.evaluate(() => window.efficiencyFixture.change())
  await page.getByText("fixture offline", { exact: false }).waitFor()
  failed = false
  await page.getByRole("button", { name: /重试|Retry/ }).click()
  await page.getByRole("option", { name: "资料/again.pdf", exact: true }).waitFor()
  delay = 600
  await input.fill("@stale")
  await page.waitForTimeout(200)
  await page.evaluate(() => { window.efficiencyFixture.setScope("chat-b"); window.efficiencyFixture.setComposer("new draft") })
  input = page.getByRole("textbox").first()
  await page.waitForTimeout(750)
  assert.equal(await input.inputValue(), "new draft")
  assert.equal(await page.locator("[data-workspace-file-menu]").count(), 0, "late result cannot re-open another conversation")
  assert.equal(await page.locator("[data-workspace-file-tags] a").count(), 0)
  assert.deepEqual(errors, [])
  // Exercise the actual Workspace sidebar context menu and clipboard feedback.
  const sidebar = await browser.newPage()
  await sidebar.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    window.copiedReferences = []
    window.failClipboard = false
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => {
      if (window.failClipboard) throw new Error("clipboard denied")
      window.copiedReferences.push(text)
    } } })
  })
  await sidebar.route("**/gateway/v1/**", async route => {
    const path = new URL(route.request().url()).pathname
    let body = { conversations: [], invitations: [], objects: [], next_cursor: null }
    if (path.endsWith("auth/me")) body = { user: { id: "actor", role: "user", status: "active" }, workspaces: [{ id: a, workspace_type: "personal", name: "A" }] }
    else if (path.endsWith("/directory")) body = { objects: [{ id: object, workspace_id: a, kind: "file", name: "reference.txt", path: "reference.txt", current_version_id: version }], next_cursor: null }
    await route.fulfill({ json: body })
  })
  await sidebar.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/workspace-image-fixture.html?tree=1`)
  await sidebar.getByRole("button", { name: "reference.txt", exact: true }).click({ button: "right" })
  await sidebar.getByRole("menuitem", { name: /复制文件引用|Copy file reference/ }).click()
  await sidebar.waitForFunction(() => window.copiedReferences.length === 1)
  assert.match((await sidebar.evaluate(() => window.copiedReferences))[0], new RegExp(`/workspace/${a}/objects/${object}\\?version=${version}`))
  await sidebar.evaluate(() => { window.failClipboard = true })
  await sidebar.getByRole("button", { name: "reference.txt", exact: true }).click({ button: "right" })
  await sidebar.getByRole("menuitem", { name: /复制文件引用|Copy file reference/ }).click()
  await sidebar.getByText("clipboard denied", { exact: false }).waitFor()
  assert.equal((await sidebar.evaluate(() => window.copiedReferences)).length, 1)
  await sidebar.close()
  console.log("File reference browser checks passed: lazy/paged browsing, server search, cursor suffix, keyboard/IME, multi-space paste/dedupe, retry and conversation fencing")
} finally { await browser?.close(); await server.close() }
