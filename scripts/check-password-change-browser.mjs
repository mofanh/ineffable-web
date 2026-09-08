import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((path) => path && existsSync(path))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "test-token")
    localStorage.setItem("ineffable.auth.session_id", "test-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
  })
  let codeRequests = 0
  let sessionReads = 0
  const submissions = []
  let fail = true
  let failSessions = false
  let holdPath = null
  let releaseHeld
  let heldRequests = 0
  await page.route("**/gateway/v1/**", async (route) => {
    const url = route.request().url()
    let body = {}
    let status = 200
    if (holdPath && url.includes(holdPath)) {
      heldRequests += 1
      await new Promise((resolve) => { releaseHeld = resolve })
      await route.fulfill({ status: 401, json: { error: "invalid access token" } })
      return
    }
    if (url.includes("auth/me")) {
      const actor = route.request().headers().authorization === "Bearer token-b" ? "actor-b" : "actor"
      body = { user: { id: actor, email: `${actor}@example.com`, display_name: actor, role: "user", status: "active" }, workspaces: [] }
    }
    else if (url.includes("conversations/list")) body = { conversations: [] }
    else if (url.includes("auth/sessions")) { sessionReads += 1; body = failSessions ? { error: "device refresh failed" } : { sessions: [] }; status = failSessions ? 500 : 200 }
    else if (url.includes("password/code")) {
      codeRequests += 1
      assert.deepEqual(route.request().postDataJSON(), {}, "email target must not come from the browser")
      body = { status: "sent", retry_after_seconds: 60 }
    } else if (url.includes("password/change")) {
      submissions.push(route.request().postDataJSON())
      status = fail ? 400 : 200
      body = fail ? { error: "Invalid verification code" } : { status: "changed" }
    }
    await route.fulfill({ status, json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/password-change-fixture.html`)
  const current = page.getByLabel("Current password", { exact: true })
  const next = page.getByLabel("New password", { exact: true })
  const confirm = page.getByLabel("Confirm new password", { exact: true })
  const code = page.getByLabel("Email verification code", { exact: true })
  const save = page.getByRole("button", { name: "Change password", exact: true })
  await current.waitFor()
  assert.equal(await current.getAttribute("type"), "password")
  await page.getByRole("button", { name: "Send code", exact: true }).click()
  await page.getByText("Code sent. It expires in 10 minutes.", { exact: true }).waitFor()
  assert.equal(await page.getByRole("button", { name: /Resend in/ }).isDisabled(), true)
  assert.equal(codeRequests, 1)
  await current.fill("old-password-123")
  await next.fill("new-password-456")
  await confirm.fill("mismatch")
  await code.fill("123456")
  await save.click()
  await page.getByText("The new passwords do not match.", { exact: true }).waitFor()
  assert.equal(submissions.length, 0)
  await confirm.fill("new-password-456")
  await save.click()
  await page.getByText("Invalid verification code", { exact: true }).waitFor()
  assert.equal(await next.inputValue(), "new-password-456")
  assert.deepEqual(submissions[0], { current_password: "old-password-123", new_password: "new-password-456", email_verification_code: "123456" })
  fail = false
  failSessions = true
  const previousReads = sessionReads
  await save.click()
  await page.getByText("Password changed. Other devices have been signed out.", { exact: true }).waitFor()
  for (const field of [current, next, confirm, code]) assert.equal(await field.inputValue(), "")
  assert.equal(await page.evaluate(() => localStorage.getItem("ineffable.auth.access_token")), "test-token")
  assert.ok(sessionReads > previousReads, "device list refreshes after success")
  await page.getByRole("alert").waitFor()
  assert.equal(await page.getByText("Password changed. Other devices have been signed out.", { exact: true }).count(), 1, "device refresh failure cannot hide password success")
  failSessions = false
  // A late 401 must not replay either sensitive request with account B's token.
  for (const path of ["password/code", "password/change"]) {
    await page.evaluate(() => {
      localStorage.setItem("ineffable.auth.access_token", "test-token")
      localStorage.setItem("ineffable.auth.session_id", "test-session")
    })
    await page.reload()
    await current.waitFor()
    holdPath = path
    releaseHeld = undefined
    const beforeHeld = heldRequests
    if (path.endsWith("code")) await page.getByRole("button", { name: "Send code", exact: true }).click()
    else {
      await current.fill("old-password-123"); await next.fill("new-password-456"); await confirm.fill("new-password-456"); await code.fill("123456")
      await save.click()
    }
    const deadline = Date.now() + 5_000
    while (!releaseHeld && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.ok(releaseHeld)
    await page.evaluate(() => {
      localStorage.setItem("ineffable.auth.session_id", "session-b")
      localStorage.setItem("ineffable.auth.access_token", "token-b")
      window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token", newValue: "token-b" }))
    })
    await page.getByText(/A verification code will be sent to actor-b@example.com/).waitFor()
    releaseHeld()
    await page.waitForTimeout(200)
    assert.equal(heldRequests, beforeHeld + 1, "old request must not be retried for the new account")
    assert.equal(await current.inputValue(), "", "new account must not inherit old password fields")
    assert.equal(await page.getByRole("alert").count(), 0, "old response must not surface in new account")
    holdPath = null
  }
  assert.deepEqual(errors, [])
  console.log("account password change browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
