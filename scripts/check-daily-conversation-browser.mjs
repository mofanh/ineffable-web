import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
  })
  let todayCalls = 0
  let taskCalls = 0
  const workspace = "00000000-0000-0000-0000-000000000001"
  const root = { id: "today", title: "2026-09-15", kind: "daily_root", root_ends_at: "2099-01-01T00:00:00Z", last_message_at: "2026-09-15T10:00:00Z", current_run: null }
  const old = { ...root, id: "old", title: "2026-09-14", root_ends_at: "2000-01-01T00:00:00Z" }
  const sends = []
  await page.route("**/gateway/v1/**", async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: workspace, name: "Workspace", kind: "personal" }], current_workspace_id: workspace }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", day_start_minutes: 240, version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/list")) body = { conversations: [root, old] }
    else if (path.endsWith("conversations/today")) { todayCalls++; body = root }
    else if (path.endsWith("conversations/create")) { taskCalls++; body = { id: "task", title: "Task", kind: "task", current_run: null } }
    else if (path.endsWith("conversations/get")) body = url.searchParams.get("conversation_id") === "old" ? old : root
    else if (path.endsWith("/messages")) body = { messages: [{ id: "history", conversation_id: url.searchParams.get("conversation_id"), message_seq: 1, role: "user", message_type: "input", content: "EXISTING_DAILY_HISTORY", metadata_json: {}, created_at: "2026-09-15T10:00:00Z" }], next_seq: 0, page: { has_older: false, before: null } }
    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", supports_tool_calls: true, enabled: true }] }
    else if (path.endsWith("/send")) { sends.push(route.request().postDataJSON()); body = { status: "queued", queue_len: 1, pending_id: 1, message_id: "message", conversation_id: "today" } }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button", { name: "Go to today", exact: true }).click()
  await page.getByText("EXISTING_DAILY_HISTORY", { exact: true }).waitFor()
  assert.equal(await page.locator("[data-selection]").textContent(), "today")
  await page.getByRole("button", { name: "Go to today", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "today")
  assert.equal(taskCalls, 0, "today must never create a task")
  assert.ok(todayCalls >= 1)
  assert.equal(await page.getByRole("button", { name: "Edit conversation title", exact: true }).count(), 0)
  await page.getByTitle("2026-09-15", { exact: true }).click()
  await page.getByRole("button", { name: "2026-09-14", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("textarea")?.readOnly === true)
  await page.getByRole("button", { name: "New independent task", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("textarea")?.readOnly === false)
  assert.equal(await page.locator("[data-selection]").textContent(), "new")
  assert.equal(sends.length, 0, "navigation must not execute a model")
  assert.deepEqual(errors, [])
  console.log("daily conversation browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
