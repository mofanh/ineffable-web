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
  let retiredCalls = 0
  let createCalls = 0
  const workspace = "00000000-0000-0000-0000-000000000001"
  const root = { id: "today", title: "2026-09-15", last_message_at: "2026-09-15T10:00:00Z", current_run_id: "failed-root-run", current_run: {id:"failed-root-run",status:"failed",is_streaming:false,is_live:false} }
  const old = { ...root, id: "old", title: "2026-09-14", current_run_id:null, current_run:null }
  const task = { id: "task", title: "Independent task", current_run: null }
  const sends = []
  await page.route("**/gateway/v1/**", async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: workspace, name: "Workspace", kind: "personal" }], current_workspace_id: workspace }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/list")) body = { conversations: [root, old, task] }
    else if (path.endsWith("conversations/today")) { retiredCalls++; body = root }
    else if (path.endsWith("conversations/create")) { createCalls++; body = { id: "task", title: "Task", current_run: null } }
    else if (path.endsWith("conversations/get")) body = url.searchParams.get("conversation_id") === "old" ? old : url.searchParams.get("conversation_id") === "task" ? task : root
    else if (path.endsWith("/messages")) body = { messages: [{ id: "history", conversation_id: url.searchParams.get("conversation_id"), message_seq: 1, role: "user", message_type: "input", content: "EXISTING_DAILY_HISTORY", metadata_json: { input_progress: { message_id: "history", conversation_id: url.searchParams.get("conversation_id"), phase: "accepted", kind: "pre_input", task_source: { conversation_id: "old", run_id: "source-run" } } }, created_at: "2026-09-15T10:00:00Z" }, { id: "result", conversation_id: url.searchParams.get("conversation_id"), message_seq: 2, role: "system", message_type: "system", content: "Task run status data", metadata_json: { task_result: { conversation_id: "task", run_id: "task-run", outcome: "completed", title: "Task result card" } }, created_at: "2026-09-15T10:00:01Z" }], next_seq: 0, page: { has_older: false, before: null } }

    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", supports_tool_calls: true, enabled: true }] }
    else if (path.endsWith("/send")) {
      sends.push(route.request().postDataJSON())
      return route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"event",event:{seq:10,ts_ms:0,stream:"chat",event:"run.failed",content:"ROOT_FAILURE_FIXTURE",run_id:"failed-root-run",metadata:{conversation_id:route.request().postDataJSON().conversation_id,conversation_run_id:"failed-root-run",execution_epoch:1}}})}\n\n`})
    }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  assert.equal(await page.getByRole("button",{name:"Go to today",exact:true}).count(),0)
  await page.getByTitle("New conversation",{exact:true}).first().click()
  await page.getByRole("button",{name:"2026-09-14",exact:true}).click()
  await page.getByText("EXISTING_DAILY_HISTORY", {exact:true}).waitFor()
  assert.equal(await page.locator("textarea").first().getAttribute("readonly"),null)
  await page.getByRole("button",{name:"Edit conversation title",exact:true}).waitFor()
  await page.getByText("Task instruction from another conversation",{exact:true}).waitFor()
  await page.getByText("This run completed",{exact:true}).waitFor()
  const composer=page.locator("textarea").first()
  await composer.fill("Continue this old conversation")
  await composer.press("Enter")
  await page.getByText(/ROOT_FAILURE_FIXTURE/).first().waitFor()
  assert.equal(sends[0].conversation_id,"old")
  await page.getByRole("button",{name:"New conversation",exact:true}).click()
  assert.equal(await page.locator("[data-selection]").textContent(),"new")
  assert.equal(retiredCalls,0)
  assert.equal(createCalls,0,"opening a draft does not create a persisted conversation")
  assert.deepEqual(errors, [])
  console.log("ordinary conversation browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
