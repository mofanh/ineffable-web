import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
const workspace = "11111111-1111-1111-1111-111111111111", objectId = "22222222-2222-2222-2222-222222222222", versionId = "33333333-3333-3333-3333-333333333333"
const file = { id: objectId, workspace_id: workspace, path: "system/rules/default.md", name: "default.md", kind: "file", current_version_id: versionId }
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage(), other = await context.newPage()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  await other.goto(`${origin}/scripts/workspace-rule-fixture.html`)
  async function account(id) { await other.evaluate(id => {
    localStorage.setItem("ineffable.auth.session_id", id)
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() + 3600000))
    localStorage.setItem("ineffable.auth.access_token", id)
  }, id) }
  await account("a")
  let preferences = { timezone: "UTC", version: 1, defaults_json: {} }
  const submissions = [], mutations = [], errors = []
  page.on("pageerror", error => errors.push(error.message))
  let held, release, hold = false
  let failure = false, existing = true
  await page.route("**/gateway/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const actor = request.headers().authorization === "Bearer a" ? "a" : "b"
    let body = {}, status = 200
    if (path.endsWith("auth/me")) body = { user: { id: actor, display_name: actor, email: `${actor}@test.local`, status: "active" }, workspaces: [{ id: workspace, name: "Personal", status: "active", workspace_type: "personal" }] }
    else if (path.endsWith("conversations/preferences")) {
      if (request.method() === "PUT") { submissions.push(request.postDataJSON()); preferences = { ...request.postDataJSON(), version: preferences.version + 1 } }
      body = actor === "a" ? preferences : { timezone: "UTC", version: 1, defaults_json: {} }
    } else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model-a", display_name: "Model A" }] }
    else if (path.endsWith("sandbox/environments")) body = { providers: [], environments: [] }
    else if (path.endsWith("capability-exposure/policy")) body = { capability_exposure_policy: { policy: { allowed_modes: ["smart"], exposure_budget: { max_count: 24 } } } }
    else if (path.endsWith("conversations/list")) body = { conversations: [] }
    else if (path.endsWith("/directory")) body = { objects: [file], next_cursor: null }
    else if (path.endsWith("/versions")) body = { object: file, versions: [{ id: versionId, size_bytes: 10, mime_type: "text/markdown" }] }
    else if (path.endsWith("/stat")) {
      if (hold) { held?.(); await new Promise(resolve => { release = resolve }); hold = false }
      const name = new URL(request.url()).searchParams.get("path")
      body = { object: !existing ? null : name.endsWith("default.md") ? file : { id: name, kind: "folder", path: name } }
      if (failure) { status = 503; body = { error: "Rule storage unavailable" } }
    } else if (path.endsWith("/folders")) {
      mutations.push(path)
      body = { object: { id: request.postDataJSON().name, kind: "folder" } }
    } else if (path.endsWith("/files")) {
      mutations.push(path)
      const draft = request.postDataJSON()
      assert.ok(draft.content.includes(workspace) && draft.content.includes("system/memory/"))
      assert.equal(draft.mime_type, "text/markdown")
      body = { object: file, version: { id: versionId } }
      existing = true
    } else if (["POST", "PATCH", "DELETE"].includes(request.method())) mutations.push(path)
    await route.fulfill({ status, json: body })
  })
  await page.goto(`${origin}/scripts/workspace-rule-fixture.html`)
  const choose = page.getByRole("button", { name: "Choose rule file", exact: true })
  await choose.click()
  await page.getByRole("option", { name: file.path, exact: true }).click()
  await page.getByRole("link", { name: "Open editor" }).waitFor()
  assert.equal(submissions.length, 0, "selection is a draft until saved")
  await page.getByRole("button", { name: /model/i }).click()
  await page.getByRole("option", { name: "Model A", exact: true }).click()
  await page.getByRole("button", { name: "Save conversation settings", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("[data-workspace-rule-field] a"))
  await page.waitForTimeout(100)
  assert.deepEqual(submissions.at(-1).defaults_json.workspace_rule, { workspace_id: workspace, object_id: objectId }, "changing runtime fields preserves the rule")
  assert.equal(submissions.at(-1).defaults_json.model_profile_id, "model-a")
  assert.equal(submissions.at(-1).defaults_json.workspace_id, null, "rule is not a resource scope selector")
  assert.equal(await page.getByRole("link", { name: "Open editor" }).getAttribute("href"), `/workspace/${workspace}/objects/${objectId}`)
  await page.getByRole("button", { name: "Disable", exact: true }).click()
  await page.getByRole("button", { name: "Save conversation settings", exact: true }).click()
  await page.getByRole("button", { name: "Create personal rule template" }).waitFor()
  await page.waitForTimeout(100)
  assert.equal(submissions.at(-1).defaults_json.workspace_rule, null)
  failure = true
  await page.getByRole("button", { name: "Create personal rule template" }).click()
  await page.getByText("Rule storage unavailable", { exact: true }).waitFor()
  assert.equal(await page.getByRole("link", { name: "Open editor" }).count(), 0, "failed creation never claims a rule was selected")
  failure = false
  await page.getByRole("button", { name: "Create personal rule template" }).click()
  await page.getByRole("link", { name: "Open editor" }).waitFor()
  assert.deepEqual(mutations, [], "existing template is reused without overwriting")
  assert.equal(submissions.length, 2, "creating a file does not silently save preferences")
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "narrow layout has no horizontal overflow")
  await page.getByRole("button", { name: "Disable", exact: true }).click()
  existing = false
  await page.getByRole("button", { name: "Create personal rule template" }).click()
  await page.getByRole("link", { name: "Open editor" }).waitFor()
  assert.equal(mutations.length, 3, "explicit create writes two folders and one short rule, no notes")
  await page.getByRole("button", { name: "Disable", exact: true }).click()
  hold = true
  const entered = new Promise(resolve => { held = resolve })
  await page.getByRole("button", { name: "Create personal rule template" }).click()
  await Promise.race([entered, new Promise((_, reject) => setTimeout(() => reject(new Error("template request not started")), 5000))])
  await account("b")
  await page.getByText("No rule file selected", { exact: true }).waitFor()
  release()
  await page.waitForTimeout(150)
  assert.equal(await page.getByRole("link", { name: "Open editor" }).count(), 0, "old account's async template result cannot change a new account")
  assert.deepEqual(errors, [])
  console.log("workspace rule browser checks passed")
} finally { await browser?.close(); await server.close() }
