import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required for auth isolation checks")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
const token = (sid, version = 1) => `header.${Buffer.from(JSON.stringify({ sid, version })).toString("base64url")}.signature`
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const scenario of ["hydrate", "hydrate-error", "list", "logout", "401", "confirmation", "body", "same-session-refresh"]) {
    const context = await browser.newContext()
    const page = await context.newPage(), other = await context.newPage()
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await other.goto(`${origin}/scripts/auth-isolation-fixture.html`)
    async function switchSession(id, version = 1) {
      await other.evaluate(({ id, accessToken }) => {
        localStorage.setItem("ineffable.auth.session_id", id)
        localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() + 3600000))
        localStorage.setItem("ineffable.auth.access_token", accessToken)
      }, { id, accessToken: token(id, version) })
    }
    await switchSession("a")
    let release, entered
    const held = new Promise(resolve => { entered = resolve })
    const gate = new Promise(resolve => { release = resolve })
    const mutations = []
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      const authorization = route.request().headers().authorization
      const account = authorization === `Bearer ${token("a")}` ? "a" : "b"
      if (path.endsWith("/probe")) mutations.push(authorization)
      const block = account === "a" && (
        ((scenario === "hydrate" || scenario === "hydrate-error") && path.endsWith("auth/me")) ||
        (scenario === "list" && path.endsWith("conversations/list")) ||
        (scenario === "logout" && path.endsWith("auth/logout")) ||
        (scenario === "401" && path.endsWith("/probe")))
      if (block) { entered(); await gate }
      const status = block && scenario === "hydrate-error" ? 500 : block && scenario === "401" ? 401 : 200
      const body = path.endsWith("auth/me") ? { user: { id: account }, workspaces: [] } : path.endsWith("conversations/list") ? { conversations: [{ id: account, title: account }] } : {}
      await route.fulfill({ status, json: body })
    })
    await page.goto(`${origin}/scripts/auth-isolation-fixture.html`)
    if (!["hydrate", "hydrate-error", "list"].includes(scenario)) await page.waitForFunction(() => window.session?.currentUser?.id === "a" && window.session.conversations.length, null, { timeout: 3000 })
    if (scenario === "logout") await page.evaluate(() => { window.pending = window.session.logout() })
    if (scenario === "401") await page.evaluate(() => { window.pending = window.client.requestApiJson("/gateway/v1/probe", { method: "POST", accessToken: window.session.accessToken }).then(() => "ok", error => error.status) })
    if (["confirmation", "same-session-refresh"].includes(scenario)) await page.evaluate(() => { window.capturedToken = window.session.accessToken })
    if (scenario === "body") {
      await page.evaluate(() => {
        const original = window.fetch
        window.fetch = async (url, options) => {
          if (!String(url).endsWith("/probe")) return original(url, options)
          return new Response(new ReadableStream({ start(controller) { window.releaseBody = () => { controller.enqueue(new TextEncoder().encode('{"old":true}')); controller.close() } } }))
        }
        window.pending = window.client.requestApiJson("/gateway/v1/probe", { accessToken: window.session.accessToken }).then(() => "ok", error => error.status)
      })
    }
    if (["hydrate", "hydrate-error", "list", "logout", "401"].includes(scenario)) await held
    if (scenario === "same-session-refresh") {
      await switchSession("a", 2)
      await page.waitForFunction(expected => window.session.accessToken === expected, token("a", 2))
      await page.evaluate(() => window.client.requestApiJson("/gateway/v1/probe", { method: "POST", accessToken: window.capturedToken }))
      assert.deepEqual(mutations, [`Bearer ${token("a", 2)}`], "same session can use renewed access token")
    } else {
      await switchSession("b")
      await page.waitForFunction(() => window.session?.currentUser?.id === "b" && window.session.conversations[0]?.id === "b")
      if (scenario === "confirmation") {
        const status = await page.evaluate(() => window.client.requestApiJson("/gateway/v1/probe", { method: "POST", accessToken: window.capturedToken }).then(() => "ok", error => error.status))
        assert.equal(status, 409)
        assert.equal(mutations.length, 0, "old confirmation must not issue a new-account mutation")
      }
      if (scenario === "body") await page.evaluate(() => window.releaseBody())
      release()
      if (["body", "401"].includes(scenario)) assert.equal(await page.evaluate(() => window.pending), 409)
      if (scenario === "logout") await page.evaluate(() => window.pending)
      await page.waitForTimeout(100)
      const state = JSON.parse(await page.locator("#snapshot").textContent())
      assert.deepEqual(state, { status: "authenticated", user: "b", conversations: ["b"], bootstrapping: false }, scenario)
      if (scenario === "401") assert.deepEqual(mutations, [`Bearer ${token("a")}`], "401 cannot replay with B's token")
    }
    assert.deepEqual(errors, [], scenario)
    await context.close()
  }
  console.log("auth isolation browser checks passed (8 scenarios)")
} finally { await browser?.close(); await server.close() }
