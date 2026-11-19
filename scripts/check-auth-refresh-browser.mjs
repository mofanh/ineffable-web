import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const token = (sid, version = 1) => `header.${Buffer.from(JSON.stringify({ sid, version })).toString("base64url")}.signature`
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser, releaseOld
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of [429, 503, 401, "session-lock", "resource-status", "refresh-outage"]) {
    const context = await browser.newContext()
    await context.addInitScript(accessToken => {
      localStorage.setItem("ineffable.auth.session_id", "a")
      localStorage.setItem("ineffable.auth.refresh_token", "ra")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() + 3600000))
      localStorage.setItem("ineffable.auth.refresh_expires_at", String(Date.now() + 7200000))
      localStorage.setItem("ineffable.auth.access_token", accessToken)
    }, token("a"))
    let refreshCalls = 0, resourceReads = 0, entered
    const oldStarted = new Promise(resolve => { entered = resolve })
    const oldGate = new Promise(resolve => { releaseOld = resolve })
    await context.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      const actor = route.request().headers().authorization === `Bearer ${token("b")}` ? "b" : "a"
      let status = 200, body = {}
      if (path.endsWith("auth/me")) body = { user: { id: actor }, workspaces: [] }
      else if (path.endsWith("conversations/list")) body = { conversations: [] }
      else if (path.endsWith("auth/refresh")) {
        refreshCalls++
        const old = route.request().postDataJSON().refresh_token === "ra"
        if (scenario === "session-lock" && old) { entered(); await oldGate }
        status = scenario === "refresh-outage" ? 503 : typeof scenario === "string" || refreshCalls > 1 ? 200 : scenario
        const id = old ? "a" : "b"
        body = status === 200 ? { tokens: { session_id: id, access_token: token(id, 2), refresh_token: `r${id}`, access_expires_at: Date.now() + 3600000, refresh_expires_at: Date.now() + 7200000 } } : { error: "fixture refresh rejection" }
      } else if (path.endsWith("/versions")) {
        resourceReads++
        status = Number(new URL(route.request().url()).searchParams.get("status"))
        body = { error: "invalid access token in a resource diagnostic" }
      }
      await route.fulfill({ status, json: body })
    })
    const page = await context.newPage()
    await page.goto(`${origin}/scripts/auth-isolation-fixture.html`)
    await page.waitForFunction(() => window.session?.currentUser?.id === "a" && !window.session.isBootstrapping, null, { timeout: 3000 })
    await page.evaluate(async () => { window.authRuntime = await import("/src/lib/api/auth-session-runtime.ts") })
    if (scenario === "resource-status" || scenario === "refresh-outage") {
      const request = status => page.evaluate(async status => {
        const { requestApi } = await import("/src/lib/api/base-client.ts")
        try {
          return (await requestApi(`/gateway/v1/workspace-objects/a/versions?status=${status}`, { accessToken: window.session.accessToken })).status
        } catch (error) {
          return error.status
        }
      }, status)
      if (scenario === "resource-status") {
        for (const status of [403, 404, 500]) assert.equal(await request(status), status)
        assert.equal(refreshCalls, 0, "only the HTTP status can request a token refresh")
        assert.equal(await request(401), 401)
        assert.equal(resourceReads, 5, "retry an unauthorized request at most once")
      } else {
        assert.equal(await request(401), 503, "surface the actual refresh outage")
        assert.equal(resourceReads, 1)
      }
      assert.equal(refreshCalls, 1)
      assert.equal(await page.evaluate(() => window.session.status), "authenticated")
    } else if (scenario === "session-lock") {
      const other = await context.newPage()
      await other.goto(`${origin}/scripts/auth-isolation-fixture.html`)
      await page.evaluate(() => { window.oldRefresh = window.authRuntime.refreshAuthSession(window.session.accessToken) })
      await oldStarted
      await other.evaluate(accessToken => {
        localStorage.setItem("ineffable.auth.session_id", "b")
        localStorage.setItem("ineffable.auth.refresh_token", "rb")
        localStorage.setItem("ineffable.auth.access_token", accessToken)
      }, token("b"))
      await page.waitForFunction(() => window.session.currentUser?.id === "b")
      await page.evaluate(() => { window.authRuntime.refreshAuthSession(window.session.accessToken).then(token => { window.newRefreshResult = token }) })
      await page.waitForFunction(expected => window.newRefreshResult === expected, token("b", 2), { timeout: 3000 })
      assert.equal(refreshCalls, 2, "B must acquire its own real Web Lock before A completes")
      releaseOld()
      assert.equal(await page.evaluate(() => window.oldRefresh), null)
      assert.equal(await page.evaluate(() => window.session.currentSessionId), "b")
    } else {
      assert.equal(await page.evaluate(() => window.authRuntime.refreshAuthSession(window.session.accessToken)), null)
      if (scenario === 401) {
        await page.waitForFunction(() => window.session.status === "unauthenticated")
        assert.equal(await page.evaluate(() => localStorage.getItem("ineffable.auth.access_token")), null)
      } else {
        assert.equal(await page.evaluate(() => window.session.status), "authenticated", `${scenario} must preserve the valid session`)
        assert.equal(await page.evaluate(() => localStorage.getItem("ineffable.auth.refresh_token")), "ra")
        assert.equal(await page.evaluate(() => window.authRuntime.refreshAuthSession(window.session.accessToken)), token("a", 2), "a later retry can recover")
      }
    }
    await context.close()
  }
  console.log("auth refresh browser checks passed (429/503/401 and real Web Locks)")
} finally { releaseOld?.(); await browser?.close(); await server.close() }
