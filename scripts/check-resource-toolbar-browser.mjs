import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { installShellFixture, workspace, apiRequests } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--disable-features=OverlayScrollbar"] })
  for (const language of ["en-US", "zh-CN"]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
    const fixture = await installShellFixture(page, false)
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem("ineffable.ui.language", language)
      localStorage.setItem("theme", theme)
    }, { language, theme })
    const object = { id: `${workspace}-99`, workspace_id: workspace, kind: "file", name: "File 99.md", path: "notes/File 99.md", mime_type: "text/markdown", current_version_id: "version" }
    await page.route("**/gateway/v1/**/versions", route => route.fulfill({ json: { object, versions: [{ id: "version", version_no: 1 }] } }))
    await page.route("**/gateway/v1/**/content*", route => route.fulfill({ json: { object, version: { id: "version", version_no: 1 }, content: "ORIGINAL" } }))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/chat`)
    await page.locator(`[data-slot="workspace-navigation"] a[href="/workspace/${workspace}/objects"]`).click()
    await page.locator('[data-slot="resource-workbench"]').getByRole("button", { name: "File 99.md", exact: true }).first().click()
    const resource = page.locator('[data-slot="resource-workbench"]')
    const labels = await page.evaluate(async () => {
      const { i18n } = await import("/src/lib/i18n/i18n.ts")
      return Object.fromEntries(["edit", "discard", "save"].map(key => [key, i18n.t(`workspace.actions.${key}`)]).concat([["resize", i18n.t("workbench.resizeResource")]]))
    })
    await resource.getByRole("button", { name: labels.edit, exact: true }).click()
    const editor = resource.locator('.cm-content[contenteditable="true"]').first()
    await editor.fill("UNSAVED_RESOURCE_TOOLBAR")
    const identity = await editor.elementHandle()
    await page.getByRole("separator", { name: labels.resize, exact: true }).focus()
    await page.keyboard.press("Home")
    assert.equal(Math.round((await resource.boundingBox()).width), 300)
    for (const width of [1440, 1024, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // The editor/separator was the last interacted surface. Crossing a
      // breakpoint must retain that resource, not require a hidden chat-header
      // Workspace button (nor silently switch the active pane to chat).
      await resource.waitFor({ state: "visible" })
      for (const name of [labels.save, labels.discard]) {
        const button = resource.getByRole("button", { name, exact: true })
        assert.ok(await button.isEnabled(), name)
        assert.equal(await button.locator("svg").count(), 1, "icon-only actions retain a visible icon")
        assert.ok(await button.evaluate(node => {
          const r = node.getBoundingClientRect(), panel = node.closest('[data-slot="resource-workbench"]').getBoundingClientRect()
          return r.width > 0 && r.left >= panel.left && r.right <= panel.right + 1
        }), `${width}: ${name} stays inside the actual resource column`)
      }
      assert.ok(await resource.locator("[data-workspace-resource-actions] > span").isVisible(), "save/dirty status stays visible even in the 300px pane")
      assert.ok(await identity.evaluate(node => node.isConnected && node.textContent.includes("UNSAVED_RESOURCE_TOOLBAR")), "resize preserves exact editor DOM and draft")
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    }
    await resource.getByRole("button", { name: labels.discard, exact: true }).click()
    assert.equal(await resource.getByRole("button", { name: labels.save, exact: true }).count(), 0, "discard uses existing local dirty-state owner")
    assert.equal(apiRequests(fixture.requests).filter(request => request.method !== "GET").length, 0, "presentation/resize/discard never write or stop")
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
  }
  console.log("Resource toolbar: classic scrollbar, 300px pane, EN/ZH light/dark, visible save/discard/dirty state, stable editor and no implicit mutations passed")
} finally { await browser?.close(); await server.close() }
