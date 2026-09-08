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
  const { emptyPlan } = await server.ssrLoadModule("/src/pages/system-management/shared.tsx")
  browser = await chromium.launch({ executablePath, headless: true })
  for (const scenario of ["plan-cancel", "plan-save", "plan-partial", "plan-create-partial", "plan-load-failure", "plan-stale-load", "plan-session", "user-noop", "user-partial", "user-load-failure", "user-session", "user-unknown", "plan-create-unknown", "user-effective-plan"]) {
    const isUsers = scenario.startsWith("user")
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "test-token")
      localStorage.setItem("ineffable.auth.session_id", "test-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    })
    let plans = ["free", "pro"].map(id => ({ ...structuredClone(emptyPlan), id, name: id, display_name: id === "free" ? "Free" : "Pro", archived_at: null }))
    if (scenario === "user-effective-plan") plans.push({ ...plans[1], id: "disabled", enabled: false })
    const models = ["one", "two"].map(id => ({ id, display_name: `Model ${id}`, upstream_model_name: id, enabled: true, archived_at: null }))
    const user = { id: "user-1", email: "person@example.com", display_name: "Person", role: "user", status: "active", created_at: "2026-09-08T00:00:00Z" }
    let assignments = [{ id: "assignment", plan_id: "free", user_id: user.id, status: "active", effective_from: "2026-09-01T00:00:00Z" }]
    if (scenario === "user-effective-plan") assignments.push(
      { ...assignments[0], id: "future", plan_id: "pro", effective_from: "2099-01-01T00:00:00Z" },
      { ...assignments[0], id: "expired", plan_id: "pro", effective_from: "2026-09-02T00:00:00Z", effective_until: "2026-09-03T00:00:00Z" },
      { ...assignments[0], id: "disabled", plan_id: "disabled", effective_from: "2026-09-04T00:00:00Z" },
    )
    const writes = []
    let fail = scenario.includes("partial") || scenario.includes("load-failure")
    let holdAccess = false
    let release
    const releases = []
    let accessRows = []
    const accessRequests = new Map()
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      const method = route.request().method()
      const write = !["GET", "HEAD"].includes(method)
      const payload = write ? route.request().postDataJSON() : null
      if (write) writes.push({ path, method, payload, token: route.request().headers().authorization })
      let status = 200
      let body = {}
      if (path.endsWith("auth/me")) body = { user: { id: "admin", role: "admin", email: "admin@example.com", display_name: "Admin", status: "active" }, workspaces: [] }
      else if (path.endsWith("conversations/list")) body = { conversations: [] }
      else if (path.endsWith("admin/models")) body = { profiles: models }
      else if (path.endsWith("capability-families")) body = { items: [] }
      else if (path.endsWith("plans/insights")) body = { insights: [] }
      else if (path.endsWith("/plans") && !path.includes("/users/")) {
        if (write) {
          const plan = { ...payload, id: "created", archived_at: null }; plans.push(plan); body = { plan }
          if (scenario === "plan-create-unknown") { await route.abort("failed"); return }
        }
        else body = { plans }
      } else if (/admin\/plans\/[^/]+\/models$/.test(path)) {
        accessRequests.set(path, (accessRequests.get(path) ?? 0) + 1)
        if (holdAccess) await new Promise(resolve => releases.push(resolve))
        if (scenario === "plan-load-failure" && fail) { status = 500; body = { error: "access read failed" } }
        else body = { access: scenario === "plan-stale-load" && path.includes("/free/") ? [{ plan_id: "free", model_profile_id: "one", visible: true, usable: true, input_multiplier: 1, output_multiplier: 1, reasoning_multiplier: 1, cached_input_multiplier: 0.25 }] : accessRows }
      } else if (path.endsWith("plan-model-access")) {
        if (scenario === "plan-session") await new Promise(resolve => { release = resolve })
        if (scenario.includes("partial") && fail && payload.model_profile_id === "two") { status = 500; body = { error: "permission failed" } }
        else { accessRows = [...accessRows.filter(row => row.model_profile_id !== payload.model_profile_id), payload]; body = { access: payload } }
      } else if (path.includes("admin/plans/") && write) {
        const id = path.split("/").at(-1); const plan = { ...payload, id, archived_at: null }
        plans = plans.map(p => p.id === id ? plan : p); body = { plan }
      } else if (path.endsWith("admin/users")) body = { users: [user] }
      else if (path.endsWith("users/role")) {
        if (scenario === "user-session") await new Promise(resolve => { release = resolve })
        user.role = payload.role; body = { user } }
      else if (path.endsWith("user-plan-assignments")) {
        if (fail) { status = 400; body = { error: "assignment failed" } }
        else {
          assignments = [{ ...assignments[0], plan_id: payload.plan_id }]; body = { assignment: assignments[0] }
          if (scenario === "user-unknown") { await route.abort("failed"); return }
        }
      } else if (path.endsWith("/plans") && path.includes("/users/")) {
        if (scenario === "user-load-failure" && fail) { status = 500; body = { error: "user details failed" } }
        else body = { assignments }
      } else if (path.includes("/usage")) body = { usage: [], points: [], totals: {} }
      await route.fulfill({ status, json: body })
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/admin-editor-fixture.html?page=${isUsers ? "users" : "plans"}`)
    const row = page.getByRole("row").filter({ hasText: isUsers ? "person@example.com" : "Free" }).first()
    await row.waitFor()
    if (scenario === "plan-cancel") {
      await row.getByRole("button", { name: "Expand" }).click()
      await page.getByText("Model one", { exact: true }).waitFor()
      assert.equal(await page.getByRole("switch").count(), 0, "expanded details must be read-only")
    }
    if (scenario === "plan-stale-load") holdAccess = true
    if (scenario.startsWith("plan-create-")) await page.getByRole("button", { name: "Add plan", exact: true }).click()
    else await row.getByRole("button", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const save = dialog.getByRole("button", { name: isUsers ? "Save user" : "Save plan", exact: true })
    const model = name => dialog.locator("div.flex.flex-wrap").filter({ has: page.getByText(`Model ${name}`, { exact: true }) })
    if (scenario.includes("load-failure")) {
      await dialog.getByRole("alert").waitFor()
      assert.equal(await save.isDisabled(), true)
      assert.equal(writes.length, 0)
      fail = false
      await dialog.getByRole("button", { name: "Retry", exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('[data-slot="app-dialog-footer"] button[type="submit"]').disabled)
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    } else if (scenario === "plan-stale-load") {
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
      holdAccess = false
      await page.getByRole("row").filter({ hasText: "Pro" }).first().getByRole("button", { name: "Edit", exact: true }).click()
      await dialog.getByText("Model one", { exact: true }).waitFor()
      assert.equal(accessRequests.get("/gateway/v1/admin/plans/pro/models"), 1, "opening a new plan must share the concurrent detail and editor read")
      const response = page.waitForResponse(response => response.url().includes("/free/models"))
      for (const resolve of releases) resolve()
      await response
      await page.waitForTimeout(100)
      assert.equal(await model("one").getByRole("switch", { name: "Visible", exact: true }).isChecked(), false)
      assert.equal(await dialog.getByLabel("Display name", { exact: true }).inputValue(), "Pro")
      assert.equal(writes.length, 0)
    } else if (scenario === "user-unknown" || scenario === "plan-create-unknown") {
      await page.waitForFunction(() => !document.querySelector('[data-slot="app-dialog-footer"] button[type="submit"]').disabled)
      if (isUsers) await dialog.locator("#admin-user-plan").selectOption("pro")
      else await dialog.getByLabel("Internal name", { exact: true }).fill("custom")
      await save.click()
      await dialog.getByRole("alert").filter({ hasText: "unconfirmed" }).waitFor()
      assert.equal(await save.isDisabled(), true, "unknown POST outcome must block blind retries")
      assert.equal(writes.length, 1)
      await dialog.getByRole("button", { name: "Close and refresh", exact: true }).click()
      await dialog.waitFor({ state: "hidden" })
      await page.waitForTimeout(100)
      if (isUsers) {
        await row.getByRole("button", { name: "Edit", exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('[data-slot="app-dialog-footer"] button[type="submit"]').disabled)
        assert.equal(await dialog.locator("#admin-user-plan").inputValue(), "pro")
        await save.click()
        await dialog.waitFor({ state: "hidden" })
      } else await page.getByRole("row").filter({ hasText: "custom" }).first().waitFor()
      assert.equal(writes.length, 1, "review must read committed state, never automatically resubmit")
    } else if (isUsers) {
      await page.waitForFunction(() => !document.querySelector('[data-slot="app-dialog-footer"] button[type="submit"]').disabled)
      if (scenario === "user-effective-plan") assert.equal(await dialog.locator("#admin-user-plan").inputValue(), "free")
      if (scenario === "user-partial" || scenario === "user-session") {
        await dialog.locator("#admin-user-role").selectOption("admin")
        await dialog.locator("#admin-user-plan").selectOption("pro")
        await save.click()
        if (scenario === "user-session") {
          while (!release) await new Promise(resolve => setTimeout(resolve, 10))
          assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true)
          await page.keyboard.press("Escape")
          assert.equal(await dialog.isVisible(), true)
          await page.evaluate(() => {
            localStorage.setItem("ineffable.auth.session_id", "session-b")
            localStorage.setItem("ineffable.auth.access_token", "token-b")
            window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token", newValue: "token-b" }))
          })
          await dialog.waitFor({ state: "hidden" })
          const response = page.waitForResponse(response => response.url().endsWith("users/role"))
          release()
          await response
          await page.waitForTimeout(100)
          assert.equal(writes.length, 1)
          assert.deepEqual(errors, [])
          console.log(`PASS admin editor: ${scenario}`)
          await page.close()
          continue
        }
        await dialog.getByRole("alert").filter({ hasText: "assignment failed" }).waitFor()
        assert.equal(writes.filter(w => w.path.endsWith("users/role")).length, 1)
        fail = false
      }
      await save.click()
      await dialog.waitFor({ state: "hidden" })
      assert.equal(writes.filter(w => w.path.endsWith("users/role")).length, ["user-noop", "user-effective-plan"].includes(scenario) ? 0 : 1)
      assert.equal(writes.filter(w => w.path.endsWith("user-plan-assignments")).length, ["user-noop", "user-effective-plan"].includes(scenario) ? 0 : 2)
    } else {
      await dialog.getByText("Model one", { exact: true }).waitFor()
      if (scenario === "plan-create-partial") await dialog.getByLabel("Internal name", { exact: true }).fill("custom")
      if (process.env.ADMIN_EDITOR_SCREENSHOT && scenario === "plan-save") await page.screenshot({ path: process.env.ADMIN_EDITOR_SCREENSHOT })
      await model("one").getByRole("switch", { name: "Visible", exact: true }).click()
      assert.equal(writes.length, 0, "switches must only change draft")
      if (scenario === "plan-cancel") {
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
        await row.getByRole("button", { name: "Edit", exact: true }).click()
        await dialog.getByText("Model one", { exact: true }).waitFor()
        assert.equal(await model("one").getByRole("switch", { name: "Visible", exact: true }).isChecked(), false)
        assert.equal(writes.length, 0)
      } else {
        if (scenario.includes("partial") || scenario === "plan-session") await model("two").getByRole("switch", { name: "Visible", exact: true }).click()
        await save.click()
        if (scenario.includes("partial")) {
          await dialog.getByRole("alert").filter({ hasText: "permission failed" }).waitFor()
          assert.match(await dialog.getByRole("alert").textContent(), /Model one/)
          fail = false
          await save.click()
        } else if (scenario === "plan-session") {
          while (!release) await new Promise(resolve => setTimeout(resolve, 10))
          assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true)
          await page.keyboard.press("Escape")
          assert.equal(await dialog.isVisible(), true)
          await page.evaluate(() => {
            localStorage.setItem("ineffable.auth.session_id", "session-b")
            localStorage.setItem("ineffable.auth.access_token", "token-b")
            window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token", newValue: "token-b" }))
          })
          await dialog.waitFor({ state: "hidden" })
          release()
          await page.waitForTimeout(100)
        }
        await dialog.waitFor({ state: "hidden" })
        assert.equal(writes.filter(w => w.path.endsWith("plan-model-access") && w.payload.model_profile_id === "one").length, 1, "retry must not resubmit saved access")
        assert.equal(writes.filter(w => w.path.endsWith("/plans")).length, scenario === "plan-create-partial" ? 1 : 0, "permission retry must not recreate the plan")
        if (scenario === "plan-session") assert.equal(writes.length, 1, "session switch must stop the remaining writes")
      }
    }
    assert.deepEqual(errors, [], scenario)
    console.log(`PASS admin editor: ${scenario}`)
    await page.close()
  }
} finally { await browser?.close(); await server.close() }
