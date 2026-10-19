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
  await other.route("**/session-control", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Session control</title>" }))
  await other.goto(`${origin}/session-control`)
  async function account(id) { await other.evaluate(id => {
    localStorage.setItem("ineffable.auth.session_id", id)
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() + 3600000))
    localStorage.setItem("ineffable.auth.access_token", id)
  }, id) }
  await account("a")
  let preferencesReads = 0, preparations = 0
  let preferences = { timezone: "UTC", version: 1, defaults_json: {} }
  const submissions = [], errors = []
  page.on("pageerror", error => errors.push(error.message))
  let held, release, hold = false, failure = false
  await page.route("**/gateway/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const actor = request.headers().authorization === "Bearer b" ? "b" : "a"
    let body = {}, status = 200
    if (path.endsWith("auth/me")) body = { user: { id: actor, display_name: actor, email: `${actor}@test.local`, status: "active" }, workspaces: [{ id: workspace, name: "Personal", status: "active", workspace_type: "personal" }] }
    else if (path.endsWith("preferences/default-rule")) {
      assert.equal(request.method(), "POST")
      preparations++
      if (hold) { held?.(); await new Promise(resolve => { release = resolve }); hold = false }
      if (failure) { status = 503; body = { error: "Rule storage unavailable" } }
      else body = { object: file }
    } else if (path.endsWith("conversations/preferences")) {
      if (request.method() === "PUT") {
        const submitted = request.postDataJSON()
        submissions.push(submitted)
        if (submitted.version !== preferences.version) { await route.fulfill({ status: 409, json: { error: "Preferences version conflict" } }); return }
        preferences = { ...submitted, version: preferences.version + 1 }
      } else preferencesReads++
      body = actor === "a" ? preferences : { timezone: "UTC", version: 1, defaults_json: { workspace_rule: null } }
    } else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model-a", display_name: "Model A" }] }
    else if (path.endsWith("sandbox/environments")) body = { providers: [], environments: [] }
    else if (path.endsWith("capability-exposure/policy")) body = { capability_exposure_policy: { policy: { allowed_modes: ["smart"], exposure_budget: { max_count: 24 } } } }
    else if (path.endsWith("conversations/list")) body = { conversations: [] }
    else if (path.endsWith("/directory")) body = { objects: [file], next_cursor: null }
    else if (path.endsWith("/versions")) body = { object: file, versions: [{ id: versionId, size_bytes: 10, mime_type: "text/markdown" }] }
    else if (["POST", "PATCH", "DELETE"].includes(request.method())) assert.fail(`unexpected mutation: ${path}`)
    await route.fulfill({ status, json: body })
  })
  await page.goto(`${origin}/scripts/workspace-rule-fixture.html`)
  const editor = page.getByRole("link", { name: "Open editor", exact: true })
  await editor.waitFor()
  assert.ok(preparations >= 1, "an unconfigured user can edit the automatic rule without selecting a file")
  assert.equal(submissions.length, 0, "provisioning never silently changes preferences")
  const notes = page.getByRole("textbox", { name: "Notes directory", exact: true })
  assert.equal(await notes.getAttribute("placeholder"), "system/memory")
  await notes.fill("notes/personal")
  const choose = page.getByRole("button", { name: "Choose rule file", exact: true })
  await choose.click()
  await page.getByRole("option", { name: file.path, exact: true }).click()
  await other.evaluate(() => localStorage.setItem("ineffable.auth.access_token", "a-renewed"))
  await page.waitForTimeout(150)
  assert.equal(await notes.inputValue(), "notes/personal", "same-session renewal preserves the directory draft")
  const readsBeforeSave = preferencesReads
  await page.getByRole("button", { name: /model/i }).click()
  await page.getByRole("option", { name: "Model A", exact: true }).click()
  const save = page.getByRole("button", { name: "Save conversation settings", exact: true })
  await save.click()
  await page.waitForTimeout(150)
  assert.deepEqual(submissions.at(-1).defaults_json.workspace_rule, { workspace_id: workspace, object_id: objectId })
  assert.equal(submissions.at(-1).defaults_json.workspace_notes_path, "notes/personal", "changing runtime fields preserves the notes path")
  assert.equal(submissions.at(-1).defaults_json.model_profile_id, "model-a")
  assert.equal(submissions.at(-1).defaults_json.workspace_id, null)
  assert.equal(await editor.getAttribute("href"), `/workspace/${workspace}/objects/${objectId}`)
  await page.getByRole("button", { name: "Disable", exact: true }).click()
  assert.equal(await notes.isDisabled(), true)
  await save.click()
  await page.waitForTimeout(150)
  assert.equal(submissions.at(-1).defaults_json.workspace_rule, null)
  assert.equal(submissions[1].version, 2)
  assert.equal(preferencesReads, readsBeforeSave, "saving does not refresh over a new draft")
  const refreshPreferences = () => page.evaluate(async () => {
    const { invalidateApiResourceCache } = await import("/src/lib/app/use-api-resource.ts")
    invalidateApiResourceCache(["conversation-preferences", "a"])
  })
  preferences = { ...preferences, version: 4, timezone: "Asia/Shanghai" }
  await refreshPreferences()
  await page.waitForFunction(() => document.querySelector('input')?.value === "Asia/Shanghai")
  const timezone = page.getByRole("textbox").first()
  await timezone.fill("Europe/London")
  preferences = { ...preferences, version: 5, timezone: "UTC" }
  await refreshPreferences()
  await page.getByRole("button", { name: "Discard draft and reload" }).waitFor()
  assert.equal(await timezone.inputValue(), "Europe/London")
  assert.equal(await save.isDisabled(), true)
  await page.getByRole("button", { name: "Discard draft and reload" }).click()
  assert.equal(await timezone.inputValue(), "UTC")
  failure = true
  await page.getByRole("button", { name: "Use default rule", exact: true }).click()
  // Invalidate the provisioner's completed cache to exercise a real failed request.
  await page.evaluate(async () => { const { invalidateApiResourceCache } = await import("/src/lib/app/use-api-resource.ts"); invalidateApiResourceCache(["workspace-rule-label", localStorage.getItem("ineffable.auth.access_token"), "automatic", "", ""]) })
  await page.getByText("Rule storage unavailable", { exact: true }).waitFor()
  failure = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await editor.waitFor()
  await notes.fill("")
  await save.click()
  await page.waitForTimeout(150)
  assert.equal(Object.hasOwn(submissions.at(-1).defaults_json, "workspace_rule"), false, "automatic is omission, never explicit null or a frozen custom selection")
  assert.equal(Object.hasOwn(submissions.at(-1).defaults_json, "workspace_notes_path"), false, "clearing the path restores its default")
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.getByRole("button", { name: "Disable", exact: true }).click()
  await save.click()
  await page.waitForTimeout(150)
  hold = true
  const entered = new Promise(resolve => { held = resolve })
  await page.getByRole("button", { name: "Use default rule", exact: true }).click()
  await page.evaluate(async () => { const { invalidateApiResourceCache } = await import("/src/lib/app/use-api-resource.ts"); invalidateApiResourceCache(["workspace-rule-label", localStorage.getItem("ineffable.auth.access_token"), "automatic", "", ""]) })
  await Promise.race([entered, new Promise((_, reject) => setTimeout(() => reject(new Error("provisioning not started")), 5000))])
  await account("b")
  await page.getByText("No rule file selected", { exact: true }).waitFor()
  release()
  await page.waitForTimeout(150)
  assert.equal(await editor.count(), 0, "an old account's result cannot change the new account")
  assert.deepEqual(errors, [])
  console.log("workspace rule browser checks passed: automatic/custom/disabled, path edits, version conflicts, retry, session isolation, mobile")
} finally { await browser?.close(); await server.close() }
