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
  let waiting = true
  let summaryReady = false
  const root = { id: "today", title: "2026-09-15", kind: "daily_root", root_ends_at: "2099-01-01T00:00:00Z", last_message_at: "2026-09-15T10:00:00Z", current_run_id: "failed-root-run", current_run: {id:"failed-root-run",status:"failed",is_streaming:false,is_live:false} }
  const old = { ...root, id: "old", title: "2026-09-14", current_run_id:null, current_run:null, root_ends_at: "2000-01-01T00:00:00Z" }
  const task = { id: "task", title: "Independent task", kind: "task", current_run: null }
  const sends = []
  await page.route("**/gateway/v1/**", async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: workspace, name: "Workspace", kind: "personal" }], current_workspace_id: workspace }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", day_start_minutes: 240, version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/list")) body = { conversations: [root, old, task] }
    else if (path.endsWith("conversations/today")) { todayCalls++; body = root }
    else if (path.endsWith("conversations/create")) { taskCalls++; body = { id: "task", title: "Task", kind: "task", current_run: null } }
    else if (path.endsWith("conversations/get")) body = url.searchParams.get("conversation_id") === "old" ? old : url.searchParams.get("conversation_id") === "task" ? task : {...root,daily_handoff:{waiting,conversation_id:"task",occurrence_id:"nightly",deadline:"2099-01-01T00:00:00Z"},daily_summary:summaryReady?{status:"accepted",occurrence_id:"nightly",workspace_id:workspace,object_id:"summary-object",version_id:"summary-version"}:null}
    else if (path.endsWith("/messages")) body = { messages: [{ id: "history", conversation_id: url.searchParams.get("conversation_id"), message_seq: 1, role: "user", message_type: "input", content: "EXISTING_DAILY_HISTORY", metadata_json: { input_progress: { message_id: "history", conversation_id: url.searchParams.get("conversation_id"), phase: "accepted", kind: "pre_input", task_source: { conversation_id: "old", run_id: "source-run" } } }, created_at: "2026-09-15T10:00:00Z" }, { id: "result", conversation_id: url.searchParams.get("conversation_id"), message_seq: 2, role: "system", message_type: "system", content: "Task run status data", metadata_json: { task_result: { conversation_id: "task", run_id: "task-run", outcome: "completed", title: "Task result card" } }, created_at: "2026-09-15T10:00:01Z" }], next_seq: 0, page: { has_older: false, before: null } }
    else if (path.endsWith("conversations/events") && summaryReady) body={events:[{type:"event",event:{run_id:"conversation:today",seq:50,ts_ms:0,stream:"chat",event:"conversation.daily_summary",metadata:{event_scope:"conversation",conversation_id:"today"}}}],next_seq:50}
    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", supports_tool_calls: true, enabled: true }] }
    else if (path.endsWith("/send")) {
      sends.push(route.request().postDataJSON())
      return route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"event",event:{seq:10,ts_ms:0,stream:"chat",event:"run.failed",content:"ROOT_FAILURE_FIXTURE",run_id:"failed-root-run",metadata:{conversation_id:"today",conversation_run_id:"failed-root-run",execution_epoch:1}}})}\n\n`})
    }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button", { name: "Go to today", exact: true }).click()
  await page.getByText("EXISTING_DAILY_HISTORY", { exact: true }).waitFor()
  assert.equal(await page.locator("[data-selection]").textContent(), "today")
  await page.getByText("Consolidating yesterday; new messages will be queued",{exact:true}).waitFor()
  waiting=false
  await page.getByText("Consolidating yesterday; new messages will be queued",{exact:true}).waitFor({state:"hidden",timeout:10000})
  const composer=page.locator("textarea").first()
  await composer.fill("Trigger fixture failure")
  await composer.press("Enter")
  await page.getByText(/ROOT_FAILURE_FIXTURE/).first().waitFor()
  // The actual run.failed handler has now set streamStatus=error.
  summaryReady=true
  await page.getByText("Open daily summary",{exact:true}).waitFor({timeout:15000})
  await page.getByText("Task instruction from a daily conversation", { exact: true }).waitFor()
  await page.getByText("This run completed", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Open task", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "task")
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
  assert.equal(sends.length, 1, "only the explicit failure fixture sends input; navigation never executes a model")
  assert.deepEqual(errors, [])
  console.log("daily conversation browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
