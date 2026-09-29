import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen(); browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  page.setDefaultTimeout(10000)
  const errors = []; page.on("pageerror", e => errors.push(e.message))
  page.on("console", message => { if (message.type() === "error" && /Maximum update depth/.test(message.text())) errors.push(message.text()) })
  const team = { id: "00000000-0000-0000-0000-000000000002", name: "Team lifecycle", workspace_type: "team", owner_user_id: "actor", status: "active" }
  const personal = { ...team, id: "00000000-0000-0000-0000-000000000001", name: "Personal", workspace_type: "personal" }
  let archived = false, left = false, denied = false, failRefresh = false, soleOwner = true, role = "owner", siteRole = "user", created = 0, invites = 0, loseCreate = false
  const actions = []
  let accessFailure = 0, rejectSave = false, accessRequests = 0, revokeAfterRestore = false, releaseStat
  const space = () => ({ ...team, status: archived ? "archived" : "active", archived_at: archived ? "2026-09-29T00:00:00Z" : null })
  const file = id => ({ id, workspace_id: team.id, kind: "file", name: `${id}.txt`, path: `${id}.txt`, mime_type: "text/plain", current_version_id: `v-${id}` })
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.ui.language", "en-US")
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
  })
  await page.route("**/gateway/v1/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method()
    let body = { conversations: [], invitations: [], objects: [], profiles: [], providers: [], environments: [], items: [], next_cursor: null }
    if (path.endsWith("auth/me")) {
      if (failRefresh) return route.fulfill({ status: 503, json: { error: "refresh offline" } })
      body = { user: { id: "actor", email: "actor@example.com", role: siteRole, status: "active" }, workspaces: [personal, ...(!archived && !left ? [team] : [])] }
    } else if (path.endsWith("/access")) {
      accessRequests++
      if (accessFailure) return route.fulfill({ status: accessFailure, json: { error: "access refresh failed" } })
      if (left) return route.fulfill({ status: 403, json: { error: "membership removed" } })
      body = { workspace: space(), membership: { user_id: "actor", role, status: "active" }, can_write: !archived && role !== "viewer", can_manage_members: !archived && ["owner", "admin"].includes(role), can_archive: !archived && role === "owner", can_restore: archived && role === "owner", can_leave: role !== "owner" || !soleOwner, last_owner: role === "owner" && soleOwner }
    } else if (path === "/gateway/v1/workspaces/directory") body = { entries: !left && (url.searchParams.get("status") === "archived") === archived ? [{ workspace: space(), role }] : [] }
    else if (path.endsWith("/members")) body = { members: [{ id: "owner-row", user_id: "actor", role, status: "active" }, { id: "member-row", user_id: "next-owner", role: soleOwner ? "member" : "owner", status: "active" }] }
    else if (path.endsWith("/members/next-owner") && method === "PATCH") { soleOwner = false; body = { membership: { user_id: "next-owner", role: "owner" } } }
    else if (path.endsWith("/directory")) body = { objects: [file("a"), file("b")], next_cursor: null }
    else if (path.endsWith("/workspaces/create") && method === "POST") { created++; if (loseCreate) return route.abort("failed"); body = { workspace: team } }
    else if (path.endsWith("/invitations") && method === "POST") { invites++; body = { invitation: { id: "invited", email: "guest@example.com", role: "member", status: "pending" }, invite_url: "https://example.com/invite/one", email_error: "mail offline" } }
    else if (/\/(archive|restore|leave)$/.test(path)) {
      const action = path.split("/").at(-1); actions.push(action)
      if (denied) return route.fulfill({ status: 403, json: { error: "permission changed" } })
      if (action === "archive") archived = true
      if (action === "restore") archived = false
      if (action === "leave") left = true
      body = { workspace: space() }
    } else if (path.endsWith("/stat")) {
      await new Promise(resolve => { releaseStat = resolve })
      return route.fulfill({ status: 403, json: { error: "A membership removed" } })
    } else if (path.includes("/workspace-object-versions/")) {
      if (left) return route.fulfill({ status: 403, json: { error: "membership removed" } })
      body = { object: file("a"), version: { id: "v-old", version_no: 0 }, content: "Private historical text" }
    } else if (path.endsWith("/restore-version")) {
      left = revokeAfterRestore; body = { object: file("a"), version: { id: "v-restored", version_no: 3 } }
    } else if (path.includes("/workspace-objects/")) {
      if (rejectSave && method !== "GET") { left = true; return route.fulfill({ status: 403, json: { error: "membership removed" } }) }
      const id = path.split("/workspace-objects/")[1].split("/")[0]
      body = { object: file(id), version: { id: `v-${id}`, version_no: 1 }, versions: [{ id: `v-${id}`, version_no: 1 }, { id: "v-old", version_no: 0 }], content: `Content ${id.toUpperCase()}` }
    } else if (path.endsWith("/raw")) return route.fulfill({ contentType: "text/plain", body: "retained bytes" })
    await route.fulfill({ json: body })
  })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const openFile = () => page.goto(`${origin}/workspace/${team.id}/objects/a`)
  const openAction = async name => {
    if (!await page.getByRole("menuitem", { name, exact: true }).isVisible()) await page.getByRole("button", { name: "File actions", exact: true }).click()
    await page.getByRole("menuitem", { name, exact: true }).click()
  }
  const sidebar = () => page.locator('[data-slot="sidebar"]').first()
  await page.goto(`${origin}/settings`)
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor()
  await sidebar().getByRole("button", { name: /actor@example.com/ }).click()
  await page.getByRole("menuitem", { name: /Appearance/ }).hover()
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click()
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"))
  assert.equal(await page.locator("main").getByText("Appearance", { exact: true }).count(), 0, "appearance has one home in the account menu")
  assert.equal(await sidebar().getByText("Archived spaces", { exact: true }).count(), 0)
  for (const path of ["/models", "/channels", "/agent-nodes", "/system/users"]) assert.equal(await sidebar().locator(`a[href="${path}"]`).count(), 0)
  assert.equal(await page.locator('a[href="/system/users"]').count(), 0)
  for (const path of ["/account", "/models", "/channels", "/agent-nodes"]) assert.ok(await page.locator(`main a[href="${path}"]`).count())
  siteRole = "admin"; await page.reload(); await page.locator('a[href="/system/users"]').waitFor()
  assert.equal(await sidebar().locator('a[href="/system/users"]').count(), 0); siteRole = "user"
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  accessFailure = 503
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await page.getByText("Permissions could not be refreshed. Writes are paused. Please retry.", { exact: false }).waitFor()
  assert.equal(await page.getByText("Content A", { exact: true }).count(), 1)
  assert.equal(await page.getByRole("button", { name: "Edit file", exact: true }).count(), 0)
  await page.waitForTimeout(300)
  assert.deepEqual(errors, [], "temporary permission errors must not cause a header render loop")
  accessFailure = 0
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByRole("button", { name: "Edit file", exact: true }).waitFor()
  await page.getByRole("button", { name: "Edit file", exact: true }).click()
  await page.locator('.cm-content[contenteditable="true"]').fill("Retain my private draft")
  rejectSave = true
  const accessesBefore = accessRequests
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await page.getByRole("button", { name: "Export draft", exact: true }).waitFor()
  await sidebar().getByText(team.name, { exact: true }).waitFor({ state: "hidden" })
  assert.ok(accessRequests > accessesBefore, "object denial must refresh shared access")
  assert.equal(await page.locator('.cm-content[contenteditable="true"]').count(), 0)
  assert.equal(await page.locator("main").getByText("Content A", { exact: true }).count(), 0)
  const revokedDraft = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export draft", exact: true }).click()
  assert.ok((await revokedDraft).suggestedFilename())
  await sidebar().getByRole("link", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Discard changes", exact: true }).click()
  rejectSave = false; left = false
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  await openAction("Version history")
  await page.getByRole("button", { name: /v0/ }).click()
  await page.getByText("Private historical text", { exact: true }).waitFor()
  revokeAfterRestore = true
  await page.getByRole("button", { name: "Restore this version", exact: true }).click()
  await page.getByRole("button", { name: "Restore version", exact: true }).click()
  await page.getByText("Private historical text", { exact: true }).waitFor({ state: "hidden" })
  await sidebar().getByText(team.name, { exact: true }).waitFor({ state: "hidden" })
  assert.equal(await page.getByText("Content A", { exact: true }).count(), 0)
  left = false; revokeAfterRestore = false
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  page.once("dialog", dialog => dialog.accept("folder"))
  await openAction("Move to…")
  while (!releaseStat) await page.waitForTimeout(10)
  await sidebar().getByText("b.txt", { exact: true }).first().click()
  await page.getByText("Content B", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Edit file", exact: true }).click()
  await page.locator('.cm-content[contenteditable="true"]').fill("B draft")
  const lateDenial = page.waitForResponse(response => response.url().includes("/stat"))
  releaseStat(); await lateDenial; await page.waitForTimeout(100)
  assert.equal(await page.locator('.cm-content[contenteditable="true"]').textContent(), "B draft")
  assert.equal(await page.getByText("A membership removed", { exact: true }).count(), 0)
  await sidebar().getByRole("link", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Discard changes", exact: true }).click()
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  assert.equal(await page.locator('nav[aria-label="breadcrumb"]').count(), 1)
  await page.goto(`${origin}/workspace/${team.id}/objects?path=notes/sub`)
  await page.locator('nav[aria-label="breadcrumb"]').getByText("sub", { exact: true }).waitFor()
  await page.locator('nav[aria-label="breadcrumb"]').getByRole("link", { name: "notes", exact: true }).click()
  assert.ok(page.url().endsWith("?path=notes"))
  assert.equal(await page.getByRole("button", { name: "Up one level", exact: true }).count(), 0)
  assert.equal(await page.getByRole("heading", { name: team.name, exact: true }).count(), 0)
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  await page.evaluate(() => { window.__editorBeforeRefresh = document.querySelector("main") })
  await openAction("Archive space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click()
  assert.deepEqual(actions, [])
  await openAction("Archive space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByRole("button", { name: "File actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Restore space", exact: true }).waitFor()
  assert.ok(page.url().endsWith(`/workspace/${team.id}/objects/a`))
  assert.equal(await page.getByRole("button", { name: "Edit file", exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => window.__editorBeforeRefresh === document.querySelector("main")), true)
  await page.getByText("You are the last owner. Restore the space before managing ownership.", { exact: true }).waitFor()
  denied = true
  await openAction("Restore space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByText("permission changed", { exact: true }).waitFor()
  assert.equal(archived, true); denied = false
  await page.goto(`${origin}/team-spaces/archived`)
  await page.locator(`main a[href="/workspace/${team.id}/objects"]`).first().waitFor()
  assert.ok(page.url().endsWith("/team-spaces?status=archived"))
  await page.reload(); await page.locator(`main a[href="/workspace/${team.id}/objects"]`).first().click()
  await page.locator(`main a[href="/workspace/${team.id}/objects/a"]`).click()
  await page.getByText("Content A", { exact: true }).waitFor()
  await openAction("Restore space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore space", exact: true }).click()
  await page.getByRole("button", { name: "Edit file", exact: true }).waitFor()
  await page.goto(`${origin}/team-spaces/${team.id}/members`)
  await page.locator('select[aria-label*="next-owner"]').selectOption("owner")
  assert.equal(soleOwner, true)
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('select[aria-label*="next-owner"]')?.value === "owner")
  assert.equal(soleOwner, false)
  role = "viewer"; await page.reload(); await page.getByText("next-owner", { exact: true }).waitFor()
  assert.equal(await page.getByRole("button", { name: "Send invitation", exact: true }).count(), 0)
  assert.equal(await page.locator('select[aria-label*="next-owner"]').isDisabled(), true)
  await openFile(); await page.getByText("Content A", { exact: true }).waitFor()
  assert.equal(await page.getByRole("button", { name: "Edit file", exact: true }).count(), 0)
  role = "owner"; await page.reload()
  await page.getByRole("button", { name: "Edit file", exact: true }).click()
  await page.locator('.cm-content[contenteditable="true"]').fill("My unsaved draft")
  await sidebar().getByRole("link", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  assert.ok((await page.locator(".cm-content").textContent()).includes("My unsaved draft"))
  await openAction("Archive space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByRole("button", { name: "Export draft", exact: true }).waitFor()
  const draftDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export draft", exact: true }).click()
  assert.equal((await draftDownload).suggestedFilename(), "a.txt")
  await sidebar().getByRole("link", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Discard changes", exact: true }).click()
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem("ineffable.auth.workspace_id")), personal.id, "browsing and lifecycle actions never replace execution workspace")
  archived = false
  await page.goto(`${origin}/team-spaces/new`)
  await page.locator("#team-workspace-name").fill("Team lifecycle")
  await page.locator('main button[type="submit"]').click()
  await page.waitForURL(`${origin}/team-spaces/${team.id}/members`)
  assert.equal(created, 1)
  await page.locator('main input[type="email"]').fill("guest@example.com")
  await page.locator('main form button').click()
  await page.getByText("The invitation was created, but the email was not delivered. You can share the invitation link below.", { exact: true }).waitFor()
  assert.equal(invites, 1); assert.equal(created, 1)
  loseCreate = true
  await page.goto(`${origin}/team-spaces/new`)
  await page.locator("#team-workspace-name").fill("Uncertain create")
  await page.locator('main button[type="submit"]').click()
  await page.waitForFunction(() => document.querySelector('main button[type="submit"]')?.disabled)
  await page.getByText("The submission result is unknown. Check the list before creating again.", { exact: true }).waitFor()
  assert.equal(created, 2)
  for (const width of [320, 390, 768, 1200]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${origin}/settings`)
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `settings fits ${width}px`)
    if (process.env.INTERACTION_SCREENSHOTS) await page.screenshot({ path: `/tmp/interaction-settings-${width}.png` })
  }
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.goto(`${origin}/workspace/${team.id}/objects?path=notes/sub`)
  await page.locator('nav[aria-label="breadcrumb"]').getByText("sub", { exact: true }).waitFor()
  if (process.env.INTERACTION_SCREENSHOTS) await page.screenshot({ path: "/tmp/interaction-directory.png" })
  await openFile(); await openAction("Leave space")
  await page.getByRole("alertdialog").getByRole("button", { name: "Leave space", exact: true }).click()
  await page.waitForURL(`${origin}/team-spaces`); assert.equal(left, true); left = false
  await openFile(); await openAction("Archive space"); failRefresh = true
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive space", exact: true }).click()
  await page.getByText("Action succeeded, but the list could not refresh. Reload the page.", { exact: true }).waitFor()
  assert.equal(archived, true); assert.deepEqual(errors, [])
  console.log("PASS interaction lifecycle: clean sidebar/settings, archive deep links, readonly roles, handoff, dirty navigation, leave, refresh failure")
} finally { await browser?.close(); await server.close() }
