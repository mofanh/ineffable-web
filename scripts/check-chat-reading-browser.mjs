import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome required")
const output = join(tmpdir(), "ineffable-chat-reading")
mkdirSync(output, { recursive: true })
const server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] })
  for (const theme of ["light", "dark"]) for (const language of ["en-US", "zh-CN"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
    const fixture = await installShellFixture(page, false)
    await page.addInitScript(({ theme, language }) => {
      localStorage.setItem("theme", theme)
      localStorage.setItem("ineffable.ui.language", language)
    }, { theme, language })
    let sent = null
    const conversation = { id: "reading", title: "Reading fixture", current_run: null }
    await page.route("**/gateway/**", async route => {
      const path = new URL(route.request().url()).pathname
      let body
      if (path.endsWith("/models/profiles")) body = { profiles: [{ id: "long-model", display_name: "Very long model profile · 超长模型名称 · Production reasoning model", enabled: true }] }
      else if (path.endsWith("/sandbox/environments")) body = { providers: [{ provider_id: "device", display_name: "Very long device name · 超长设备名称", status: "online" }], environments: [{ environment_id: "long-environment", provider_id: "device", status: "ready" }] }
      else if (path.endsWith("/conversations/events")) body = { events: [], next_seq: 0 }
      else if (path.endsWith("/plugins/agent-evolution")) body = { enabled: false }
      else if (path.endsWith("/conversations/get")) body = conversation
      else if (path.endsWith("/conversations/create")) body = conversation
      else if (path.endsWith("/conversations/send")) {
        sent = route.request().postDataJSON()
        return route.fulfill({ contentType: "text/event-stream", body: `data: ${JSON.stringify({ status: "queued", queue_len: 1, pending_id: 1, conversation_id: "reading", message_id: "input", input_request_id: sent.input_request_id })}\n\n` })
      } else if (path.endsWith("/conversations/list")) body = { conversations: sent ? [conversation] : [] }
      else if (path.endsWith("/conversations/reading")) body = conversation
      else if (path.endsWith("/messages")) body = { messages: sent ? [{ id: "input", conversation_id: "reading", role: "user", message_type: "input", content: sent.content, message_seq: 1, canonical_seq: 1, timeline_seq: 1, timeline_unit_id: "message:input", created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" }] : [], has_more: false }
      else if (path.includes("/conversations/reading/")) body = { events: [], pending_inputs: [], next_seq: 0, preferences: {}, enabled: false }
      else return route.fallback()
      return route.fulfill({ json: body })
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat`)
    const input = page.locator("textarea")
    await input.waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.locator('[data-slot="workspace-navigation"]').getByText("File 0.md", { exact: true }).first().waitFor()
    const pickerLabels = await page.evaluate(async () => {
      const { i18n } = await import("/src/lib/i18n/i18n.ts")
      return { model: i18n.t("chat.composer.modelPickerLabel"), sandbox: i18n.t("chat.composer.sandboxPickerLabel") }
    })
    await page.getByRole("button", { name: new RegExp(pickerLabels.model) }).click()
    await page.getByRole("option", { name: /Very long model profile/ }).click()
    await page.getByRole("button", { name: new RegExp(pickerLabels.sandbox) }).click()
    await page.getByRole("option", { name: /Very long device name/ }).click()
    const originalInput = await input.elementHandle()
    const originalScroller = await page.locator("div[data-chat-scroll-region]").elementHandle()
    for (const width of [1440, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await input.fill("Draft: 中文 English")
      await input.press("Shift+Enter")
      assert.ok((await input.inputValue()).includes("\n"), "Shift+Enter inserts a newline")
      for (const event of [{ key: "Enter", repeat: true }, { key: "Enter", isComposing: true }, { key: "Enter", keyCode: 229 }]) {
        await input.dispatchEvent("keydown", { ...event, bubbles: true, cancelable: true })
        assert.equal(sent, null, "IME and repeat keys never submit")
      }
      const geometry = await page.evaluate(() => {
        const tree = document.querySelector('[data-slot="workspace-navigation"]')
        if (innerWidth >= 1024 && tree.scrollWidth > tree.clientWidth + 1) {
          throw new Error(`Workspace tree horizontal overflow: ${tree.scrollWidth}/${tree.clientWidth}; ` + Array.from(tree.querySelectorAll("*")).filter(node => node.getBoundingClientRect().right > tree.getBoundingClientRect().left + tree.clientWidth + 1).map(node => `${node.tagName}.${node.className}`).slice(0, 8).join("; "))
        }
        const viewport = document.querySelector("div[data-chat-scroll-region]")
        const message = document.querySelector("[data-chat-reading-message]").getBoundingClientRect()
        const group = document.querySelector('[data-slot="input-group"]')
        const composer = group.getBoundingClientRect()
        const controlsFit = Array.from(group.querySelectorAll("button")).filter(node => node.offsetWidth).every(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.left >= composer.left && rect.right <= composer.right })
        return { controlsFit, a: viewport.clientWidth, m: message.width, c: composer.width, axis: Math.abs(message.x + message.width / 2 - composer.x - composer.width / 2), gutter: viewport.offsetWidth - viewport.clientWidth, dark: document.documentElement.classList.contains("dark"), language: document.documentElement.lang, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      assert.ok(Math.abs(geometry.c - geometry.m - 32) <= 1 && geometry.axis <= 1, JSON.stringify(geometry))
      assert.ok(geometry.gutter > 0, "exercise reserved classic scrollbar gutter")
      assert.equal(geometry.dark, theme === "dark")
      assert.equal(geometry.overflow, false)
      assert.equal(geometry.language, language)
      assert.ok(geometry.controlsFit, "long model/environment names cannot clip toolbar actions")
      assert.ok(await originalInput.evaluate(node => node === document.querySelector("textarea")), "resize preserves exact input DOM")
      await page.screenshot({ path: join(output, `${theme}-${language}-${width}.png`) })
    }
    await input.fill("First actual send")
    await input.press("Enter")
    await page.waitForFunction(() => document.querySelector('[data-chat-entry-role="user"]')).catch(async error => {
      console.error({ sent, requests: fixture.requests.filter(request => request.path.startsWith("/gateway/")), unexpected: fixture.unexpected, errors: fixture.errors, body: (await page.locator("body").innerText()).slice(-5000) })
      throw error
    })
    assert.equal(sent.content, "First actual send")
    assert.equal(sent.runtime_overrides.workspace.mode, "disabled")
    assert.ok(await originalInput.evaluate(node => node === document.querySelector("textarea")), "empty-to-first-message preserves exact input DOM")
    assert.ok(await originalScroller.evaluate(node => node === document.querySelector("div[data-chat-scroll-region]")), "empty-to-first-message preserves exact scrollport DOM")
    await page.screenshot({ path: join(output, `${theme}-${language}-active.png`) })
    const newLabel = await page.evaluate(async () => (await import("/src/lib/i18n/i18n.ts")).i18n.t("chat.header.newChat"))
    await page.locator('[data-sidebar="header"]').getByRole("button", { name: newLabel, exact: true }).click()
    assert.ok(await originalInput.evaluate(node => !node.isConnected), "a distinct new draft still resets native input/IME context")
    assert.ok(await originalScroller.evaluate(node => node === document.querySelector("div[data-chat-scroll-region]")), "new draft preserves the one scrollport")
    assert.deepEqual(fixture.requests.filter(request => request.method === "POST" && request.path.startsWith("/gateway/")).map(request => request.path).sort(), ["/gateway/v1/conversations/create", "/gateway/v1/conversations/send"], "new navigation never sends Stop")
    assert.deepEqual(fixture.unexpected, [])
    assert.deepEqual(fixture.errors, [])
    await originalInput.dispose()
    await originalScroller.dispose()
    await page.close()
    console.log(`${theme}/${language}: classic gutter, narrow reading axis, IME/repeat, first-send DOM identity passed`)
  }
  console.log(`Mock Shell screenshots: ${output}`)
} finally { await browser?.close(); await server.close() }
