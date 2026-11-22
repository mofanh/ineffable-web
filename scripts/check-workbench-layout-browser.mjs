import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { installShellFixture, apiRequests, workspace } from "./shell-performance-fixture.mjs"

const production = process.argv.includes("--production")
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const server = production ? await preview({ preview: { host: "127.0.0.1", port: 0 } }) : await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
const output = join(tmpdir(), `ineffable-conversation-workbench-${production ? "production" : "development"}`)
mkdirSync(output, { recursive: true })
let browser
try {
  if (!production) await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ executablePath, headless: true })
  for (const language of ["en-US", "zh-CN"]) for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await installShellFixture(page, false)
    await page.addInitScript(({ language, dark }) => {
      localStorage.setItem("ineffable.ui.language", language)
      localStorage.setItem("theme", dark ? "dark" : "light")
    }, { language, dark })
    const conversations = [{ id: "alpha", title: "Alpha task", current_run: null }, { id: "beta", title: "Beta task", current_run: null }, ...Array.from({ length: 30 }, (_, index) => ({ id: `older-${index}`, title: `Earlier task ${index}`, current_run: null }))]
    await page.route("**/gateway/v1/conversations/list*", route => route.fulfill({ json: { conversations } }))
    await page.route("**/gateway/v1/conversations/get*", route => route.fulfill({ json: conversations.find(item => item.id === new URL(route.request().url()).searchParams.get("conversation_id")) }))
    await page.route("**/gateway/v1/conversations/*/pending-inputs*", route => route.fulfill({ json: { pending_inputs: [] } }))
    await page.route("**/gateway/v1/conversations/messages*", route => route.fulfill({ json: { messages: [], page: { has_older: false, before: null } } }))
    await page.route("**/gateway/v1/conversations/run-observations/access*", route => route.fulfill({ json: { allowed: false } }))
    await page.route("**/gateway/v1/plugins/agent-evolution?*", route => route.fulfill({ status: 404, json: { message: "Evolution unavailable in layout fixture" } }))
    const zh = language === "zh-CN"
    const chat = page.locator('[data-slot="chat-workbench"]')
    const resource = page.locator('[data-slot="resource-workbench"]')
    const nav = page.getByRole("navigation", { name: zh ? "会话" : "Conversations", exact: true })
    const composer = chat.locator("textarea").first()
    const textObject = { id: `${workspace}-99`, workspace_id: workspace, kind: "file", name: "File 99.md", path: "notes/File 99.md", mime_type: "text/markdown", current_version_id: "text-version" }
    await page.route("**/gateway/v1/**/versions", route => route.fulfill({ json: { object: textObject, versions: [{ id: "text-version", version_no: 1 }] } }))
    await page.route("**/gateway/v1/**/content*", route => route.fulfill({ json: { object: textObject, version: { id: "text-version", version_no: 1 }, content: "WORKSPACE_DRAFT" } }))
    await page.goto(`${url}/chat`)
    await composer.waitFor()
    await nav.waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), dark, "requested theme actually applied")
    await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-home.png`) })
    assert.equal(await page.locator("textarea").count(), 1, "single composer despite obsolete right-sidebar preference=false")
    await composer.fill("KEEP_CONVERSATION_DRAFT")
    const composerIdentity = await composer.elementHandle()
    const before = apiRequests(fixture.requests).length
    for (let i = 0; i < 2; i++) await page.locator('[data-slot="sidebar-trigger"]').click()
    await page.waitForTimeout(250)
    assert.deepEqual(apiRequests(fixture.requests).slice(before), [], "navigation animation does not reload business data")
    await page.getByRole("button", { name: "File 99.md", exact: true }).first().click()
    await resource.waitFor({ state: "visible" })
    await page.waitForLoadState("networkidle")
    assert.equal(await page.locator('[data-slot="workspace-navigation"]').evaluate(el => el.scrollTop > 0), true, "large resource trees scroll in their own region")
    assert.equal(await nav.getByRole("textbox").evaluate(el => {
      const rect = el.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight
    }), true, "resource tree scrolling must not displace conversation search")
    assert.equal(await composer.inputValue(), "KEEP_CONVERSATION_DRAFT", "file route retains composer draft")
    assert.ok(await composerIdentity.evaluate(node => node === document.querySelector('[data-slot="chat-workbench"] textarea')), "route change retains exact composer node")
    await resource.getByRole("button", { name: zh ? "编辑文件" : "Edit file", exact: true }).click()
    const editor = resource.locator('.cm-content[contenteditable="true"]').first()
    await editor.waitFor()
    await editor.fill("UNSAVED_WORKSPACE_DRAFT")
    // DOM presence alone missed zero-width ancestor links beside a dirty editor toolbar.
    const ancestors = resource.locator('nav[aria-label="breadcrumb"] a')
    assert.equal(await ancestors.count(), 2, "workspace and notes ancestors remain available")
    for (const ancestor of await ancestors.all()) {
      assert.ok(await ancestor.evaluate(link => {
        const rect = link.getBoundingClientRect(), clip = link.closest("nav").getBoundingClientRect()
        return Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left) >= 12 && rect.height >= 16
      }), "dirty split-editor ancestor has a visible clickable area")
    }
    const dirtyUrl = page.url()
    await ancestors.filter({ hasText: /^notes$/ }).click()
    const dirtyDialog = page.getByRole("dialog")
    await dirtyDialog.waitFor()
    await dirtyDialog.getByRole("button", { name: zh ? "取消" : "Cancel", exact: true }).click()
    assert.equal(page.url(), dirtyUrl, "ancestor navigation uses the existing unsaved-changes guard")
    assert.ok((await editor.textContent()).includes("UNSAVED_WORKSPACE_DRAFT"))
    await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-split.png`) })
    const editorIdentity = await editor.elementHandle()
    await chat.getByRole("button", { name: zh ? "运行设置" : "Run settings", exact: true }).click()
    await page.getByRole("dialog").waitFor()
    await page.setViewportSize({ width: 390, height: 900 })
    // The composer is already visible on desktop; wait for the breakpoint commit.
    await resource.waitFor({ state: "hidden" })
    await composer.waitFor({ state: "visible" })
    assert.equal(await resource.isVisible(), false, "compact layout retains the active chat that owns the settings portal")
    assert.equal(await page.getByRole("dialog").isVisible(), true)
    await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-settings-390.png`) })
    await page.keyboard.press("Escape")
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    await page.setViewportSize({ width: 1440, height: 900 })
    await resource.waitFor({ state: "visible" })
    await resource.getByRole("button", { name: zh ? "专注资源" : "Focus resource", exact: true }).click()
    assert.equal(await chat.isVisible(), false)
    await resource.getByRole("button", { name: zh ? "返回会话与资源" : "Show conversation and resource", exact: true }).click()
    await resource.getByRole("button", { name: zh ? "隐藏资源" : "Hide resource", exact: true }).click()
    assert.equal(await resource.isVisible(), false)
    await page.getByRole("button", { name: zh ? "工作区" : "Workspace", exact: true }).click()
    assert.ok(await editorIdentity.evaluate(node => node.isConnected && node.textContent.includes("UNSAVED_WORKSPACE_DRAFT")), "hide/focus preserves mounted editor and unsaved file draft")
    for (const width of [1280, 1024, 1023, 768, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(250)
      if (width < 1024) {
        await page.getByRole("button", { name: zh ? "会话" : "Conversations", exact: true }).click()
        await composer.waitFor({ state: "visible" })
        await page.locator('[data-slot="sidebar-trigger"]').click()
        await nav.waitFor()
        await nav.getByRole("button", { name: zh ? "新对话" : "New conversation", exact: true }).waitFor()
        // Escape returns focus from the drawer without touching conversation state.
        await page.keyboard.press("Escape")
        await page.locator('[data-side="left"][data-compact="true"]').waitFor({ state: "hidden" })
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${language} ${width}: no page overflow`)
      assert.equal(await composer.inputValue(), "KEEP_CONVERSATION_DRAFT")
      assert.ok(await composerIdentity.evaluate(node => node.isConnected), "viewport keeps runtime mounted")
      if (width === 320 || width === 1440) await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-${width}.png`) })
    }
    if (await page.locator('[data-slot="sidebar"][data-side="left"]').getAttribute("data-state") === "collapsed") await page.locator('[data-slot="sidebar-trigger"]').click()
    const navigation = nav
    const search = navigation.getByRole("textbox")
    await search.fill("alpha")
    assert.equal(await navigation.getByRole("button", { name: "Beta task", exact: true }).count(), 0)
    await search.fill("")
    await navigation.getByRole("button", { name: "Alpha task", exact: true }).click()
    await page.waitForLoadState("networkidle")
    assert.equal(await navigation.getByRole("button", { name: "Alpha task", exact: true }).getAttribute("aria-current"), "true")
    await navigation.getByRole("button", { name: "Beta task", exact: true }).click()
    await page.waitForLoadState("networkidle")
    assert.equal(await navigation.getByRole("button", { name: "Beta task", exact: true }).getAttribute("aria-current"), "true")
    await navigation.getByRole("button", { name: zh ? "新对话" : "New conversation", exact: true }).click()
    assert.equal(await chat.locator("textarea").count(), 1, "selection/new draft still use one composer")
    assert.equal(await editorIdentity.evaluate(el => el.isConnected && el.textContent.includes("UNSAVED_WORKSPACE_DRAFT")), true)
    assert.equal(apiRequests(fixture.requests).filter(item => item.method !== "GET").length, 0, "selection/new draft never stop, send, or create a persisted conversation")
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
  }
  console.log(`Conversation-first workbench ${production ? "production" : "development"}: central singleton, resource route/focus/drafts, sidebar, responsive EN/ZH light/dark passed; screenshots: ${output}`)
} finally {
  await browser?.close()
  if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  else await server.close()
}
