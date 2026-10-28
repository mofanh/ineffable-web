import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
const policy = { allowed_modes: ["smart", "clean", "full", "custom"], exposure_budget: { max_count: 24 } }
const until = async (read, label) => {
  const deadline = Date.now() + 8000
  while (!read() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(read(), label)
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, executablePath })
  for (const scenario of ["consuming", "consumed", "history-focus", "queue-resume", "queue-clear"]) {
    const page = await browser.newPage({ locale: "zh-CN", viewport: { width: 1100, height: 850 } })
    const errors = [], heldHistory = []
    let sent = false, messageReads = 0, mutated = false, failHistory = false
    const isQueue = scenario.startsWith("queue-")
    const admission = () => ({ conversation_id: "first", revision: sent || mutated ? 1 : 0, generation: 0,
      queued_count: isQueue && !(mutated && scenario === "queue-clear") ? 1 : 0,
      consuming_count: sent && scenario === "consuming" ? 1 : 0, queue_paused: isQueue && !mutated })
    const conversation = () => ({ id: "first", title: "History feedback", current_run: null, admission: admission(),
      capability_exposure_selection: { mode: "smart" }, capability_exposure_policy: { policy } })
    page.on("pageerror", error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "fixture-token")
      localStorage.setItem("ineffable.auth.session_id", "fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
    })
    await page.route("**/gateway/**", async route => {
      const path = new URL(route.request().url()).pathname
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
      if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [] }
      else if (path.endsWith("conversations/list")) body = { conversations: [conversation()] }
      else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
      else if (path.endsWith("conversations/get")) body = conversation()
      else if (path.endsWith("capability-exposure/policy")) body = { selection: { mode: "smart" }, capability_exposure_policy: { policy } }
      else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", enabled: true }] }
      else if (path.endsWith("/messages")) {
        messageReads++
        if (failHistory) return route.fulfill({ status: 503, json: { error: "HISTORY_UNAVAILABLE" } })
        if (!isQueue) { heldHistory.push(route); return }
        body = { messages: [], next_seq: 0, page: { has_older: false, before: null } }
      }
      else if (path.endsWith("/observations/access")) body = { allowed: false }
      else if (path.endsWith("/pending-inputs/resume") || path.endsWith("/pending-inputs/clear")) {
        mutated = true; failHistory = true; body = { ok: true, released: 1, cleared: 1 }
      }
      else if (path.endsWith("/pending-inputs")) body = { pending_inputs: isQueue && !(mutated && scenario === "queue-clear") ? [{
        id: 1, message_id: "input", conversation_id: "first", content: "QUEUED_INPUT", kind: "pre_input", status: "queued", run_id: null, queued_in_timeline: false,
      }] : [], input_progress: [], admission: admission(), can_resume: isQueue && !mutated }
      else if (path.endsWith("/send")) {
        sent = true
        body = { status: scenario, queued_in_timeline: false, pending_id: 1, message_id: "input", conversation_id: "first",
          input_request_id: route.request().postDataJSON().input_request_id, admission: admission() }
      }
      await route.fulfill({ json: body })
    })
    try {
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
      await page.getByRole("button", { name: "Select first", exact: true }).click()
      await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "first")
      await page.evaluate(async () => { await (await import("/src/lib/i18n/i18n.ts")).i18n.changeLanguage("zh") })
      if (isQueue) {
        await page.getByText("QUEUED_INPUT", { exact: true }).waitFor()
        await page.getByRole("button", { name: scenario === "queue-clear" ? "清空" : "继续执行", exact: true }).click()
        await until(() => mutated, "queue operation must be committed")
      } else {
        await until(() => heldHistory.length, "initial history must remain in flight")
        if (scenario === "history-focus") {
          await page.evaluate(() => window.dispatchEvent(new Event("focus")))
          await page.waitForTimeout(100)
          await heldHistory.shift().fulfill({ status: 503, json: { error: "HISTORY_UNAVAILABLE" } })
        } else {
          await page.locator("textarea").fill("RECEIVED_INPUT")
          await page.locator("textarea").press("Enter")
          await page.locator('[data-chat-row-key="message:input"]').waitFor()
          assert.equal(await page.locator("textarea").inputValue(), "")
          await heldHistory.shift().fulfill({ json: { messages: [], next_seq: 0, page: { has_older: false, before: null } } })
          await until(() => heldHistory.length, "ACK must fetch a post-admission snapshot")
          assert.equal(messageReads, 2, "the older initial page cannot own the ACK projection")
          assert.equal(await page.getByText("RECEIVED_INPUT", { exact: true }).count(), 1)
          await heldHistory.shift().fulfill({ json: { messages: [{ id: "input", conversation_id: "first", timeline_unit_id: "message:input",
            timeline_seq: 1, role: "user", message_type: "input", message_seq: 1, content: "RECEIVED_INPUT", created_at: "2026-10-28T00:00:00Z",
            metadata_json: { input_progress: { message_id: "input", conversation_id: "first", kind: "pre_input", phase: "received" } },
          }], next_seq: 0, page: { has_older: false, before: null } } })
          await page.waitForTimeout(150)
          assert.equal(await page.getByText("RECEIVED_INPUT", { exact: true }).count(), 1, "canonical history takes over the same entity")
          assert.equal(await page.locator('[data-chat-thinking-placeholder]').count(), 0, "a receipt cannot assert a running model")
        }
      }
      if (isQueue || scenario === "history-focus") {
        await page.locator('[data-slot="toast-title"]').filter({ hasText: "加载会话失败" }).waitFor()
        await page.waitForTimeout(200)
        assert.deepEqual(await page.locator('[data-slot="toast-title"]').allTextContents(), ["加载会话失败"], "one history failure, no false mutation failure")
      }
      assert.equal(await page.locator("form .text-destructive").count(), 0)
      assert.deepEqual(errors, [])
      console.log(`Chat history feedback passed: ${scenario}`)
    } finally {
      for (const route of heldHistory.splice(0)) await route.abort().catch(() => {})
      await page.close()
    }
  }
} finally {
  await browser?.close()
  await server.close()
}
