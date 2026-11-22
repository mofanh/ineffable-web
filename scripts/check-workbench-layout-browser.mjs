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
    const longTitle = `Alpha task: ${"Review workspace structure and execution results — ".repeat(8)}`
    const conversations = [{ id: "alpha", title: longTitle, current_run: null }, { id: "beta", title: "Beta task", current_run: null }, ...Array.from({ length: 30 }, (_, index) => ({ id: `older-${index}`, title: `Earlier task ${index}`, current_run: null }))]
    await page.route("**/gateway/v1/conversations/list*", route => route.fulfill({ json: { conversations } }))
    await page.route("**/gateway/v1/conversations/get*", route => route.fulfill({ json: conversations.find(item => item.id === new URL(route.request().url()).searchParams.get("conversation_id")) }))
    await page.route("**/gateway/v1/conversations/*/pending-inputs*", route => route.fulfill({ json: { pending_inputs: [] } }))
    await page.route("**/gateway/v1/conversations/messages*", route => route.fulfill({ json: { messages: [], page: { has_older: false, before: null } } }))
    await page.route("**/gateway/v1/conversations/run-observations/access*", route => route.fulfill({ json: { allowed: false } }))
    await page.route("**/gateway/v1/plugins/agent-evolution?*", route => route.fulfill({ json: {
      conversation_id: new URL(route.request().url()).searchParams.get("conversation_id"),
      requested: false, effective_mode: "disabled", definition_usage: 0,
      policy: { max_definitions: 0, allow_definition_recomposition: false },
      definitions: [], evaluations: [], suggestions: [], default_history: [], trial_history: [],
      effective_selection: { owner_user_id: "user", source: "system" },
      runtime_labs: [], runtime_lab_components: [], actions: [],
      runtime_lab_quote: { available: false, requires_confirmation: true, max_components: 0,
        allowed_component_kinds: [], charged_credits: 0, reserved_credits: 0, active_cloud_sandboxes: 0 },
    } }))
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
    const header = chat.locator('[data-slot="workbench-conversation-header"]')
    const titleMenu = header.locator('[data-slot="dropdown-menu-trigger"]').first()
    await titleMenu.waitFor()
    assert.deepEqual(await header.evaluate(node => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })), { top: 0, height: 48 }, "one conversation header, without an extra shell toolbar or empty tab strip")
    assert.equal(await chat.locator('.chat-conversation [data-slot="sidebar-header"]').count(), 0, "runtime renders title into the shell slot, not a second header")
    const titleIdentity = await titleMenu.elementHandle()
    await titleMenu.focus()
    await page.keyboard.press("Enter")
    await page.getByRole("menu").waitFor()
    await page.keyboard.press("Escape")
    await page.getByRole("menu").waitFor({ state: "hidden" })
    await page.waitForFunction(node => node === document.activeElement, titleIdentity)
    await nav.waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(await nav.getByRole("textbox").count(), 0, "search starts as a compact title-row action")
    const scrollContract = await page.evaluate(() => {
      const outer = document.querySelector('[data-slot="sidebar-navigation-scroll"]')
      const list = document.querySelector('[data-slot="sidebar-browser-scroll"]')
      const header = document.querySelector('[data-slot="sidebar-header"]')
      const footer = document.querySelector('[data-slot="sidebar-footer"]')
      const positions = () => [header.getBoundingClientRect().top, footer.getBoundingClientRect().top]
      const fixed = positions()
      const wheel = (deltaY, cancelable = true, extra = {}) => {
        const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable, ...extra })
        list.dispatchEvent(event)
        return { outer: outer.scrollTop, list: list.scrollTop, prevented: event.defaultPrevented }
      }
      const max = outer.scrollHeight - outer.clientHeight
      const first = wheel(12)
      const down = wheel(max + 100)
      const up = wheel(-25)
      const reset = wheel(-1000)
      const ignored = wheel(30, true, { ctrlKey: true })
      outer.scrollTop = max; list.scrollTop = 5
      const momentum = wheel(-20, false)
      outer.scrollTop = 0; list.scrollTop = 0
      return { max, first, down, up, reset, ignored, momentum, stable: JSON.stringify(fixed) === JSON.stringify(positions()) }
    })
    assert.ok(scrollContract.max >= 32, "global navigation can scroll out before the browser")
    assert.deepEqual(scrollContract.first, { outer: 12, list: 0, prevented: true })
    assert.equal(scrollContract.down.outer, scrollContract.max)
    assert.ok(scrollContract.down.list > 0)
    assert.equal(scrollContract.up.outer, scrollContract.max)
    assert.equal(scrollContract.up.list, scrollContract.down.list - 25)
    assert.deepEqual(scrollContract.reset, { outer: 0, list: 0, prevented: true })
    assert.deepEqual(scrollContract.ignored, { outer: 0, list: 0, prevented: false })
    assert.equal(scrollContract.momentum.outer, scrollContract.max - 15, "non-cancelable native momentum hands off only its residual")
    assert.equal(scrollContract.stable, true, "brand/new-session/footer stay fixed during browser scrolling")
    await page.locator('[data-slot="sidebar-browser-scroll"]').focus()
    await page.keyboard.press("End")
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar-browser-scroll"]').scrollTop > 0)
    await page.keyboard.press("Home")
    await page.waitForFunction(() => document.querySelector('[data-slot="sidebar-browser-scroll"]').scrollTop === 0)
    await page.evaluate(() => {
      document.activeElement?.blur()
      document.querySelector('[data-slot="sidebar-navigation-scroll"]').scrollTop = 0
    })
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), dark, "requested theme actually applied")
    await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-home.png`) })
    assert.equal(await page.locator("textarea").count(), 1, "single composer despite obsolete right-sidebar preference=false")
    await composer.fill("KEEP_CONVERSATION_DRAFT")
    const composerIdentity = await composer.elementHandle()
    const before = apiRequests(fixture.requests).length
    for (let i = 0; i < 2; i++) await page.locator('[data-slot="sidebar-trigger"]:visible').click()
    await page.waitForTimeout(250)
    assert.deepEqual(apiRequests(fixture.requests).slice(before), [], "navigation animation does not reload business data")
    await page.setViewportSize({ width: 900, height: 900 })
    await nav.waitFor({ state: "hidden" })
    await page.locator('[data-slot="sidebar-trigger"]:visible').click()
    await nav.waitFor()
    assert.equal(apiRequests(fixture.requests).filter(item => item.path.endsWith("/directory")).length, 0, "chat navigation must not load workspace file trees")
    await page.locator(`[data-slot="workspace-navigation"] a[href="/workspace/${workspace}/objects"]`).click()
    await resource.getByRole("button", { name: "File 99.md", exact: true }).first().click()
    await resource.waitFor({ state: "visible" })
    await page.waitForLoadState("networkidle")
    await nav.waitFor({ state: "hidden" })
    assert.equal(await page.locator('[data-slot="sidebar-gap"]').evaluate(node => node.getBoundingClientRect().width), 56, "opening a new resource defaults medium navigation to rail")
    await page.setViewportSize({ width: 1440, height: 900 })
    await nav.waitFor()
    assert.equal(await page.locator('[data-slot="workspace-navigation"]').getByRole("button", { name: "File 99.md", exact: true }).count(), 0, "full file tree never appears in the left navigation")
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
    assert.equal(await resource.locator('[data-slot="workbench-resource-header"]').evaluate(node => node.getBoundingClientRect().top), await header.evaluate(node => node.getBoundingClientRect().top), "conversation and resource chrome share the top edge")
    assert.ok(await titleIdentity.evaluate(node => node.isConnected), "routing keeps the exact title trigger")
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
    await resource.getByRole("button", { name: zh ? "会话" : "Conversations", exact: true }).click()
    await composer.waitFor({ state: "visible" })
    await resource.getByRole("button", { name: zh ? "专注资源" : "Focus resource", exact: true }).click()
    await resource.getByRole("button", { name: zh ? "返回会话与资源" : "Show conversation and resource", exact: true }).click()
    await resource.getByRole("button", { name: zh ? "隐藏资源" : "Hide resource", exact: true }).click()
    assert.equal(await resource.isVisible(), false)
    await page.getByRole("button", { name: zh ? "工作区" : "Workspace", exact: true }).click()
    assert.ok(await editorIdentity.evaluate(node => node.isConnected && node.textContent.includes("UNSAVED_WORKSPACE_DRAFT")), "hide/focus preserves mounted editor and unsaved file draft")
    for (const width of [1280, 1024, 1023, 900, 768, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(250)
      if (width < 1024) {
        if (!await composer.isVisible()) await page.getByRole("button", { name: zh ? "会话" : "Conversations", exact: true }).click()
        await composer.waitFor({ state: "visible" })
        await page.locator('[data-slot="sidebar-trigger"]:visible').click()
        await nav.waitFor()
        await page.locator('[data-slot="conversation-navigation-actions"]').getByRole("button").waitFor()
        if (width < 768) {
          await page.locator('[data-side="left"][data-compact="true"][role="dialog"]').waitFor()
          await page.keyboard.press("Escape")
          await page.locator('[data-side="left"][data-compact="true"]').waitFor({ state: "hidden" })
        } else {
          assert.equal(await page.locator('[data-side="left"][data-compact="true"]').count(), 0, "medium navigation is docked, not a modal drawer")
          assert.ok(await nav.evaluate(node => node.getBoundingClientRect().width >= 264), "resource route allows explicit medium expansion")
          await page.locator('[data-slot="sidebar-trigger"]:visible').click()
          await nav.waitFor({ state: "hidden" })
        }
        assert.ok(await editorIdentity.evaluate(node => node.isConnected && node.textContent.includes("UNSAVED_WORKSPACE_DRAFT")), "responsive navigation retains exact dirty resource editor")
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${language} ${width}: no page overflow`)
      assert.equal(await composer.inputValue(), "KEEP_CONVERSATION_DRAFT")
      assert.ok(await composerIdentity.evaluate(node => node.isConnected), "viewport keeps runtime mounted")
      if (width === 320 || width === 1440) await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-${width}.png`) })
    }
    if (await page.locator('[data-slot="sidebar"][data-side="left"]').getAttribute("data-state") === "collapsed") await page.locator('[data-slot="sidebar-trigger"]:visible').click()
    const navigation = nav
    await navigation.getByRole("button", { name: zh ? "搜索历史对话…" : "Search conversations…", exact: true }).click()
    const search = navigation.getByRole("textbox")
    await search.fill("alpha")
    assert.equal(await navigation.getByRole("button", { name: "Beta task", exact: true }).count(), 0)
    await search.fill("")
    await navigation.getByRole("button", { name: longTitle, exact: true }).click()
    await page.waitForLoadState("networkidle")
    assert.equal(await navigation.getByRole("button", { name: longTitle, exact: true }).getAttribute("aria-current"), "true")
    assert.equal(await titleMenu.getAttribute("title"), longTitle)
    const newChatLabel = await page.locator('[data-slot="conversation-navigation-actions"] button').getAttribute("aria-label")
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await header.waitFor({ state: "visible" })
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1)
      // Viewport events update the external layout store asynchronously. Header
      // visibility alone also matches the previous desktop column geometry.
      await page.waitForFunction(node => {
        const bounds = node.getBoundingClientRect(), text = node.querySelector("span")
        return bounds.width > 24 && bounds.right <= innerWidth && text.scrollWidth > text.clientWidth
      }, titleIdentity).catch(async error => {
        const geometry = await titleMenu.evaluate(node => {
          const bounds = node.getBoundingClientRect(), text = node.querySelector("span")
          return { viewport: innerWidth, width: bounds.width, right: bounds.right, text: text.clientWidth, content: text.scrollWidth }
        })
        throw new Error(`Long title/actions geometry did not converge: ${JSON.stringify(geometry)}`, { cause: error })
      })
      assert.equal(await header.getByRole("button", { name: newChatLabel, exact: true }).isVisible(), true)
      await page.screenshot({ path: join(output, `${language}-${dark ? "dark" : "light"}-header-${width}.png`) })
    }
    await navigation.getByRole("button", { name: "Beta task", exact: true }).click()
    await page.waitForLoadState("networkidle")
    assert.equal(await navigation.getByRole("button", { name: "Beta task", exact: true }).getAttribute("aria-current"), "true")
    await page.locator('[data-slot="conversation-navigation-actions"]').getByRole("button").click()
    assert.equal(await chat.locator("textarea").count(), 1, "selection/new draft still use one composer")
    assert.equal(await editorIdentity.evaluate(el => el.isConnected && el.textContent.includes("UNSAVED_WORKSPACE_DRAFT")), true)
    assert.equal(apiRequests(fixture.requests).filter(item => item.method !== "GET").length, 0, "selection/new draft never stop, send, or create a persisted conversation")
    assert.deepEqual(fixture.errors, [])
    assert.equal(await page.evaluate(() => window.__shellNotifications.length), 0, "layout evidence has no fixture-induced error notifications covering the header")
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
  }
  console.log(`Conversation-first workbench ${production ? "production" : "development"}: central singleton, resource route/focus/drafts, sidebar, responsive EN/ZH light/dark passed; screenshots: ${output}`)
} finally {
  await browser?.close()
  if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  else await server.close()
}
