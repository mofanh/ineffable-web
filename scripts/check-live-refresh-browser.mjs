import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const cursors = []
const streamEvent = (seq, content) => ({type: "event", event: {seq, event: "model.text.delta", content, stream: "chat", phase: "model", run_id: "refresh-run", metadata: {conversation_id: "refresh-conversation", scope: "main", execution_epoch: 1}}})
const server = await createServer({
  root: process.cwd(), logLevel: "error", optimizeDeps: {entries: ["scripts/live-refresh-fixture.html"]},
  plugins: [{ name: "refresh-session-fixture", enforce: "pre", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, "http://localhost")
      if (!url.pathname.endsWith("/subscribe")) return next()
      const cursor = Number(url.searchParams.get("after_seq") ?? 0)
      cursors.push(cursor)
      res.writeHead(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
      for (const event of [streamEvent(1, "REFRESH_PREFIX "), streamEvent(11000, "REFRESH_SUFFIX")]) {
        if (event.event.seq > cursor) res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
      const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 1000)
      res.on("close", () => clearInterval(heartbeat))
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
      return route.continue()
    }
    let body = {items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 11000}
    if (url.pathname.endsWith("/messages")) body = {messages: [], next_seq: 0, page: {has_older: false, before: null}}
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
  assert.deepEqual(errors, [])
  console.log("live run refresh browser checks passed")
} finally { await browser?.close(); await server.close() }
