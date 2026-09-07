import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  let saved
  const calls = []
  await page.route("**/gateway/v1/**", async (route) => {
    const request = route.request()
    calls.push(request.url())
    let body = {}
    if (request.url().includes("models/profiles")) body = { profiles: [{ id: "model-a", display_name: "Model A" }, { id: "model-b", display_name: "Model B" }] }
    else if (request.url().includes("workspaces/list")) body = { workspaces: [{ id: "workspace-a", name: "Workspace A" }, { id: "workspace-b", name: "Workspace B" }] }
    else if (request.url().includes("capability-exposure/policy")) body = { capability_exposure_policy: { policy: { allowed_modes: ["smart", "clean", "full", "custom"], exposure_budget: { max_count: 12 } } } }
    else if (request.url().includes("sandbox/environments")) {
      const scope = request.headers()["x-tenant-id"]
      const suffix = scope === "workspace-b" ? "b" : "a"
      body = { providers: [{ provider_id: "provider", display_name: `Sandbox ${suffix.toUpperCase()}` }], environments: [{ environment_id: `sandbox-${suffix}`, provider_id: "provider" }] }
    } else if (request.url().includes("capability-catalog")) {
      assert.equal(request.headers()["x-tenant-id"], new URL(request.url()).searchParams.get("sandbox_environment_id") === "sandbox-a" ? "workspace-a" : "workspace-b")
      body = { items: Array.from({ length: 20 }, (_, i) => ({ key: { provider_id: "backend", capability_id: `tool-${i}` }, name: `Tool ${i}`, family: "workspace.files", provider_name: "Backend", model_tool_name: `tool_${i}`, description: "Test tool" })) }
    } else if (request.method() === "PATCH") { saved = request.postDataJSON(); body = { automation: {} } }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/automation-runtime-fixture.html`)
  await page.getByText("Model A", { exact: true }).waitFor()
  await page.getByText("Sandbox A", { exact: true }).waitFor()
  await Promise.all([page.waitForResponse((r) => r.request().method() === "PATCH"), page.getByRole("button", { name: "Save fixture" }).click()])
  assert.equal(saved.runtime_config.capability_exposure.custom.capabilities.length, 20)
  assert.deepEqual(saved.runtime_config.capability_exposure.custom.discovery_scope, { kind: "disabled" })
  await page.getByText("Model A", { exact: true }).click()
  await page.getByRole("option", { name: "Model B" }).click()
  await page.getByText("Workspace A", { exact: true }).click()
  await page.getByRole("option", { name: "Workspace B" }).click()
  const current = JSON.parse(await page.locator("[data-config]").textContent())
  assert.equal(current.model_profile_id, "model-b")
  assert.equal(current.workspace_id, "workspace-b")
  assert.equal(current.sandbox, null)
  assert.equal(current.capability_exposure.custom.capabilities.length, 20)
  assert.ok(calls.length < 20, "configuration rerenders must not cause request loops")
  assert.deepEqual(errors, [])
  // Mount the actual page/dialog and hold A's save while editing B.
  const editorPage = await browser.newPage()
  editorPage.on("pageerror", (error) => console.error(error.message))
  await editorPage.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "test-token")
    localStorage.setItem("ineffable.auth.session_id", "test-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
  })
  const config = saved.runtime_config
  const automations = ["A", "B"].map((name) => ({ id: name, name, message: "Task", conversation_id: "conversation-a", status: "active", trigger_kind: "manual", trigger_spec: {}, runtime_config: config }))
  let releaseSave
  let saveStarted = false
  await editorPage.route("**/gateway/v1/**", async (route) => {
    const url = route.request().url()
    let body = {}
    if (route.request().method() === "PATCH") {
      saveStarted = true
      await new Promise((resolve) => { releaseSave = resolve })
      body = { automation: automations[0] }
    } else if (url.includes("auth/me")) body = { user: { id: "actor", display_name: "Actor" }, workspaces: [] }
    else if (url.includes("/automations")) body = { automations, runs: [] }
    else if (url.includes("conversations/list")) body = { conversations: [] }
    else if (url.includes("models/profiles")) body = { profiles: [{ id: "model-a", display_name: "Model A" }] }
    else if (url.includes("workspaces/list")) body = { workspaces: [] }
    else if (url.includes("sandbox/environments")) body = { providers: [], environments: [] }
    else if (url.includes("capability-catalog")) body = { items: [] }
    else if (url.includes("capability-exposure/policy")) body = { capability_exposure_policy: { policy: { allowed_modes: ["smart", "custom"], exposure_budget: { max_count: 12 } } } }
    await route.fulfill({ json: body })
  })
  await editorPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/automation-runtime-fixture.html?page`)
  await editorPage.getByRole("button", { name: /Runtime configuration/ }).first().click().catch(async (error) => { console.error(await editorPage.locator("body").innerText()); throw error })
  await editorPage.locator("#automation-name").fill("A changed")
  await editorPage.locator('button[type="submit"][form="automation-edit-form"]').click()
  await editorPage.waitForFunction(() => document.querySelector('button[form="automation-edit-form"]')?.disabled === true)
  assert.ok(saveStarted)
  await editorPage.getByRole("button", { name: "Cancel", exact: true }).click()
  await editorPage.getByRole("button", { name: /Runtime configuration/ }).nth(1).click()
  await editorPage.locator("#automation-name").fill("B draft")
  const response = editorPage.waitForResponse((r) => r.request().method() === "PATCH")
  releaseSave()
  await response
  await editorPage.waitForLoadState("networkidle")
  assert.equal(await editorPage.locator("#automation-name").inputValue(), "B draft")
  assert.equal(await editorPage.getByRole("dialog").count(), 1)
  await editorPage.close()
  console.log("automation runtime browser checks passed")
} finally { await browser?.close(); await server.close() }
