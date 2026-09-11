import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const cursors = []
const streams = new Set()
let holdHistory = false
let releaseHistory = null
const streamEvent = (seq, content) => ({type: "event", event: {seq, event: "model.text.delta", content, stream: "chat", phase: "model", run_id: "refresh-run", metadata: {conversation_id: "refresh-conversation", scope: "main", execution_epoch: 1, replayed: true}}})
const oldWait = streamEvent(2, "")
oldWait.event.event = "run.awaiting_human"
oldWait.event.metadata.pending_need = {kind: "user_input", need_id: "answered-need", questions: [{id: "q", question: "Old question", options: []}]}
const resumed = streamEvent(3, "")
resumed.event.event = "run.resumed"
resumed.event.metadata.execution_epoch = 2
const suffix = streamEvent(11000, "REFRESH_SUFFIX")
suffix.event.metadata.execution_epoch = 2
const replay = [streamEvent(1, "REFRESH_PREFIX "), oldWait, resumed, suffix]
let failStream = false
let history = []
let coverage = 0
const server = await createServer({
  root: process.cwd(), logLevel: "error", optimizeDeps: {entries: ["scripts/live-refresh-fixture.html"]},
  plugins: [{ name: "refresh-session-fixture", enforce: "pre", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://localhost")
      if (!url.pathname.endsWith("/subscribe")) return next()
      const cursor = Number(url.searchParams.get("after_seq") ?? 0)
      cursors.push(cursor)
      res.writeHead(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
      for (const event of replay) {
        if (event.event.seq > cursor) res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
      streams.add(res)
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 1000)
      res.on("close", () => { streams.delete(res); clearInterval(heartbeat) })
    })
  }, resolveId(id) {
    if (id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return resolve("scripts/live-refresh-session-fixture.ts")
  } }],
  server: { host: "127.0.0.1", port: 0 },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ locale: "zh-CN" })
  const errors = []
  page.on("pageerror", e => errors.push(e.message))
  const run = { id: "refresh-run", status: "streaming", is_streaming: true, is_live: true }
  const conversation = { id: "refresh-conversation", title: "Refresh test", current_run_id: run.id, current_run: run }
  await page.route("**/gateway/**", async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith("/subscribe")) {
      if (failStream) return route.fulfill({status: 503, body: "temporarily unavailable"})
      return route.continue()
    }
    let body = {items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 11000}
    if (url.pathname.endsWith("/messages")) {
      body = {messages: history, next_seq: coverage, page: {has_older: false, before: null}}
      if (holdHistory) await new Promise(resolve => { releaseHistory = resolve })
    }
    if (failStream && url.pathname.endsWith("/events")) {
      const after = Number(url.searchParams.get("after_seq") ?? 0)
      if (after === 0) body = {events: Array.from({length: 200}, (_, i) => {
        const e = streamEvent(i + 1, "OLD_RUN")
        e.event.run_id = "older-run"
        return e
      }), next_seq: 200}
      else if (after < 11000) body = {events: [streamEvent(201, "REFRESH_PREFIX "), suffix], next_seq: 11000}
    }
    if (url.pathname.endsWith("/get")) body = conversation
    if (url.pathname.endsWith("/observations/access")) body = {allowed: false}
    await route.fulfill({contentType:"application/json",body:JSON.stringify(body)})
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`)
  await page.getByText("REFRESH_PREFIX REFRESH_SUFFIX", {exact: true}).waitFor({timeout: 15000})
  await page.evaluate(() => sessionStorage.setItem("ineffable:conversation-stream-resume", JSON.stringify({version:2, conversations:{"refresh-conversation":{conversationId:"refresh-conversation",runId:"refresh-run",afterSeq:10999}}})))
  const before = cursors.length
  await page.reload()
  await page.getByText("REFRESH_PREFIX REFRESH_SUFFIX", {exact: true}).waitFor({timeout: 15000})
  assert.equal(cursors[before], 0, "reload must replay omitted history despite the saved transport cursor")
  assert.equal(await page.getByText("REFRESH_PREFIX REFRESH_SUFFIX", {exact: true}).count(), 1)
  // The real history mapper must preserve independent output around tools.
  const message = (id, type, content, metadata = {}) => ({id, conversation_id: conversation.id, run_id: run.id,
    role: type === "tool_result" ? "tool" : "assistant", message_type: type, content,
    metadata_json: {scope: "main", ...metadata}, created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T00:00:00Z",
    timeline_seq: 1, timeline_unit_id: "run:refresh-run:anchor:1"})
  history = [message("a", "output", "BEFORE_TOOL"),
    message("tool", "tool_call", "", {tool_call_id: "call", tool_name: "read_file", full_arguments: "{}"}),
    message("result", "tool_result", "ok", {tool_call_id: "call", tool_name: "read_file", status: "succeeded"}),
    message("b", "output", "AFTER_TOOL ")]
  coverage = 10
  await page.reload()
  await page.getByText("BEFORE_TOOL", {exact: true}).waitFor()
  await page.getByText(/AFTER_TOOL\s*REFRESH_SUFFIX/).waitFor({timeout:15000})
  assert.equal(await page.getByText("BEFORE_TOOL", {exact: true}).count(), 1)
  // A late history response cannot replace live content beyond its coverage.
  holdHistory = true
  const accepted = streamEvent(11001, "")
  accepted.event.event = "input.accepted"
  accepted.event.metadata.execution_epoch = 2
  accepted.event.metadata.replayed = false
  for (const stream of streams) stream.write(`data: ${JSON.stringify(accepted)}\n\n`)
  const deadline = Date.now() + 5000
  while (!releaseHistory && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(releaseHistory, "live input acceptance requests history reconciliation")
  const tail = streamEvent(11002, " COVERAGE_TAIL")
  tail.event.metadata.execution_epoch = 2
  for (const stream of streams) stream.write(`data: ${JSON.stringify(tail)}\n\n`)
  await page.getByText(/COVERAGE_TAIL/).waitFor()
  holdHistory = false
  releaseHistory()
  await page.waitForTimeout(250)
  assert.equal(await page.getByText(/COVERAGE_TAIL/).count(), 1, "late canonical prefix must not erase a newer suffix")
  // When SSE is unavailable, scanning another run must still advance the HTTP cursor.
  failStream = true
  history = []
  coverage = 0
  await page.reload()
  await page.getByText("REFRESH_PREFIX REFRESH_SUFFIX", {exact: true}).waitFor({timeout: 15000})
  assert.equal(await page.getByText("OLD_RUN", {exact: true}).count(), 0)
  assert.deepEqual(errors, [])
  console.log("live run refresh browser checks passed")
} finally { await browser?.close(); await server.close() }
