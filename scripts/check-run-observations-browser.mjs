import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome is required")
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
const record = {
  seq: 1, execution_epoch: 1, request_id: "run-a:main:model:1", stage: "prepared", attempt: 0, created_at: "2026-09-11T00:00:00Z",
  data: { turn: 1, total_items: 2, truncated: false, diff: { available: true, added: 1, removed: 0, changed: 1, unchanged: 0 }, items: [
    {id: "policy:1", kind: "SystemPolicy", scope: "stable_prefix", bytes: 120, content_hash: "sha256:" + "a".repeat(64)},
    {id: "history:0", kind: "User", scope: "request_history", bytes: 230, content_hash: "sha256:" + "b".repeat(64)},
  ] },
}
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const language of ["zh-CN", "en-US"]) for (const width of [320, 390, 1200]) {
    const page = await browser.newPage({ viewport: { width, height: 740 } })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    let failure = 0
    let coverage = "partial"
    let hold = false
    let release
    const requests = []
    await page.route("**/gateway/v1/conversations/run-observations?**", async route => {
      const url = new URL(route.request().url())
      requests.push(url)
      if (hold && url.searchParams.get("run_id") === "run-a") await new Promise(resolve => { release = resolve })
      const run = url.searchParams.get("run_id")
      const cursor = url.searchParams.get("cursor")
      const current = { ...structuredClone(record), seq: cursor ? 2 : 1, request_id: run + ":main:model:" + (cursor ? 2 : 1) }
      await route.fulfill({ status: failure || 200, json: failure ? {error: "observation_forbidden"} : {
        run_id: run, conversation_id: run === "run-b" ? "conversation-b" : "conversation-a", execution_epoch: 1, status: "completed", coverage, definition_fingerprint: "sha256:" + "c".repeat(64),
        model_attempt_count: 2, tool_count: 3, wall_time_ms: 1200, watermark: 2, records: coverage === "partial" ? [current] : [], next_cursor: coverage === "partial" && !cursor ? "page-two" : null,
      } })
    })
    const zh = language === "zh-CN"
    const refresh = () => page.getByRole("button", { name: zh ? "刷新记录" : "Refresh records", exact: true })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/run-observation-fixture.html?language=${language}`)
    await page.locator("[data-observation-seq='1']").waitFor()
    assert.equal(requests.length, 1, "StrictMode must share the initial in-flight read")
    await page.locator("[data-observation-seq='1'] > summary").click()
    await page.getByText(zh ? "与前次请求比较" : "Compared with previous request", { exact: true }).waitFor()
    const bounds = await page.getByRole("dialog").evaluate(el => ({
      right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left,
      overflow: [...el.querySelectorAll("*")].filter(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX === "visible").map(node => node.tagName),
    }))
    assert.ok(bounds.left >= 0 && bounds.right <= width + 1, JSON.stringify(bounds))
    assert.deepEqual(bounds.overflow, [], "expanded metadata must wrap inside the panel")
    if (language === "zh-CN") await page.screenshot({ path: `/tmp/trajectory-integrated-${width}.png` })
    await page.getByRole("button", { name: zh ? "下一页" : "Next page", exact: true }).click()
    await page.locator("[data-observation-seq='2']").waitFor()
    assert.equal(await page.locator("[data-observation-seq='1']").count(), 0)
    await refresh().click()
    await page.locator("[data-observation-seq='1']").waitFor()
    // Revalidate authorization even after the run has completed.
    await page.clock.install()
    failure = 403
    await page.clock.runFor(10_100)
    await page.getByRole("alert").waitFor()
    assert.equal(await page.locator("[data-observation-seq]").count(), 0, "revocation must clear previous records")
    failure = 0
    await page.getByRole("button", { name: zh ? "重试" : "Retry", exact: true }).click()
    await page.locator("[data-observation-seq='1']").waitFor()
    await page.clock.resume()
    coverage = "expired"
    await refresh().click()
    await page.getByText(zh ? "记录已过期" : "Records have expired", { exact: true }).waitFor()
    coverage = "not_recorded"
    await refresh().click()
    await page.getByText(zh ? "这次运行没有可用记录" : "No records are available for this run", { exact: true }).waitFor()
    coverage = "partial"
    hold = true
    await refresh().click()
    await page.waitForTimeout(50)
    await page.evaluate(() => window.observationFixture.select("run-b"))
    await page.locator('[data-run-observation-panel][data-run-id="run-b"] [data-observation-seq]').waitFor()
    assert.ok(release)
    hold = false
    release()
    await page.waitForTimeout(100)
    assert.equal(await page.getByText("run-a", { exact: true }).count(), 0, "late old-conversation response must not replace selected run")
    await page.getByRole("button", { name: zh ? "关闭" : "Close", exact: true }).click()
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log("run observation browser checks passed")
} finally {
  await browser?.close()
  await server.close()
}
