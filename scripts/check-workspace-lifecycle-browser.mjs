import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen(); browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message))
  const team = { id: "00000000-0000-0000-0000-000000000002", name: "Team lifecycle", workspace_type: "team", owner_user_id: "actor", status: "active" }
  const personal = { ...team, id: "00000000-0000-0000-0000-000000000001", name: "Personal", workspace_type: "personal" }
  let archived = false, left = false, deny = false, failRefresh = false, mutationDelay = 0, soleOwner = true; const actions = []
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
  })
  await page.route("**/gateway/v1/**", async route => {
    const path = new URL(route.request().url()).pathname
    let body = { conversations: [], invitations: [], objects: [], next_cursor: null }
    if (path.endsWith("auth/me") && failRefresh) { await route.fulfill({ status: 503, json: { error: "refresh offline" } }); return }
    if (path.endsWith("auth/me")) body = { user: { id: "actor", role: "user", status: "active" }, workspaces: [personal, ...(!archived && !left ? [team] : [])] }
    else if (path.endsWith("/workspaces/archived")) body = { workspaces: archived && !left ? [{ ...team, status: "archived" }] : [] }
    else if (path.endsWith("/members")) body = { members: [{ user_id: "actor", role: "owner", status: "active" }, ...(!soleOwner ? [{ user_id: "other-owner", role: "owner", status: "active" }] : [])] }
    else if (path.endsWith("/directory")) body = { objects: [{ id: "file", kind: "file", name: "retained.txt", path: "retained.txt", current_version_id: "version" }], next_cursor: null }
    else if (/\/(archive|restore|leave)$/.test(path)) {
      const action = path.split("/").at(-1); actions.push(action)
      if (mutationDelay) await new Promise(resolve => setTimeout(resolve, mutationDelay))
      if (deny) { await route.fulfill({ status: 403, json: { error: "permission changed" } }); return }
      if (action === "archive") archived = true
      if (action === "restore") archived = false
      if (action === "leave") left = true
      body = { workspace: team }
    } else if (path.endsWith("/raw")) { await route.fulfill({ contentType: "text/plain", body: "retained bytes" }); return }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/workspace-image-fixture.html?lifecycle=1`)
  // Use the production Router/AppShell too, rather than only the isolated fixture routes.
  const app = await browser.newPage()
  app.on("pageerror", error => errors.push(error.message))
  await app.addInitScript(() => {
    localStorage.setItem("ineffable.ui.language", "en-US")
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
  })
  await app.route("**/gateway/v1/**", async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("auth/me")) return route.fulfill({ json: { user: { id: "actor", role: "user", status: "active" }, workspaces: [personal, team] } })
    if (path.endsWith("/workspaces/archived")) return route.fulfill({ json: { workspaces: [] } })
    return route.fulfill({ json: { conversations: [], invitations: [], objects: [], profiles: [], providers: [], next_cursor: null } })
  })
  await app.goto(`http://127.0.0.1:${server.httpServer.address().port}/team-spaces/new`)
  await app.getByRole("link", { name: "Archived spaces", exact: true }).click()
  await app.getByRole("heading", { name: "Archived spaces", exact: true }).waitFor()
  await app.getByText("No archived spaces", { exact: true }).waitFor()
  assert.ok(app.url().endsWith("/team-spaces/archived"), "production sidebar navigates to the actual archived route")
  await app.close()
  const openMenu = () => page.getByRole("button", { name: /Team lifecycle.*actions|actions.*Team lifecycle/i }).click()
  await openMenu()
  await page.getByRole("menuitem", { name: "Transfer ownership before leaving", exact: true }).waitFor()
  assert.equal(await page.getByRole("menuitem", { name: "Transfer ownership before leaving", exact: true }).getAttribute("data-disabled"), "", "last owner cannot start leaving")
  await page.getByRole("menuitem", { name: "Archive space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /Cancel/ }).click()
  assert.deepEqual(actions, [], "cancel does not mutate")
  await openMenu(); await page.getByRole("menuitem", { name: "Archive space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByRole("link", { name: "Archived spaces", exact: true }).click()
  await page.getByRole("button", { name: team.name, exact: true }).click()
  await page.getByRole("button", { name: "retained.txt", exact: true }).waitFor()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download file", exact: true }).click()
  assert.equal((await download).suggestedFilename(), "retained.txt")
  assert.equal(await page.getByRole("button", { name: "Save", exact: true }).count(), 0)
  deny = true
  await page.getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByText("permission changed", { exact: true }).waitFor()
  assert.equal(archived, true)
  deny = false
  await page.getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByText("No archived spaces", { exact: true }).waitFor()
  soleOwner = false
  await openMenu(); await page.getByRole("menuitem", { name: "Leave space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Leave space", exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes("Team lifecycle"))
  assert.equal(left, true); assert.deepEqual(errors, [])
  // A route switch fences navigation, but must not drop the global workspace reconciliation.
  left = false; mutationDelay = 500
  await page.reload(); await openMenu()
  await page.getByRole("menuitem", { name: "Archive space", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByRole("link", { name: "Archived spaces", exact: true }).click()
  await page.getByRole("heading", { name: "Archived spaces", exact: true }).waitFor()
  await page.getByRole("button", { name: team.name, exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-slot="sidebar-menu-action"][aria-label*="Team lifecycle"]'))
  assert.equal(archived, true)
  // A committed mutation remains a success, with a distinct refresh failure message.
  archived = false; mutationDelay = 0
  await page.reload(); await openMenu()
  await page.getByRole("menuitem", { name: "Archive space", exact: true }).click()
  failRefresh = true
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByText("Action succeeded, but the list could not refresh. Reload the page.", { exact: true }).waitFor()
  assert.equal(archived, true)
  assert.deepEqual(errors, [])
  console.log("Workspace lifecycle browser checks passed: archive/cancel, readonly browse/download, denied restore, restore and leave")
} finally { await browser?.close(); await server.close() }
