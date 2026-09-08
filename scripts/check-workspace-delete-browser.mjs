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
  for (const scenario of ["editor", "event", "folder", "unrelated", "missing", "empty", "stale", "failure"]) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "test-token")
      localStorage.setItem("ineffable.auth.session_id", "test-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    })
    let latestReads = 0
    let deleted = scenario === "missing"
    let release
    const file = id => ({ id, workspace_id: "w", parent_id: "folder", kind: "file", name: `${id}.txt`, path: `notes/${id}.txt`, mime_type: "text/plain", updated_at: "2026-09-08T00:00:00Z", current_version_id: `v-${id}` })
    await page.route("**/gateway/v1/**", async route => {
      const url = new URL(route.request().url())
      let body = {}
      let status = 200
      if (url.pathname.endsWith("auth/me")) body = { user: { id: "actor", email: "actor@example.com", display_name: "Actor", role: "user", status: "active" }, workspaces: [{ id: "w", name: "Workspace", workspace_type: "personal" }] }
      else if (url.pathname.includes("conversations/list")) body = { conversations: [] }
      else if (url.pathname.endsWith("latest-file")) {
        latestReads++
        assert.equal(url.searchParams.get("excluded_id"), "a")
        if (scenario !== "missing") assert.equal(url.searchParams.get("preferred_parent_id"), "folder")
        if (scenario === "stale") await new Promise(resolve => { release = resolve })
        status = scenario === "failure" ? 500 : 200
        body = scenario === "failure" ? { error: "lookup unavailable" } : { object: scenario === "empty" ? null : file(scenario === "stale" ? "c" : "b") }
      } else if (route.request().method() === "DELETE") { deleted = true; body = { object: file("a") } }
      else if (url.pathname.includes("workspace-objects/")) {
        const id = url.pathname.split("workspace-objects/")[1].split("/")[0]
        if (id === "a" && deleted) { status = 404; body = { error: "object not found" } }
        else body = url.pathname.endsWith("versions") ? { versions: [] } : { object: file(id), content: `Content ${id.toUpperCase()}`, version: { id: `v-${id}`, version_no: 1 } }
      }
      await route.fulfill({ status, json: body })
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/workspace-delete-fixture.html`)
    if (scenario !== "missing") await page.getByText("Content A", { exact: true }).waitFor()
    if (scenario === "editor") {
      await page.getByRole("button", { name: "File actions" }).click()
      await page.getByRole("menuitem", { name: "Delete file" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
    } else if (scenario !== "missing") {
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
    } else if (scenario === "unrelated") {
      assert.equal(latestReads, 0)
      assert.equal(await page.getByText("Content A", { exact: true }).count(), 1)
    } else await page.getByText("Content B", { exact: true }).waitFor()
    if (["editor", "event", "folder", "missing"].includes(scenario)) {
      await page.getByRole("button", { name: "Back", exact: true }).click()
      assert.equal(await page.getByTestId("route").textContent(), "/workspace/w/objects/b", "replace must remove the deleted URL from history")
    }
    assert.equal(await page.getByText("object not found", { exact: true }).count(), 0)
    assert.deepEqual(errors, [], scenario)
    console.log(`PASS workspace delete: ${scenario}`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
