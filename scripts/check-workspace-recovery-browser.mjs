import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
const streams = new Set()
const server = await createServer({ root: process.cwd(), logLevel: "error", plugins: [{
  name: "workspace-recovery-stream", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!new URL(req.url, "http://localhost").pathname.endsWith("/subscribe")) return next()
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
      res.write(": connected\n\n")
      streams.add(res)
      res.on("close", () => streams.delete(res))
    })
  },
}], server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
const workspace = "00000000-0000-0000-0000-000000000001"
const imageId = "00000000-0000-0000-0000-000000000002"
const imageVersion = "00000000-0000-0000-0000-000000000003"
const now = "2026-10-23T10:00:00Z"
const segment = { id: "run-a:1:2", execution_epoch: 1, turn: 2 }
const metadata = change => ({ tool_call_id: "call-a", tool_name: "workspace", settlement_status: "succeeded", success: true, transcript_segment: segment, workspace_changes: [change] })
const message = (id, type, seq, content, extra = {}) => ({ id, conversation_id: "first", run_id: "run-a", role: type === "input" ? "user" : type === "tool_result" ? "tool" : "assistant", message_type: type, content, metadata_json: extra, created_at: now, updated_at: now, timeline_seq: seq, timeline_unit_id: "unit-a", canonical_seq: seq, run_status: "completed" })
const history = change => [message("input", "input", 1, "Update file"), message("result", "tool_result", 2, "Written", metadata(change)), message("answer", "output", 3, "CANONICAL RESULT", { assistant_phase: "final_answer" })]
const waitUntil = async predicate => {
  const deadline = Date.now() + 8000
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 15))
  assert.ok(predicate(), "expected request must reach the actual component entrypoint")
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const scenario of ["recovery", "sse-handoff", "older-page", "old-delete", "draft-same-version", "draft-changed-version", "canonical-image", "late-history-session", "late-file-selection", "saved-before-revalidation-error"]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
    page.setDefaultTimeout(10000)
    const errors = [], requests = []
    let revision = 1, canonical = [], older = [], coverage = 0, holdRead = false, releaseRead, holdHistory = false, releaseHistory
    page.on("pageerror", error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "fixture-token")
      localStorage.setItem("ineffable.auth.session_id", "fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
      window.workspaceChanges = []
      window.addEventListener("ineffable:workspace-objects-changed", event => window.workspaceChanges.push(event.detail))
    })
    const file = () => ({ id: "file", workspace_id: workspace, parent_id: null, name: revision > 1 ? "fresh.txt" : "old.txt", path: revision > 1 ? "fresh.txt" : "old.txt", kind: "file", mime_type: "text/plain", current_version_id: `v${revision}`, created_at: now, updated_at: now })
    const version = () => ({ id: `v${revision}`, version_no: revision, created_at: now, size_bytes: 20 })
    const change = () => ({ workspace_id: workspace, object_id: "file", path: file().path, version_id: version().id, action: "write_file" })
    const run = { id: "run-a", status: "streaming", execution_epoch: 1, is_streaming: true, is_live: true }
    const conversation = id => ({ id, title: id, current_run_id: scenario === "sse-handoff" && id === "first" ? run.id : null, current_run: scenario === "sse-handoff" && id === "first" ? run : null })
    await page.route("**/gateway/v1/**", async route => {
      const url = new URL(route.request().url()), path = url.pathname
      requests.push({ path, search: url.search })
      if (path.endsWith("/subscribe")) return route.continue()
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: coverage, invitations: [], objects: [], next_cursor: null }
      if (path.endsWith("auth/me")) body = { user: { id: "owner", email: "owner@example.com", status: "active", role: "user" }, workspaces: [{ id: workspace, name: "Workspace", workspace_type: "personal", status: "active" }] }
      else if (path.endsWith("conversations/list")) body = { conversations: [conversation("first"), conversation("other")] }
      else if (path.endsWith("conversations/get")) body = conversation(url.searchParams.get("conversation_id"))
      else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
      else if (path.endsWith("/messages")) {
        if (holdHistory && url.searchParams.get("conversation_id") === "first") await new Promise(resolve => { releaseHistory = resolve })
        body = { messages: url.searchParams.get("conversation_id") === "first" ? url.searchParams.has("before") ? older : canonical : [], next_seq: coverage, page: { has_older: older.length > 0 && !url.searchParams.has("before"), before: older.length ? "older-page" : null } }
      } else if (path.endsWith("/access")) body = { workspace: { id: workspace, name: "Workspace", workspace_type: "personal", status: "active" }, membership: { role: "owner", status: "active" }, can_write: true }
      else if (path.endsWith("/directory")) body = { objects: [file(), ...(scenario === "canonical-image" && revision > 1 ? [{ id: imageId, workspace_id: workspace, parent_id: null, name: "generated.png", path: "generated.png", kind: "file", mime_type: "image/png", current_version_id: imageVersion }] : [])], next_cursor: null }
      else if (path.includes("/second/") && path.endsWith("/versions")) body = { object: { ...file(), id: "second", path: "second.txt", name: "second.txt" }, versions: [version()] }
      else if (path.includes("/second/") && path.endsWith("/content")) body = { object: { ...file(), id: "second", path: "second.txt", name: "second.txt" }, version: version(), content: "SECOND FILE CONTENT" }
      else if (path.endsWith("/content") && route.request().method() === "PATCH") {
        assert.equal(route.request().postDataJSON().expected_version_id, "v1")
        revision = 2
        body = { object: file(), version: version() }
      }
      else if (path.endsWith("/versions")) body = { object: file(), versions: [version()] }
      else if (path.endsWith("/content")) {
        body = { object: file(), version: version(), content: revision > 1 ? "NEW CONTENT" : "OLD CONTENT" }
        if (holdRead) {
          await new Promise(resolve => { releaseRead = resolve })
          if (scenario === "saved-before-revalidation-error") return route.fulfill({ status: 500, json: { error: "STALE_REVALIDATION_FAILURE" } })
        }
      } else if (path.endsWith("/observations/access")) body = { allowed: false }
      await route.fulfill({ json: body })
    })
    await page.goto(`${origin}/scripts/workspace-recovery-fixture.html`)
    await page.getByText("OLD CONTENT", { exact: true }).waitFor()
    await page.getByRole("button", { name: "old.txt", exact: true }).waitFor()
    const reads = suffix => requests.filter(request => request.path.endsWith(suffix)).length
    const before = { directory: reads("/directory"), content: reads("/content") }
    if (scenario === "sse-handoff") {
      await page.getByRole("button", { name: "Select first", exact: true }).click()
      await waitUntil(() => streams.size > 0)
      revision = 2
      const event = { type: "event", event: { event: "tool.result", seq: 101, run_id: "run-a", stream: "chat", phase: "tool", content: "Written", metadata: { ...metadata(change()), conversation_id: "first", execution_epoch: 1, scope: "main" } } }
      for (const stream of streams) stream.write(`data: ${JSON.stringify(event)}\n\n`)
      await page.getByText("NEW CONTENT", { exact: true }).waitFor()
      await page.getByRole("button", { name: "fresh.txt", exact: true }).waitFor()
    } else {
      await page.getByRole("button", { name: "Select other", exact: true }).click()
      await page.waitForTimeout(100)
      if (!["draft-same-version", "saved-before-revalidation-error"].includes(scenario)) revision = 2
    }
    if (scenario === "old-delete") canonical = history({ ...change(), object_id: "deleted-prior-file", path: "old.txt", version_id: null, action: "delete" })
    else if (scenario === "canonical-image") canonical = [message("image-answer", "output", 1, "CANONICAL RESULT", { assistant_phase: "final_answer", images: [{ workspace_id: workspace, object_id: imageId, version_id: imageVersion, mime_type: "image/png", width: 1, height: 1, size_bytes: 100 }] })]
    else if (scenario === "older-page") { older = history(change()).map(record => ({ ...record, run_id: "older-run", timeline_unit_id: "older-unit" })); canonical = [message("tail", "output", 10, "LATEST PAGE")] }
    else canonical = history(change())
    coverage = 101
    const changesBefore = await page.evaluate(() => window.workspaceChanges.length)
    if (scenario === "sse-handoff") {
      await page.getByRole("button", { name: "Select other", exact: true }).click()
      await page.waitForTimeout(100)
    }
    if (scenario.startsWith("draft-") || ["late-file-selection", "saved-before-revalidation-error"].includes(scenario)) holdRead = true
    if (scenario === "late-history-session") holdHistory = true
    await page.getByRole("button", { name: "Select first", exact: true }).click()
    if (scenario === "late-history-session") {
      await waitUntil(() => Boolean(releaseHistory))
      await page.getByRole("button", { name: "Log out", exact: true }).click()
      await page.waitForFunction(() => !localStorage.getItem("ineffable.auth.access_token"))
      holdHistory = false
      releaseHistory()
      await page.waitForTimeout(200)
      assert.deepEqual(await page.evaluate(() => window.workspaceChanges), [], "previous session history must not invalidate current resources")
      assert.deepEqual(errors, [])
      await page.close(); console.log("Workspace late-history-session: actual auth ownership passed"); continue
    }
    if (scenario === "older-page") {
      await page.getByText("LATEST PAGE", { exact: true }).waitFor()
      assert.equal(reads("/content"), before.content, "latest page without mutation must not refresh the editor")
      await page.getByRole("button", { name: "Earlier messages", exact: true }).click()
    }
    await page.getByText("CANONICAL RESULT", { exact: true }).waitFor()
    if (scenario === "late-file-selection") {
      await waitUntil(() => Boolean(releaseRead))
      holdRead = false
      await page.getByRole("button", { name: "Open second file", exact: true }).click()
      await page.getByText("SECOND FILE CONTENT", { exact: true }).waitFor()
      releaseRead()
      await page.waitForTimeout(200)
      assert.equal(await page.getByText("SECOND FILE CONTENT", { exact: true }).count(), 1, "old file revalidation cannot overwrite a new route")
      assert.equal(await page.getByText("NEW CONTENT", { exact: true }).count(), 0)
    } else if (scenario === "saved-before-revalidation-error") {
      await waitUntil(() => Boolean(releaseRead))
      await page.getByRole("button", { name: "Edit file", exact: true }).click()
      const editor = page.locator(".cm-content[contenteditable=true]")
      await editor.fill("LOCAL SAVED CONTENT")
      await page.getByRole("button", { name: "Save", exact: true }).click()
      await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "hidden" })
      releaseRead()
      await page.waitForTimeout(200)
      assert.equal(await editor.textContent(), "LOCAL SAVED CONTENT")
      assert.equal(await page.getByText("STALE_REVALIDATION_FAILURE", { exact: true }).count(), 0, "old revalidation errors cannot overwrite a newer successful save")
    } else if (scenario.startsWith("draft-")) {
      await waitUntil(() => Boolean(releaseRead))
      await page.getByRole("button", { name: "Edit file", exact: true }).click()
      const editor = page.locator(".cm-content[contenteditable=true]")
      await editor.waitFor()
      await editor.fill("LOCAL UNSAVED DRAFT")
      releaseRead()
      await page.waitForTimeout(200)
      assert.equal(await editor.textContent(), "LOCAL UNSAVED DRAFT", "late revalidation must preserve typing and editor identity")
      assert.equal(await page.getByText(/A newer version is available/).count() > 0, scenario === "draft-changed-version", "conflict requires an actual server version change")
    } else if (scenario === "canonical-image") await page.getByRole("button", { name: "generated.png", exact: true }).waitFor()
    else {
      await page.getByText("NEW CONTENT", { exact: true }).waitFor()
      await page.getByRole("button", { name: "fresh.txt", exact: true }).waitFor()
      assert.ok(reads("/directory") > before.directory && reads("/content") > before.content)
    }
    if (scenario === "old-delete") assert.equal(requests.filter(request => request.path.endsWith("/latest-file")).length, 0, "historical delete must re-read today's object, never navigate away")
    if (scenario === "recovery" || scenario === "sse-handoff") {
      const count = await page.evaluate(() => window.workspaceChanges.length)
      if (scenario === "sse-handoff") assert.equal(count, changesBefore, "canonical handoff must not repeat an already observed live mutation")
      await page.getByRole("button", { name: "Select other", exact: true }).click()
      await page.waitForTimeout(100)
      await page.getByRole("button", { name: "Select first", exact: true }).click()
      await page.getByText("CANONICAL RESULT", { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.workspaceChanges.length), count, "repeat history must not emit duplicate mutations")
    }
    const changes = await page.evaluate(() => window.workspaceChanges)
    assert.ok(changes.length > 0 && changes.filter(change => change.source === "agent").every(change => change.revalidate === true))
    assert.deepEqual(errors, [])
    console.log(`Workspace ${scenario}: actual chat, tree and editor passed`)
    await page.close()
    await waitUntil(() => streams.size === 0)
  }
} finally { await browser?.close(); await server.close() }
