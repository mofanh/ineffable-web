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
  const policy = { allowed_modes: ["smart", "clean", "full", "custom"], exposure_budget: { max_count: 24 } }
  const stored = new Map([["first", { mode: "smart" }], ["other", { mode: "full" }]])
  const pending = []
  const writes = []
  let settled = 0
  let holdCreatedDetail = false
  const sends = []
  let holdHistory = false
  let forceHistory = false
  const historyReleases = []
  await page.route("**/gateway/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: "workspace", name: "Workspace", workspace_type: "personal" }] }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "UTC", version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/list")) body = { conversations: [...stored.keys()].map(id => ({ id, title: id, current_run: null })) }
    else if (path.endsWith("conversations/create")) {
      stored.set("created", { mode: "smart" })
      body = { id: "created", title: "created", current_run: null }
    } else if (path.endsWith("conversations/send")) {
      const payload = request.postDataJSON()
      sends.push(payload)
      stored.set(payload.conversation_id, payload.capability_exposure)
      body = { status: "queued", queue_len: 1, pending_id: 1, conversation_id: payload.conversation_id }
    } else if (path.endsWith("conversations/get")) {
      const id = url.searchParams.get("conversation_id")
      const selection = stored.get(id)
      if (id === "created" && holdCreatedDetail) { await new Promise(() => {}) }
      if (holdHistory && id === "other") await new Promise(resolve => historyReleases.push(resolve))
      body = { id, title: id, current_run: null, capability_exposure_selection: selection, capability_exposure_policy: { policy } }
    } else if (path.endsWith("capability-exposure/policy")) body = { selection: { mode: "smart" }, capability_exposure_policy: { policy } }
    else if (path.endsWith("/capability-exposure") && request.method() === "POST") {
      const payload = request.postDataJSON()
      writes.push(payload)
      const success = await new Promise(resolve => pending.push(resolve))
      if (success) stored.set(payload.conversation_id, payload.selection)
      await route.fulfill({ status: success ? 200 : 503, json: success ? { selection: payload.selection } : { error: "save rejected" } })
      settled++
      return
    } else if (path.endsWith("/events") && forceHistory) body = { events: [{ seq: 1, event: "conversation.updated" }], next_seq: 1 }
    else if (path.endsWith("/messages")) body = { messages: [], next_seq: 0, page: { has_older: false, before: null } }
    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", enabled: true }] }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    await route.fulfill({ json: body })
  })
  const picker = page.getByTitle("Controls which authorized tools the model sees this turn without expanding access", { exact: true })
  async function select(mode) {
    await picker.click()
    await page.getByRole("menuitemradio", { name: mode, exact: true }).click()
    await page.getByRole("menuitemradio", { name: mode, exact: true }).waitFor({ state: "hidden" })
    await page.waitForTimeout(120)
  }
  async function settle(success) {
    await page.waitForFunction(() => true)
    assert.ok(pending.length, "a real serialized request must be waiting")
    const target = settled + 1
    pending.shift()(success)
    for (let n = 0; settled < target && n < 100; n++) await page.waitForTimeout(10)
    assert.equal(settled, target)
  }
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button", { name: "Select first", exact: true }).click()
  await picker.filter({ hasText: "Smart tools" }).waitFor()
  await select("Clean tools")
  await select("All tools")
  assert.equal(writes.length, 1, "second save waits for the first")
  await settle(false)
  for (let n = 0; writes.length < 2 && n < 100; n++) await page.waitForTimeout(10)
  await settle(false)
  await picker.filter({ hasText: "Smart tools" }).waitFor()
  assert.equal(stored.get("first").mode, "smart", "two rejected drafts restore the last confirmed baseline")

  await select("Clean tools")
  await select("All tools")
  await settle(true)
  for (let n = 0; pending.length === 0 && n < 100; n++) await page.waitForTimeout(10)
  await settle(false)
  await picker.filter({ hasText: "Clean tools" }).waitFor()
  assert.equal(stored.get("first").mode, "clean", "a confirmed intermediate save becomes the rollback baseline")

  await select("Smart tools")
  await page.getByRole("button", { name: "Select other", exact: true }).click()
  await picker.filter({ hasText: "All tools" }).waitFor()
  await settle(false)
  await picker.filter({ hasText: "All tools" }).waitFor()
  assert.equal(stored.get("other").mode, "full", "late rejection cannot change the newly selected conversation")
  await select("Clean tools")
  holdHistory = true
  forceHistory = true
  await page.waitForTimeout(1100)
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  for (let n = 0; historyReleases.length === 0 && n < 100; n++) await page.waitForTimeout(10)
  assert.ok(historyReleases.length, "history read overlaps the pending save")
  await settle(true)
  holdHistory = false
  forceHistory = false
  historyReleases.splice(0).forEach(release => release())
  await page.waitForTimeout(150)
  await picker.filter({ hasText: "Clean tools" }).waitFor()
  await select("Smart tools")
  await settle(false)
  await picker.filter({ hasText: "Clean tools" }).waitFor()

  await page.getByLabel("New conversation", { exact: true }).click()
  await picker.filter({ hasText: "Smart tools" }).waitFor()
  await select("Clean tools")
  holdCreatedDetail = true
  await page.locator("textarea").fill("first task")
  await page.locator("textarea").press("Enter")
  await page.locator("[data-selection]").filter({ hasText: "created" }).waitFor()
  for (let n = 0; sends.length === 0 && n < 100; n++) await page.waitForTimeout(10)
  assert.equal(sends.length, 1)
  assert.equal(stored.get("created").mode, "clean", "ordinary send confirms the submitted initial selection")
  await page.waitForTimeout(100)
  await select("All tools")
  await settle(false)
  await picker.filter({ hasText: "Clean tools" }).waitFor()
  assert.equal(stored.get("created").mode, "clean", "new conversation rollback uses the accepted send before detail hydration")
  assert.deepEqual(errors, [])
  console.log("capability save chain browser checks passed (double failure, confirmed success, conversation fence, accepted new draft, stale history during save)")
} finally {
  await browser?.close()
  await server.close()
}
