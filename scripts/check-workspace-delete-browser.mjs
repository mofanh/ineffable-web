import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of ["editor", "event", "folder", "unrelated", "missing", "denied", "missing-space", "denied-space", "login-return", "empty", "stale", "failure", "loading-folder", "loading-folder-404", "loading-other-404"]) {
    const loginReturn = scenario === "login-return"
    const unavailable = loginReturn || ["missing", "denied", "missing-space", "denied-space"].includes(scenario)
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(loginReturn => {
      localStorage.setItem("ineffable.ui.language", "en-US")
      if (loginReturn) return
      localStorage.setItem("ineffable.auth.access_token", "test-token")
      localStorage.setItem("ineffable.auth.session_id", "test-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    }, loginReturn)
    let refreshes = 0
    let latestReads = 0
    let deleted = unavailable
    let release
    let releaseContent
    const file = id => ({ id, workspace_id: "w", parent_id: "folder", kind: "file", name: `${id}.txt`, path: `notes/${id}.txt`, mime_type: "text/plain", updated_at: "2026-09-08T00:00:00Z", current_version_id: `v-${id}` })
    await page.route("**/gateway/v1/**", async route => {
      const url = new URL(route.request().url())
      let body = {}
      let status = 200
      const user = { id: "actor", email: "actor@example.com", display_name: "Actor", role: "user", status: "active" }
      if (url.pathname.endsWith("/auth/login")) body = { user, tokens: { session_id: "test-session", access_token: "test-token", refresh_token: "test-refresh", access_expires_at: Date.now() / 1000 + 3600 } }
      else if (url.pathname.endsWith("/auth/refresh")) { refreshes++; status = 401 }
      else if (url.pathname.endsWith("/auth/me")) body = { user, workspaces: [{ id: "w", name: "Workspace", workspace_type: "personal" }] }
      else if (url.pathname.includes("conversations/list")) body = { conversations: [] }
      else if (url.pathname.endsWith("/directory")) body = { objects: [], next_cursor: null }
      else if (url.pathname.endsWith("/access") && (scenario.endsWith("-space") || loginReturn)) {
        status = scenario === "denied-space" ? 403 : 404
        body = { error: "private workspace detail" }
      }
      else if (url.pathname.endsWith("/access")) body = { workspace: { id: "w", name: "Workspace", workspace_type: "personal", status: "active" }, membership: { role: "owner" }, can_write: true }
      else if (url.pathname.endsWith("latest-file")) {
        latestReads++
        assert.equal(url.searchParams.get("excluded_id"), "a")
        assert.equal(url.searchParams.has("preferred_parent_id"), false, "the server resolves the predecessor directory")
        if (scenario === "stale") await new Promise(resolve => { release = resolve })
        status = scenario === "failure" && latestReads === 1 ? 500 : 200
        body = status === 500 ? { error: "lookup unavailable" } : { object: scenario === "empty" ? null : file(scenario === "stale" ? "c" : "b") }
      } else if (route.request().method() === "DELETE") { deleted = true; body = { object: file("a") } }
      else if (url.pathname.includes("workspace-objects/")) {
        const id = url.pathname.split("workspace-objects/")[1].split("/")[0]
        if (id === "a" && deleted) { status = scenario.startsWith("denied") ? 403 : 404; body = { error: "private object detail" } }
        else body = url.pathname.endsWith("versions") ? { object: file(id), versions: [] } : { object: file(id), content: `Content ${id.toUpperCase()}`, version: { id: `v-${id}`, version_no: 1 } }
      }
      if (scenario.startsWith("loading-") && url.pathname.endsWith("/a/content")) {
        await new Promise(resolve => { releaseContent = resolve })
        if (scenario.endsWith("-404")) { status = 404; body = { error: "private object detail" } }
      }
      await route.fulfill({ status, json: body })
    })
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    const oldLink = "/workspace/10000000-0000-4000-8000-000000000001/objects/20000000-0000-4000-8000-000000000001"
    if (loginReturn) {
      await page.goto(origin + oldLink)
      await page.waitForURL(origin + "/login")
      await page.locator('input[type="email"]').fill("actor@example.com")
      await page.locator('input[autocomplete="current-password"]').fill("fixture-password")
      await page.locator('button[type="submit"]').click()
    } else {
      await page.goto(origin + "/scripts/workspace-delete-fixture.html")
    }
    if (unavailable) {
      await page.getByText("The requested resource was not found.", { exact: true }).waitFor()
      if (loginReturn) assert.equal(page.url(), origin + oldLink)
      else assert.equal(await page.getByTestId("route").textContent(), "/workspace/w/objects/a")
      assert.equal(refreshes, 0)
      assert.equal(await page.evaluate(() => localStorage.getItem("ineffable.auth.access_token")), "test-token")
      assert.equal(latestReads, 0)
      assert.equal(await page.getByText(/private (object|workspace) detail/).count(), 0)
      assert.deepEqual(errors, [], scenario)
      console.log(`PASS workspace link: ${scenario}`)
      await page.close()
      continue
    }
    if (scenario.startsWith("loading-")) {
      while (!releaseContent) await new Promise(resolve => setTimeout(resolve, 10))
      await page.evaluate(path => window.dispatchEvent(new CustomEvent("ineffable:workspace-objects-changed", { detail: { workspaceId: "w", objectId: "folder", path, action: "delete" } })), scenario === "loading-other-404" ? "other" : "notes")
      releaseContent()
    } else await page.getByText("Content A", { exact: true }).waitFor()
    if (scenario === "editor") {
      await page.getByRole("button", { name: "File actions" }).click()
      await page.getByRole("menuitem", { name: "Delete file" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
    } else if (!scenario.startsWith("loading-")) {
      await page.evaluate(({ scenario }) => window.dispatchEvent(new CustomEvent("ineffable:workspace-objects-changed", { detail: { workspaceId: "w", objectId: scenario === "unrelated" ? "other" : scenario === "folder" ? "folder" : "a", path: scenario === "folder" ? "notes" : scenario === "unrelated" ? "notes/other.txt" : "notes/a.txt", action: "delete", source: "user" } })), { scenario })
    }
    if (scenario === "stale") {
      await page.waitForFunction(() => !document.body.textContent.includes("Content A"))
      await page.getByRole("button", { name: "Open B", exact: true }).click()
      await page.getByText("Content B", { exact: true }).waitFor()
      while (!release) await new Promise(resolve => setTimeout(resolve, 10))
      const response = page.waitForResponse(response => response.url().includes("latest-file"))
      release()
      await response
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await page.getByTestId("route").textContent(), "/workspace/w/objects/b")
    }
    if (scenario === "empty") await page.waitForFunction(() => document.querySelector('[data-testid="route"]').textContent === "/workspace/w/objects")
    else if (scenario === "failure") {
      await page.getByText("lookup unavailable", { exact: true }).waitFor()
      assert.equal(await page.getByText("Content A", { exact: true }).count(), 0)
      assert.equal(await page.getByRole("button", { name: "Edit file", exact: true }).count(), 0)
      deleted = true
      await page.getByRole("button", { name: "Reload", exact: true }).click()
      await page.getByText("Content B", { exact: true }).waitFor()
      assert.equal(latestReads, 2)
    } else if (scenario === "loading-other-404") {
      await page.getByText("The requested resource was not found.", { exact: true }).waitFor()
      assert.equal(await page.getByTestId("route").textContent(), "/workspace/w/objects/a")
      assert.equal(latestReads, 0)
    } else if (scenario === "unrelated") {
      assert.equal(latestReads, 0)
      assert.equal(await page.getByText("Content A", { exact: true }).count(), 1)
    } else await page.getByText("Content B", { exact: true }).waitFor()
    if (["editor", "event", "folder"].includes(scenario)) {
      await page.getByRole("button", { name: "Back", exact: true }).click()
      assert.equal(await page.getByTestId("route").textContent(), "/workspace/w/objects/b", "replace must remove the deleted URL from history")
    }
    assert.equal(await page.getByText("private object detail", { exact: true }).count(), 0)
    assert.deepEqual(errors, [], scenario)
    console.log(`PASS workspace delete: ${scenario}`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
