import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { resources } from "../src/lib/i18n/resources.ts"
import { installShellFixture, workspace, apiRequests } from "./shell-performance-fixture.mjs"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const production = process.argv.includes("--production")
const output = join(tmpdir(), `ineffable-settings-overlay${production ? "-production" : ""}`)
mkdirSync(output, { recursive: true })
const server = production
  ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
  : await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
try {
  if (!production) await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  for (const language of ["en-US", "zh-CN"]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
    const fixture = await installShellFixture(page, false)
    const admin = language === "zh-CN" && theme === "dark"
    if (admin) await page.route("**/gateway/v1/auth/me", route => route.fulfill({ json: {
      user: { id: "user", email: "fixture@example.test", display_name: "Fixture owner", role: "admin", status: "active" },
      workspaces: [{ id: workspace, name: "Personal", workspace_type: "personal" }], current_workspace_id: workspace,
    } }))
    await page.addInitScript(({ language, theme }) => {
      localStorage.setItem("ineffable.ui.language", language)
      localStorage.setItem("theme", theme)
    }, { language, theme })
    const object = { id: `${workspace}-99`, workspace_id: workspace, kind: "file", name: "File 99.md", path: "File 99.md", mime_type: "text/markdown", current_version_id: "version" }
    await page.route("**/gateway/v1/**/versions", route => route.fulfill({ json: { object, versions: [{ id: "version", version_no: 1 }] } }))
    await page.route("**/gateway/v1/**/content*", route => route.fulfill({ json: { object, version: { id: "version", version_no: 1 }, content: "ORIGINAL" } }))
    await page.goto(`${origin}/chat`)
    await page.locator(`[data-slot="workspace-navigation"] a[href="/workspace/${workspace}/objects"]`).click()
    await page.locator('[data-slot="resource-workbench"]').getByRole("button", { name: "File 99.md", exact: true }).first().click()
    const labels = Object.fromEntries(Object.entries({ settings: "interaction.settings", general: "interaction.general", edit: "workspace.actions.edit", cancel: "common.cancel", close: "common.close", unsaved: "interaction.unsavedTitle", discard: "workspace.actions.discard", appearance: "theme.appearance", dark: "theme.dark", light: "theme.light", system: "theme.system" }).map(([key, path]) => [key, path.split(".").reduce((value, segment) => value[segment], resources[language].translation)]))
    const resource = page.locator('[data-slot="resource-workbench"]')
    const composer = page.locator('[data-slot="chat-workbench"] textarea').first()
    await composer.fill("KEEP_SETTINGS_COMPOSER")
    const composerIdentity = await composer.elementHandle()
    await resource.getByRole("button", { name: labels.edit, exact: true }).click()
    const editor = resource.locator('.cm-content[contenteditable="true"]').first()
    await editor.fill("KEEP_SETTINGS_DIRTY_EDITOR")
    const editorIdentity = await editor.elementHandle()
    const path = page.url(), historyLength = await page.evaluate(() => history.length)
    const trigger = page.locator('[data-slot="sidebar-footer"]').getByRole("button", { name: labels.settings, exact: true })
    await trigger.click()
    const overlay = page.locator('[data-slot="settings-overlay"]')
    await overlay.waitFor()
    assert.equal(page.url(), path)
    assert.equal(await page.evaluate(() => history.length), historyLength, "ordinary settings is not navigation")
    assert.equal(await page.getByRole("dialog", { name: labels.unsaved, exact: true }).count(), 0, "opening settings never triggers dirty navigation")
    assert.equal(await overlay.locator('a[href^="/system/"]').count(), admin ? 4 : 0, "admin navigation follows the existing authenticated role")
    for (const to of ["/account", "/models", "/channels", "/agent-nodes"]) assert.equal(await overlay.locator(`a[href="${to}"]`).count(), 1)
    const appearance = overlay.getByRole("combobox", { name: labels.appearance, exact: true })
    await appearance.click()
    await page.keyboard.press("Escape")
    assert.ok(await overlay.isVisible(), "Escape dismisses the inner Select before settings")
    assert.equal(await page.getByRole("listbox").count(), 0)
    for (const value of ["dark", "light", "system"]) {
      await appearance.click()
      await page.getByRole("option", { name: labels[value], exact: true }).click()
      assert.equal(await page.evaluate(() => localStorage.getItem("theme")), value)
      if (value === "system") for (const colorScheme of ["dark", "light"]) {
        await page.emulateMedia({ colorScheme })
        await page.waitForFunction(scheme => document.documentElement.classList.contains(scheme), colorScheme)
      }
    }
    const languageSelect = overlay.getByRole("combobox").nth(1)
    await languageSelect.click()
    await page.getByRole("option", { name: language === "en-US" ? "中文" : "English", exact: true }).click()
    await overlay.getByRole("heading", { name: language === "en-US" ? "通用" : "General", exact: true }).waitFor()
    await languageSelect.click()
    await page.getByRole("option", { name: language === "en-US" ? "English" : "中文", exact: true }).click()
    await overlay.getByRole("heading", { name: labels.general, exact: true }).waitFor()
    await appearance.click()
    await page.getByRole("option", { name: labels[theme], exact: true }).click()
    await page.waitForFunction(theme => document.documentElement.classList.contains(theme), theme)
    // Resize the open modal, never move/remount its controls or underlying owners.
    const modalIdentity = await overlay.elementHandle()
    for (const width of [1440, 1024, 768, 767, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const geometry = await overlay.evaluate(node => {
        const r = node.getBoundingClientRect(), css = getComputedStyle(node)
        return { x: r.x, y: r.y, width: r.width, height: r.height, columns: css.gridTemplateColumns, radius: css.borderRadius, overflow: document.documentElement.scrollWidth > innerWidth + 1, focusInside: node.contains(document.activeElement) }
      })
      assert.equal(geometry.overflow, false)
      assert.equal(Math.round(geometry.width), width < 768 ? width : Math.min(800, width - 48))
      assert.equal(Math.round(geometry.height), width < 768 ? 900 : 800)
      assert.equal(geometry.radius, width < 768 ? "0px" : "28px")
      if (width >= 768) { assert.ok(geometry.x >= 24); assert.ok(geometry.y >= 24); assert.ok(geometry.columns.startsWith("188px")) }
      assert.equal(geometry.focusInside, true)
      assert.ok(await modalIdentity.evaluate(node => node.isConnected))
      assert.ok(await editorIdentity.evaluate(node => node.isConnected && node.textContent.includes("KEEP_SETTINGS_DIRTY_EDITOR")))
      assert.ok(await composerIdentity.evaluate(node => node.isConnected && node.value === "KEEP_SETTINGS_COMPOSER"))
      if ([1440, 320].includes(width)) await page.screenshot({ path: join(output, `${language}-${theme}-${width}.png`) })
      await page.keyboard.press("Tab")
      assert.ok(await overlay.evaluate(node => node.contains(document.activeElement)), "modal traps keyboard focus")
    }
    await page.setViewportSize({ width: 1440, height: 600 })
    const short = await overlay.boundingBox()
    assert.equal(Math.round(short.height), 552, "short desktop retains 24px margins")
    assert.equal(Math.round(short.y), 24)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.keyboard.press("Escape")
    await overlay.waitFor({ state: "hidden" })
    await page.waitForFunction(node => node === document.activeElement, await trigger.elementHandle())
    assert.equal(page.url(), path)
    await trigger.click()
    await overlay.waitFor()
    // Use an actionable backdrop click, not a raw input before Radix's new
    // dismissable-layer effect has installed its document pointer listener.
    await page.locator(".settings-overlay-mask").click({ position: { x: 4, y: 4 } })
    await overlay.waitFor({ state: "hidden" })
    await page.waitForFunction(node => node === document.activeElement, await trigger.elementHandle())
    assert.equal(page.url(), path)
    await trigger.click()
    await overlay.waitFor()
    await overlay.locator('a[href="/channels"]').click()
    const guard = page.getByRole("dialog", { name: labels.unsaved, exact: true })
    await guard.waitFor()
    await guard.getByRole("button", { name: labels.cancel, exact: true }).click()
    await guard.waitFor({ state: "hidden" })
    await overlay.waitFor()
    assert.equal(page.url(), path)
    assert.ok(await editorIdentity.evaluate(node => node.isConnected && node.textContent.includes("KEEP_SETTINGS_DIRTY_EDITOR")))
    // The dirty guard must paint above, not underneath, the already-open modal.
    await overlay.locator('a[href="/channels"]').click()
    await guard.waitFor()
    await guard.getByRole("button", { name: labels.discard, exact: true }).click()
    await page.waitForURL(`${origin}/channels`)
    await overlay.waitFor({ state: "hidden" })
    await page.getByRole("button", { name: language === "zh-CN" ? "会话" : "Conversations", exact: true }).click()
    await page.waitForURL(`${origin}/chat`)
    assert.ok(await composerIdentity.evaluate(node => node.isConnected && node.value === "KEEP_SETTINGS_COMPOSER"), "global page return keeps the exact composer")
    // A mobile drawer is dismissed before mounting settings; close goes to Shell.
    await page.setViewportSize({ width: 390, height: 900 })
    await page.locator('[data-slot="sidebar-trigger"]').click()
    await page.locator('[data-compact="true"]').getByRole("button", { name: labels.settings, exact: true }).click()
    await overlay.waitFor()
    await page.locator('[data-compact="true"]').waitFor({ state: "hidden" })
    await page.keyboard.press("Escape")
    await overlay.waitFor({ state: "hidden" })
    await page.waitForFunction(() => document.activeElement?.matches('[data-slot="sidebar-trigger"]'))
    // Deep link refresh and Back/Forward use exactly the same modal and fallback.
    await page.goto(`${origin}/settings`)
    await overlay.waitFor()
    await page.reload()
    await overlay.waitFor()
    assert.equal(await page.locator('[data-slot="settings-overlay"]').count(), 1)
    await overlay.getByRole("button", { name: labels.close, exact: true }).click()
    await page.waitForURL(`${origin}/chat`)
    await page.waitForFunction(() => document.activeElement?.matches('[data-slot="sidebar-trigger"]'))
    await page.goto(`${origin}/settings`)
    await overlay.waitFor()
    await page.goBack()
    await page.waitForURL(`${origin}/chat`)
    await overlay.waitFor({ state: "hidden" })
    await page.goForward()
    await overlay.waitFor()
    assert.equal(apiRequests(fixture.requests).filter(request => request.method !== "GET").length, 0, "settings/navigation never write, send or stop")
    assert.deepEqual(fixture.errors, [])
    assert.deepEqual(fixture.unexpected, [])
    await page.close()
  }
  console.log(`Settings overlay: EN/ZH light/dark, 800/188/28 geometry, fullscreen, exact dirty editor/composer, unchanged history, guarded business navigation, focus, drawer, General preferences and deep links passed; ${output}`)
} finally {
  await browser?.close()
  if (production) await new Promise(resolve => server.httpServer.close(resolve))
  else await server.close()
}
