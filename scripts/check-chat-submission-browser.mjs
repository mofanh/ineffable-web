import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const pending = [], streams = new Set()
const lanAddress = Object.values(networkInterfaces()).flat().find(entry => entry?.family === "IPv4" && !entry.internal)?.address
assert.ok(lanAddress, "A non-loopback IPv4 address is required to test an actual insecure LAN origin")
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
}], server: { host: "0.0.0.0", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of ["insecure-new", "insecure-existing", "unsupported-browser", "workspace-reselect", "conversation-reselect", "create-failure", "cursor-failure", "old-eof", "old-error"]) {
    console.log(`submission ownership: ${scenario}`)
    const page = await browser.newPage(), errors = [], initializers = [], created = []
    page.on("pageerror", error => errors.push(error.message))
    pending.length = 0
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "fixture-token")
      localStorage.setItem("ineffable.auth.session_id", "fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.auth.workspace_id", "personal")
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
    })
    if (scenario === "unsupported-browser") await page.addInitScript(() => { delete Crypto.prototype.randomUUID })
    const conversation = id => ({ id, title: id, current_run: null })
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith("/send") || path.endsWith("/subscribe")) return route.continue()
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 }
      if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: "personal", name: "Personal", workspace_type: "personal" }] }
      else if (path.endsWith("conversations/list")) body = { conversations: [conversation("first"), conversation("other")] }
      else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
      else if (path.endsWith("conversations/create")) {
        created.push(route.request().postDataJSON())
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
      const insecure = scenario.startsWith("insecure-")
      await page.goto(`http://${insecure ? lanAddress : "127.0.0.1"}:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
      const composer = page.locator("textarea")
      await composer.waitFor()
      if (!["create-failure", "cursor-failure", "insecure-new"].includes(scenario)) {
        await page.getByRole("button", { name: "Select first", exact: true }).click()
        await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "first")
      }
      if (insecure || scenario === "unsupported-browser") {
        assert.deepEqual(await page.evaluate(() => ({ secure: window.isSecureContext, uuid: typeof crypto.randomUUID })), { secure: !insecure, uuid: "undefined" })
        if (scenario === "insecure-existing") await page.evaluate(async () => { await (await import("/src/lib/i18n/i18n.ts")).i18n.changeLanguage("zh") })
        const expected = scenario === "unsupported-browser"
          ? "This browser lacks a feature required to send messages. Update your browser and try again."
          : scenario === "insecure-existing"
            ? "当前连接不安全，无法发送消息。请通过 HTTPS 地址访问；本机开发可使用 localhost。"
            : "Messages cannot be sent over this insecure connection. Open an HTTPS address, or use localhost for development on this computer."
        await composer.fill("keep this draft")
        for (const [index, action] of [() => composer.press("Enter"), () => page.locator('button[type="submit"]').click()].entries()) {
          await action()
          await page.waitForFunction(count => document.querySelectorAll('[data-slot="toast-description"]').length === count, index + 1)
          await page.locator('[data-slot="toast-description"]').filter({ hasText: expected }).last().waitFor()
          await idle()
          assert.equal(await composer.inputValue(), "keep this draft", "failed preflight keeps the draft")
          assert.equal(await composer.getAttribute("readonly"), null, "failed preflight never locks the composer")
          assert.equal(pending.length, 0, "unsupported environment issues no send")
          assert.equal(created.length, 0, "unsupported environment creates no conversation")
        }
        assert.deepEqual(errors, [])
        continue
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
  console.log("LAN HTTPS/browser toasts, submission ACK, failure and stale-stream ownership checks passed")
} finally {
  await browser?.close()
  for (const stream of streams) stream.end()
  await server.close()
}
