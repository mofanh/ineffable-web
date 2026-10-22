import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of ["model-failure", "sandbox-refresh", "selection-during-load", "session-during-load"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = [], sends = []
    page.on("pageerror", error => errors.push(error.message))
    await page.addInitScript(scenario => {
      localStorage.setItem("ineffable.auth.access_token", "catalog-token")
      localStorage.setItem("ineffable.auth.session_id", "catalog-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.auth.workspace_id", "personal")
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
      localStorage.setItem("ineffable.chat.model.first", "model-one")
      localStorage.setItem("ineffable.chat.model.other", "model-two")
      if (scenario === "sandbox-refresh") localStorage.setItem("ineffable.chat.sandbox.first", "environment")
    }, scenario)
    let failModels = scenario === "model-failure", missingModels = false, modelReads = 0, releaseModels
    let nextSandbox = null
    const profiles = { profiles: [{ id: "model-one", display_name: "Model One", enabled: true }, { id: "model-two", display_name: "Model Two", enabled: true }] }
    const sandbox = { providers: [{ provider_id: "provider", display_name: "Device", status: "online" }], environments: [{ environment_id: "environment", provider_id: "provider", status: "ready" }] }
    const conversation = id => ({ id, title: id, current_run: null })
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      let body = { items: [], profiles: [], environments: [], providers: [], pending_inputs: [], events: [], next_seq: 0 }
      if (path.endsWith("/send")) {
        const payload = route.request().postDataJSON(); sends.push(payload)
        return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ status: "queued", pending_id: sends.length, queue_len: sends.length, conversation_id: payload.conversation_id })}\n\n` })
      }
      if (path.endsWith("/subscribe")) return route.fulfill({ contentType: "text/event-stream", body: ": heartbeat\n\n" })
      if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [{ id: "personal", name: "Personal", workspace_type: "personal" }] }
      else if (path.endsWith("conversations/list")) body = { conversations: [conversation("first"), conversation("other")] }
      else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
      else if (path.endsWith("conversations/get")) body = conversation(new URL(route.request().url()).searchParams.get("conversation_id"))
      else if (path.endsWith("/messages")) body = { messages: [], next_seq: 0, page: { has_older: false, before: null } }
      else if (path.endsWith("models/profiles")) {
        modelReads++
        if (["selection-during-load", "session-during-load"].includes(scenario) && modelReads === 1) await new Promise(resolve => { releaseModels = resolve })
        if (failModels) return route.fulfill({ status: 503, json: { error: "catalog unavailable" } })
        body = missingModels ? { profiles: [] } : route.request().headers().authorization?.includes("new-catalog-token") ? { profiles: [{ id: "new-model", display_name: "New Session Model", enabled: true }] } : profiles
      } else if (path.endsWith("sandbox/environments")) {
        const response = nextSandbox; nextSandbox = null
        if (response?.gate) { response.started(); await response.gate }
        if (response?.status) return route.fulfill({ status: response.status, json: { error: "directory read failed" } })
        body = response?.empty ? { providers: [], environments: [] } : sandbox
      } else if (path.endsWith("/observations/access")) body = { allowed: false }
      await route.fulfill({ json: body })
    })
    const wait = async (condition, label) => {
      const deadline = Date.now() + 8000
      while (!condition() && Date.now() < deadline) await page.waitForTimeout(10)
      assert.ok(condition(), label)
    }
    const send = async text => {
      await page.locator("textarea").fill(text)
      await page.locator("textarea").press("Enter")
      await page.waitForFunction(() => document.querySelector("textarea")?.getAttribute("aria-busy") === "false")
    }
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
    await page.getByRole("button", { name: "Select first", exact: true }).click()
    await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "first")
    const modelPicker = page.getByRole("button", { name: /Choose a model:/ })
    const sandboxPicker = page.getByRole("button", { name: /Choose a Sandbox environment:/ })
    if (scenario === "model-failure") {
      await modelPicker.filter({ hasText: "Selected model not yet confirmed" }).waitFor()
      await wait(() => modelReads > 0, "initial model directory request")
      await send("keep my draft")
      await page.getByText("Could not load models. Try again.", { exact: true }).waitFor()
      assert.equal(sends.length, 0)
      assert.equal(await page.locator("textarea").inputValue(), "keep my draft")
      await modelPicker.click()
      const alert = page.getByRole("alert").filter({ hasText: "Could not load models" })
      await alert.waitFor()
      failModels = false
      await alert.getByRole("button", { name: "Retry", exact: true }).click()
      await page.getByRole("option", { name: /Model One/ }).waitFor()
      await page.keyboard.press("Escape")
      await send("recovered")
      await wait(() => sends.length === 1, "recovered model can send")
      assert.equal(sends[0].model_profile_id, "model-one")
      missingModels = true
      await modelPicker.click()
      await page.getByRole("option", { name: /The selected model is unavailable/ }).waitFor()
      await page.keyboard.press("Escape")
      await send("confirmed missing model")
      assert.equal(sends.length, 1, "a successful empty directory must reject the removed selection")
    } else if (scenario === "sandbox-refresh") {
      await sandboxPicker.filter({ hasText: "Device" }).waitFor()
      let release, started
      const gate = new Promise(resolve => { release = resolve })
      const pending = new Promise(resolve => { started = resolve })
      nextSandbox = { gate, started, status: 503 }
      await sandboxPicker.click(); await pending; await page.keyboard.press("Escape")
      await send("send while a healthy snapshot refreshes")
      await wait(() => sends.length === 1, "pending background refresh must not revoke the successful snapshot")
      assert.equal(sends[0].sandbox.environment_id, "environment")
      release()
      await page.waitForTimeout(100)
      await send("send after transient refresh failure")
      await wait(() => sends.length === 2, "transient directory failure retains prior healthy snapshot")
      nextSandbox = { status: 403 }
      await sandboxPicker.click()
      await page.getByRole("alert").filter({ hasText: "Could not load environments" }).waitFor()
      await page.keyboard.press("Escape")
      await send("denied directory")
      assert.equal(sends.length, 2, "403 revokes the directory snapshot instead of retaining it")
      nextSandbox = { empty: true }
      await sandboxPicker.click()
      await page.getByRole("option", { name: /The selected environment is unavailable/ }).waitFor()
      await page.keyboard.press("Escape")
      await send("confirmed missing environment")
      assert.equal(sends.length, 2)
      await page.getByText("The selected environment is unavailable. Choose another environment.", { exact: true }).last().waitFor()
    } else if (scenario === "session-during-load") {
      await wait(() => Boolean(releaseModels), "old session catalog is held")
      await page.evaluate(() => {
        localStorage.setItem("ineffable.auth.session_id", "new-catalog-session")
        localStorage.setItem("ineffable.auth.access_token", "new-catalog-token")
        window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
      })
      await page.waitForFunction(() => document.querySelector("[data-session]")?.textContent === "new-catalog-session")
      await modelPicker.click()
      await page.getByRole("option", { name: /New Session Model/ }).waitFor()
      releaseModels()
      await page.waitForTimeout(100)
      assert.equal(await page.getByRole("option", { name: /Model One/ }).count(), 0, "a late old-session catalog cannot repopulate the current picker")
      assert.equal(await page.getByRole("option", { name: /New Session Model/ }).count(), 1)
    } else {
      await wait(() => Boolean(releaseModels), "first catalog is held")
      await page.getByRole("button", { name: "Select other", exact: true }).click()
      await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "other")
      releaseModels()
      await modelPicker.filter({ hasText: "Model Two" }).waitFor()
      await send("selection stays with the current conversation")
      await wait(() => sends.length === 1, "current selection can send")
      assert.equal(sends[0].conversation_id, "other")
      assert.equal(sends[0].model_profile_id, "model-two")
    }
    assert.deepEqual(errors, [])
    console.log(`${scenario}: actual Sidebar catalog and send checks passed`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
