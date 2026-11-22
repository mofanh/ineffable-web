import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture, workspace, team } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath)
const output = join(tmpdir(), "ineffable-workspace-navigation")
mkdirSync(output, { recursive: true })
const server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const mode of ["owner", "viewer", "archived"]) {
    const canWrite = mode === "owner"
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await installShellFixture(page, false)
    if (mode === "archived") await page.route("**/gateway/v1/auth/me", route => route.fulfill({ json: { user: { id: "user", email: "fixture@example.test", role: "user", status: "active" }, workspaces: [{ id: team, name: "Team", workspace_type: "team" }] } }))
    const writes = []
    let objects = [{ id: "source", workspace_id: workspace, kind: "file", name: "Source.md", path: "Source.md", parent_id: null, mime_type: "text/markdown", current_version_id: "v1", created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" }]
    let releaseContent
    let delayContent = false
    await page.route(`**/gateway/v1/workspaces/${workspace}/access`, route => route.fulfill({ json: { workspace: { id: workspace, name: "Personal", workspace_type: "personal", status: mode === "archived" ? "archived" : "active" }, membership: { role: canWrite ? "owner" : "viewer" }, can_write: canWrite } }))
    await page.route(`**/gateway/v1/workspaces/${workspace}/directory?*`, route => route.fulfill({ json: { objects, next_cursor: null } }))
    await page.route("**/gateway/v1/workspace-objects/source/content*", async route => {
      if (delayContent) await new Promise(resolve => { releaseContent = resolve })
      await route.fulfill({ json: { object: objects[0], content: "copy source", version: { id: "v1" } } })
    })
    await page.route("**/gateway/v1/workspace-objects/*", async route => {
      const request = route.request(), id = new URL(request.url()).pathname.split("/").at(-1)
      if (!["PATCH", "DELETE"].includes(request.method())) return route.fallback()
      writes.push(request.method())
      const object = objects.find(item => item.id === id)
      if (request.method() === "PATCH") Object.assign(object, request.postDataJSON(), { path: request.postDataJSON().name })
      else objects = objects.filter(item => item.id !== id)
      await route.fulfill({ json: { object } })
    })
    for (const kind of ["files", "folders"]) await page.route(`**/gateway/v1/workspaces/${workspace}/${kind}`, async route => {
      writes.push(`POST ${kind}`)
      const payload = route.request().postDataJSON()
      const object = { ...objects[0], id: `created-${writes.length}`, ...payload, path: payload.name, kind: kind === "files" ? "file" : "folder" }
      objects.push(object)
      await route.fulfill({ json: { object } })
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat`)
    const root = page.locator(`[data-slot="workspace-navigation"] a[href="/workspace/${workspace}/objects"]`)
    await page.locator('[data-slot="workspace-navigation"]').waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(fixture.requests.filter(request => request.path.endsWith("/directory")).length, 0)
    if (mode === "archived") {
      assert.equal(await root.count(), 0, "archived root is absent from active navigation")
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/workspace/${workspace}/objects`)
    } else await root.click()
    const tree = page.locator('[data-slot="workspace-files-navigation"]')
    const source = tree.getByRole("button", { name: "Source.md", exact: true })
    await source.waitFor()
    await page.screenshot({ path: join(output, `${mode}-workspace-root.png`) })
    assert.equal(fixture.requests.filter(request => request.path.includes(team) && request.path.endsWith("/directory")).length, 0, "resource only loads the selected root")
    await tree.getByRole("button", { name: "Actions for Source.md", exact: true }).click()
    assert.equal(await page.getByRole("menuitem", { name: "Rename", exact: true }).count(), canWrite ? 1 : 0)
    await page.keyboard.press("Escape")
    if (canWrite) {
      const create = tree.getByRole("button", { name: "Create in Personal", exact: true })
      await create.click()
      page.once("dialog", dialog => dialog.accept("Folder"))
      await page.getByRole("menuitem", { name: "New folder", exact: true }).click()
      const folder = tree.getByRole("button", { name: "Folder", exact: true })
      await folder.waitFor()
      await tree.getByRole("button", { name: "Actions for Folder", exact: true }).click()
      page.once("dialog", dialog => dialog.accept("Renamed"))
      await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
      await tree.getByRole("button", { name: "Renamed", exact: true }).waitFor()
      await tree.getByRole("button", { name: "Actions for Renamed", exact: true }).click()
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click()
      await tree.getByRole("button", { name: "Renamed", exact: true }).waitFor({ state: "hidden" })
      await tree.getByRole("button", { name: "Actions for Source.md", exact: true }).click()
      await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
      await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="workspace-files-navigation"] button')].filter(button => button.textContent.includes("Source")).length === 2)
      const before = writes.length
      delayContent = true
      await tree.getByRole("button", { name: "Actions for Source.md", exact: true }).click()
      const contentRequest = page.waitForRequest("**/workspace-objects/source/content*")
      await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
      await contentRequest
      await page.locator('[data-slot="sidebar-header"] a[href="/chat"]').click()
      await tree.waitFor({ state: "hidden" })
      releaseContent()
      await page.waitForLoadState("networkidle")
      assert.equal(writes.length, before, "unmounted file owner cannot continue copy writes")
      assert.deepEqual(writes, ["POST folders", "PATCH", "DELETE", "POST files"])
    } else {
      assert.equal(await tree.getByRole("button", { name: "Create in Personal", exact: true }).count(), 0)
      assert.deepEqual(writes, [])
    }
    assert.deepEqual(fixture.errors, [])
    await page.close()
  }
  console.log("Workspace navigation passed: lazy selected root, resource CRUD/copy, viewer/archived deep-link restrictions and unmount fencing")
} finally { await browser?.close(); await server.close() }
