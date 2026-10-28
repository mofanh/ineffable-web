import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const streams = new Set()
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{
  name: "durable-admission-fixture",
  configureServer(server) { server.middlewares.use((req, res, next) => {
    if (!new URL(req.url, "http://localhost").pathname.endsWith("/subscribe")) return next()
    res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write(": connected\n\n")
    streams.add(res); res.on("close", () => streams.delete(res))
  }) },
}] })
let browser, releaseQueue
try {
  await server.listen(); browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ locale: "en-US", viewport: { width: 1100, height: 850 } }), errors = [], sends = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
  })
  let revision = 0, generation = 0, paused = false, queued = false, consuming = false, run = null, messages = [], listCalls = 0, stopCalls = 0, resumes = 0
  let holdQueue = false, staleQueueStarted
  const admission = () => ({ conversation_id: "first", revision, generation, queued_count: queued ? 1 : 0, consuming_count: consuming ? 1 : 0, queue_paused: paused })
  const conversation = () => ({ id: "first", title: "Admission fixture", current_run_id: run?.id ?? null, current_run: run, admission: admission() })
  const inputMessage = () => ({id:"input",timeline_unit_id:"message:input",timeline_seq:1,conversation_id:"first",role:"user",message_type:"input",message_seq:1,content:"WAITING_INPUT",created_at:"2026-10-28T00:00:00Z",metadata_json:{input_progress:{message_id:"input",conversation_id:"first",message_seq:1,kind:"pre_input",phase:queued?"queued":"received",queued_in_timeline:queued&&!paused,run_id:run?.id??null,run_state:run?.status??null}}})
  const queue = () => ({ pending_inputs: queued ? [{ id: 1, message_id: "input", conversation_id: "first", content: "WAITING_INPUT", kind: "pre_input", status: "queued", run_id: null, queued_in_timeline: !paused }] : [], input_progress: [], admission: admission(), can_resume: queued && paused, blocked_by_run_status: null, blocked_by_run_id: null, blocked_by_error_code: null })
  await page.route("**/gateway/**", async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/subscribe")) return route.continue()
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [] }
    else if (path.endsWith("conversations/list")) { listCalls++; body = { conversations: [conversation()] } }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/get")) body = conversation()
    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", enabled: true }] }
    else if (path.endsWith("/messages")) body = { messages: (queued && !paused || consuming) ? [inputMessage(),...messages] : messages, next_seq: run?.lifecycle_seq ?? 0, page: { has_older: false, before: null } }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    else if (path.endsWith("/pending-inputs/resume")) { resumes++; paused = false; generation++; revision++; body = { ok: true, released: 1 } }
    else if (path.endsWith("/pending-inputs")) {
      body = structuredClone(queue())
      if (holdQueue) { holdQueue = false; staleQueueStarted?.(); await new Promise(resolve => { releaseQueue = resolve }) }
    } else if (path.endsWith("/stop")) { stopCalls++; paused = true; generation++; revision++; body = { ok: true, cancelled: true } }
    else if (path.endsWith("/send")) {
      const payload = route.request().postDataJSON(); sends.push(payload); queued = true; revision++
      body = { status: "queued", queued_in_timeline: true, pending_id: 1, message_id: "input", conversation_id: "first", input_request_id: payload.input_request_id, admission: admission() }
    }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button", { name: "Select first", exact: true }).click()
  const composer = page.locator("textarea")
  await composer.fill("WAITING_INPUT")
  holdQueue = true
  const held = new Promise(resolve => { staleQueueStarted = resolve })
  await composer.press("Enter")
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector("textarea")?.getAttribute("aria-busy") === "false")
  assert.equal(sends.length, 1); assert.equal(streams.size, 0, "admission without a run never opens a run SSE")
  assert.equal(run, null)
  await page.locator('[data-chat-row-key="message:input"]').waitFor()
  assert.equal(await page.getByText("WAITING_INPUT",{exact:true}).count(),1,"received input appears once while claim is held")
  assert.equal(await page.getByRole("button",{name:"Clear",exact:true}).count(),0,"idle head must not flash the queue")
  // Keep an old unpaused queue GET in flight while Stop commits a newer revision.
  await Promise.race([held, new Promise((_, reject) => setTimeout(() => reject(new Error("background queue GET was not observed")), 8000))])
  await page.getByRole("button", { name: "Stop", exact: true }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).waitFor()
  assert.equal(await page.locator('[data-chat-row-key="message:input"]').count(),0,"paused input returns to queue")
  assert.equal(await page.getByText("WAITING_INPUT",{exact:true}).count(),1,"paused input stays visible in one location")
  assert.equal(await page.getByRole("button",{name:"Clear",exact:true}).count(),1,"paused input retains queue controls")
  assert.equal(stopCalls, 1); assert.equal(run, null, "Stop before claim must not create a run")
  releaseQueue(); await page.waitForTimeout(150)
  assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 1)
  assert.equal(await page.getByRole("button", { name: "Stop", exact: true }).count(), 0)
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor()
  assert.equal(resumes, 1)
  // Rebuild from server history and pending snapshots, without a local send flag.
  holdQueue=false
  await page.reload()
  await page.getByRole("button",{name:"Select first",exact:true}).click()
  await page.locator('[data-chat-row-key="message:input"]').waitFor()
  assert.equal(await page.getByText("WAITING_INPUT",{exact:true}).count(),1)
  assert.equal(await page.getByRole("button",{name:"Clear",exact:true}).count(),0)
  // A new draft must still observe a queued conversation, with no fake run.
  await page.getByRole("button", { name: "New conversation", exact: true }).click()
  const before = listCalls
  await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "new")
  const deadline = Date.now() + 8000
  while (listCalls <= before && Date.now() < deadline) await page.waitForTimeout(50)
  assert.ok(listCalls > before, "pending-only background conversation remains observed")
  queued = false; consuming = true; revision++
  // Between claim and the first recorder event, only the consuming fact keeps
  // this background conversation observable.
  const claimedBefore = listCalls
  const claimedDeadline = Date.now() + 12000
  while (listCalls < claimedBefore + 2 && Date.now() < claimedDeadline) await page.waitForTimeout(50)
  assert.ok(listCalls >= claimedBefore + 2, "claimed work without a visible run must remain observed")
  run = { id: "real-run", status: "streaming", version: 1, execution_epoch: 1, lifecycle_seq: 1, is_live: true, is_streaming: true }
  await page.getByRole("button", { name: "Select first", exact: true }).click()
  const connected = Date.now() + 8000
  while (!streams.size && Date.now() < connected) await page.waitForTimeout(20)
  assert.equal(streams.size, 1, "the actual canonical run opens the existing subscription")
  let seq = 1
  const emit = (event, content) => { for (const stream of streams) stream.write(`data: ${JSON.stringify({ type: "event", event: { event, seq: ++seq, run_id: "real-run", stream: "chat", content, scope: "main", metadata: { conversation_id: "first", conversation_run_id: "real-run", execution_epoch: 1, run_version: 1, transcript_segment: { id: "real-run:1:1", turn: 1, execution_epoch: 1 } } } })}\n\n`) }
  emit("run.started", null); emit("model.text.delta", "REAL_EXECUTION_RESULT")
  await page.getByText("REAL_EXECUTION_RESULT", { exact: true }).waitFor()
  messages = [{ id: "result", conversation_id: "first", run_id: "real-run", role: "assistant", message_type: "text", message_seq: 1, content: "REAL_EXECUTION_RESULT", metadata_json: {}, created_at: "2026-10-25T00:00:00Z" }]
  consuming = false
  run = { ...run, status: "completed", version: 2, lifecycle_seq: seq + 1, is_live: false, is_streaming: false }; revision++
  emit("run.completed", null)
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor({ state: "hidden" })
  assert.equal(sends.length, 1, "observing and resuming never resends the original input")
  assert.deepEqual(errors, [])
  console.log("durable admission, NULL-run Stop/resume, stale queue GET and canonical SSE handoff checks passed")
} finally { releaseQueue?.(); for (const stream of streams) stream.end(); await browser?.close(); await server.close() }
