import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const pending = [], streams = new Set()
const server = await createServer({ root: process.cwd(), logLevel: "error", plugins: [{
  name: "submission-stream-fixture",
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    const path = new URL(req.url, "http://localhost").pathname
    if (path.endsWith("/subscribe")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" }); res.write(": ready\n\n")
    } else if (path === "/gateway/v1/conversations/send") {
      let body = ""
      for await (const chunk of req) body += chunk
      pending.push({ res, payload: JSON.parse(body) })
    } else return next()
    streams.add(res); res.on("close", () => streams.delete(res))
  }) },
}], server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of ["workspace-reselect", "conversation-reselect", "create-failure", "cursor-failure", "old-eof", "old-error"]) {
    console.log(`submission ownership: ${scenario}`)
    const page = await browser.newPage(), errors = [], initializers = []
    page.on("pageerror", error => errors.push(error.message))
    pending.length = 0
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "fixture-token")
      localStorage.setItem("ineffable.auth.session_id", "fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.auth.workspace_id", "personal")
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
    })
    const conversation = id => ({ id, title: id, current_run: null })
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith("/send") || path.endsWith("/subscribe")) return route.continue()
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
      if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: "personal", name: "Personal", workspace_type: "personal" }] }
      else if (path.endsWith("conversations/list")) body = { conversations: [conversation("first"), conversation("other")] }
      else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
      else if (path.endsWith("conversations/create")) {
        if (scenario === "create-failure" && initializers.length === 0) { initializers.push(route); return }
        body = conversation("created")
      } else if (path.endsWith("conversations/get")) body = conversation(new URL(route.request().url()).searchParams.get("conversation_id"))
      else if (path.endsWith("/messages")) body = { messages: [], next_seq: 0, page: { has_older: false, before: null } }
      else if (path.endsWith("/events") && scenario === "cursor-failure" && new URL(route.request().url()).searchParams.get("after_seq") === String(Number.MAX_SAFE_INTEGER) && initializers.length === 0) { initializers.push(route); return }
      else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", enabled: true }] }
      else if (path.endsWith("/observations/access")) body = { allowed: false }
      await route.fulfill({ json: body })
    })
    const wait = async (predicate, label) => {
      const deadline = Date.now() + 8_000
      while (!predicate() && Date.now() < deadline) await page.waitForTimeout(10)
      assert.ok(predicate(), label)
    }
    const idle = () => page.waitForFunction(() => document.querySelector("textarea")?.getAttribute("aria-busy") === "false")
    const ack = (item, close = true) => {
      item.res.writeHead(200, { "Content-Type": "text/event-stream" })
      item.res.write(`data: ${JSON.stringify({ status: "queued", queue_len: 1, pending_id: pending.indexOf(item) + 1, conversation_id: item.payload.conversation_id })}\n\n`)
      if (close) item.res.end()
    }
    try {
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
      const composer = page.locator("textarea")
      await composer.waitFor()
      if (!["create-failure", "cursor-failure"].includes(scenario)) {
        await page.getByRole("button", { name: "Select first", exact: true }).click()
        await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "first")
      }
      await composer.fill("first task"); await composer.press("Enter")
      if (scenario.endsWith("failure")) {
        await wait(() => initializers.length === 1, "initialization waits before send")
        const version = await page.locator("[data-selection-version]").textContent()
        await page.getByRole("button", { name: "Reselect workspace", exact: true }).click()
        assert.notEqual(await page.locator("[data-selection-version]").textContent(), version)
        await initializers[0].fulfill({ status: 503, json: { error: "fixture initialization failed" } })
        await idle()
        assert.equal(pending.length, 0, "failed initialization did not send")
      } else {
        await wait(() => pending.length === 1, "first POST reached actual fixture socket")
        if (scenario.endsWith("reselect")) {
          const version = await page.locator("[data-selection-version]").textContent()
          await page.getByRole("button", { name: scenario === "workspace-reselect" ? "Reselect workspace" : "Select first", exact: true }).click()
          assert.notEqual(await page.locator("[data-selection-version]").textContent(), version)
          ack(pending[0]); await idle()
        } else {
          ack(pending[0], false); await idle()
        }
      }
      assert.equal(await composer.getAttribute("readonly"), null, "stale completion released its submission lock")
      await composer.fill("second task"); await composer.press("Enter")
      const count = scenario.endsWith("failure") ? 1 : 2
      await wait(() => pending.length === count, "subsequent input reaches send")
      assert.equal(pending.at(-1).payload.content, "second task")
      if (scenario.startsWith("old-")) {
        if (scenario === "old-eof") pending[0].res.end()
        else pending[0].res.destroy()
        await page.waitForTimeout(150)
        assert.equal(await composer.getAttribute("aria-busy"), "true", "old stream cannot release a newer pending submission")
        assert.equal(await composer.getAttribute("readonly"), "", "new submission stays locked until its own ACK")
      }
      ack(pending.at(-1)); await idle()
      assert.equal(await composer.getAttribute("readonly"), null)
      assert.deepEqual(errors, [])
    } finally {
      await page.close()
      for (const stream of streams) stream.end()
    }
  }
  console.log("submission ACK, failure and stale-stream ownership checks passed")
} finally {
  await browser?.close()
  for (const stream of streams) stream.end()
  await server.close()
}
