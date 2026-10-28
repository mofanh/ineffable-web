import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const policy = { allowed_modes: ["smart", "clean", "full", "custom"], exposure_budget: { max_count: 24 } }
const question = { id: "q", question: "请确认是否继续处理原任务", options: [{ label: "继续处理" }] }
const run = { id: "existing-run", version: 1, execution_epoch: 1, lifecycle_seq: 1,
  status: "awaiting_human", is_live: false, is_streaming: false, accepts_guided_input: false,
  pending_need: { kind: "user_input", need_id: "existing-need", questions: [question] } }
const history = [
  { id: "canonical-wait", role: "assistant", message_type: "text", content: "等待你的选择。", metadata_json: {} },
  { id: "call-message", role: "assistant", message_type: "tool_call", content: "", metadata_json: {
    tool_call_id: "existing-need", tool_name: "request_user_input", full_arguments: JSON.stringify({ questions: [question] }), transcript_occurrence_id: "existing-need#1" } },
  { id: "result-message", role: "tool", message_type: "tool_result", content: JSON.stringify({ status: "waiting", blocking_need: run.pending_need }), metadata_json: {
    tool_call_id: "existing-need", tool_name: "request_user_input", transcript_occurrence_id: "existing-need#1" } },
].map((message, index) => ({ ...message, metadata_json: { ...message.metadata_json,
  transcript_segment: { id: "existing-run:1:1", turn: 1, execution_epoch: 1 }, canonical_source_message_id: message.id, canonical_message_seq: index + 1 },
  conversation_id: "first", run_id: run.id, timeline_seq: 1, timeline_unit_id: "run:existing-run:anchor:1",
  canonical_seq: index + 1, message_seq: index + 1, created_at: "2026-10-28T00:00:00Z" }))
const conversation = () => ({ id: "first", title: "Human answer feedback", current_run_id: run.id, current_run: run,
  capability_exposure_selection: { mode: "smart" }, capability_exposure_policy: { policy } })
const resumes = []
let historyReads = 0
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ locale: "zh-CN", viewport: { width: 1000, height: 900 } })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
  })
  await page.route("**/gateway/**", async route => {
    const path = new URL(route.request().url()).pathname
    let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 1 }
    if (path.endsWith("auth/me")) body = { user: { id: "owner", status: "active", role: "user" }, workspaces: [] }
    else if (path.endsWith("conversations/list")) body = { conversations: [conversation()] }
    else if (path.endsWith("conversations/preferences")) body = { timezone: "Asia/Shanghai", version: 0, defaults_json: {} }
    else if (path.endsWith("conversations/get")) body = conversation()
    else if (path.endsWith("capability-exposure/policy")) body = { selection: { mode: "smart" }, capability_exposure_policy: { policy } }
    else if (path.endsWith("models/profiles")) body = { profiles: [{ id: "model", display_name: "Model", enabled: true }] }
    else if (path.endsWith("/messages")) { historyReads++; body = { messages: history, next_seq: 1, page: { has_older: false, before: null } } }
    else if (path.endsWith("/observations/access")) body = { allowed: false }
    else if (path.endsWith("/runs/resume")) { resumes.push({ route, payload: route.request().postDataJSON() }); return }
    await route.fulfill({ json: body })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button", { name: "Select first", exact: true }).click()
  await page.evaluate(async () => { await (await import("/src/lib/i18n/i18n.ts")).i18n.changeLanguage("zh") })
  await page.getByText(question.question, { exact: true }).waitFor()
  await page.getByRole("radio", { name: "其他", exact: true }).click()
  const draft = page.getByPlaceholder("输入你的选择或补充说明")
  await draft.fill("保留这段自定义回答草稿")
  const toolIdentity = await page.locator('[data-chat-row-key^="tool:"]').getAttribute("data-chat-row-key")
  const waitUntil = async (condition, message) => {
    const deadline = Date.now() + 8000
    while (!condition() && Date.now() < deadline) await page.waitForTimeout(20)
    assert.ok(condition(), message)
  }
  await page.getByRole("button", { name: "提交选择", exact: true }).click()
  await waitUntil(() => resumes.length === 1, "answer reaches resume endpoint")
  await page.getByRole("button", { name: "正在提交", exact: true }).waitFor()
  assert.equal(await page.locator('[data-tool-status="running"]').count(), 0, "an unacknowledged answer cannot start a tool")
  assert.equal(await page.getByText("这个问题已不再等待回答。", { exact: true }).count(), 0)
  assert.equal(await draft.inputValue(), "保留这段自定义回答草稿")
  assert.equal(await draft.isDisabled(), true)
  const readsBeforeFailure = historyReads
  await resumes[0].route.fulfill({ status: 409, json: { error: "尚未接收回答，请重试" } })
  await waitUntil(() => historyReads > readsBeforeFailure, "resume failure reconciles canonical history")
  await page.getByRole("button", { name: "提交选择", exact: true }).waitFor()
  await page.getByText("尚未接收回答，请重试", { exact: true }).waitFor()
  assert.equal(await page.locator('[data-chat-row-key^="tool:"]').getAttribute("data-chat-row-key"), toolIdentity)
  assert.equal(await draft.inputValue(), "保留这段自定义回答草稿", "canonical refresh retains the answer")
  assert.equal(await draft.isDisabled(), false)
  assert.equal(await page.getByRole("radio", { name: "其他", exact: true }).getAttribute("aria-checked"), "true")
  assert.equal(await page.locator('[data-slot="toast-description"]').count(), 0, "answer failure has one owner: the question card")
  assert.equal(await page.locator("form .text-destructive").count(), 0)

  // Retrying the same need keeps its idempotency identity. A late response must
  // not install an answer or an error into a newly selected conversation.
  await page.getByRole("button", { name: "提交选择", exact: true }).click()
  await waitUntil(() => resumes.length === 2, "answer can be retried without retyping")
  assert.deepEqual(resumes[1].payload, resumes[0].payload)
  await page.evaluate(async () => { await (await import("/src/lib/i18n/i18n.ts")).i18n.changeLanguage("en") })
  await page.getByRole("button", { name: "New conversation", exact: true }).click()
  await page.waitForFunction(() => document.querySelector("[data-selection]")?.textContent === "new")
  await resumes[1].route.fulfill({ status: 409, json: { error: "旧问题的迟到错误" } })
  await page.waitForTimeout(150)
  assert.equal(await page.getByText("旧问题的迟到错误", { exact: true }).count(), 0)
  assert.equal(await page.getByText(question.question, { exact: true }).count(), 0)
  assert.equal(await page.locator('[data-slot="toast-description"]').count(), 0)
  assert.deepEqual(errors, [])
  console.log("delayed human answer, stable canonical identity, failed draft retention and stale response isolation passed")
} finally {
  await browser?.close()
  await server.close()
}
