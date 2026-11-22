import assert from "node:assert/strict"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { installShellFixture } from "./shell-performance-fixture.mjs"

// Real geometry/interaction contract, not a copy of the column solver.
const production = process.argv.includes("--production")
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const output = join(tmpdir(), `ineffable-workbench-structure-${production ? "production" : "development"}`)
mkdirSync(output, { recursive: true })
const server = production ? await preview({ preview: { host: "127.0.0.1", port: 0 } }) : await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
let browser
const failures = [], samples = []
function check(condition, description) { if (!condition) failures.push(description) }
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
  })
}
async function sample(page, name) {
  await settle(page)
  const geometry = await page.evaluate(() => {
    const chat = document.querySelector('[data-slot="chat-workbench"]')
    const main = document.querySelector('[data-slot="sidebar-inset"]')
    const resource = document.querySelector('[data-slot="resource-workbench"]')
    return { viewport: innerWidth, left: main.getBoundingClientRect().left, chat: chat.getBoundingClientRect().width, resource: resource.getBoundingClientRect().width, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }
  })
  const reading = await page.locator('[data-slot="chat-workbench"]').evaluate(root => {
    const viewport = root.querySelector('div[data-chat-scroll-region]')
    const message = root.querySelector('[data-chat-reading-message]')
    const card = root.querySelector('[data-slot="input-group"]')
    if (!viewport || !message || !card) return null
    const m = message.getBoundingClientRect(), c = card.getBoundingClientRect()
    return { available: viewport.clientWidth, message: m.width, composer: c.width, centerDifference: Math.abs(m.x + m.width / 2 - c.x - c.width / 2), base: Math.max(680, Math.min(880, root.getBoundingClientRect().width * .64)) }
  })
  if (geometry.chat > 0) check(Boolean(reading), `${name}: one shared scrollport exists even for the empty conversation`)
  if (geometry.chat > 0 && reading) {
    check(Math.abs(reading.message - Math.min(reading.base, reading.available - 64)) <= 1, `${name}: message follows scrollbar-adjusted reading axis`)
    check(Math.abs(reading.composer - reading.message - 32) <= 1 && reading.centerDifference <= 1, `${name}: composer is exactly 32px wider on the same center`)
  }
  samples.push({ name, ...geometry, reading })
  return geometry
}
try {
  if (!production) await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
  const fixture = await installShellFixture(page, false, { leftOpen: null })
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.goto(`${url}/chat`)
  const composer = page.locator('[data-slot="chat-workbench"] textarea').first()
  await composer.waitFor()
  await page.waitForLoadState("networkidle")
  await composer.fill("STRUCTURE_DRAFT")
  const composerHandle = await composer.elementHandle()
  let geometry = await sample(page, "desktop-expanded")
  check(Math.abs(geometry.left - 280) <= 2, `expanded sidebar must be 280px, actual ${geometry.left}`)
  const separator = page.getByRole("separator", { name: "Resize navigation", exact: true })
  const separatorBox = await separator.boundingBox()
  check(Math.abs(separatorBox.x + separatorBox.width / 2 - 280) <= 1, "navigation separator sits on the real boundary")
  await separator.focus()
  for (const [key, width] of [["Shift+ArrowRight", 312], ["Home", 264], ["End", 420], ["Home", 264]]) {
    await page.keyboard.press(key)
    check((await sample(page, `resize-${key}`)).left === width, `${key} changes actual navigation width to ${width}`)
    check(Number(await separator.getAttribute("aria-valuenow")) === width, "separator exposes its current width")
  }
  await page.mouse.move(264, 450)
  await page.mouse.down()
  await page.mouse.move(328, 450, { steps: 4 })
  check((await sample(page, "drag-preview")).left === 328, "pointer drag previews actual geometry")
  await page.mouse.up()
  check((await sample(page, "drag-committed")).left === 328, "pointer release commits width")
  await composer.focus()
  await page.keyboard.press("Control+b")
  check((await sample(page, "editing-shortcut")).left === 328, "editing context suppresses navigation shortcut")
  await page.locator('[data-slot="sidebar-trigger"]').first().focus()
  await page.keyboard.press("Control+b")
  check((await sample(page, "navigation-shortcut-collapse")).left === 56, "navigation shortcut works outside editing contexts")
  await page.keyboard.press("Control+b")
  check((await sample(page, "navigation-shortcut-expand")).left === 328, "navigation shortcut restores preferred width")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  geometry = await sample(page, "desktop-rail")
  const railCenters = await page.locator('[data-slot="sidebar-container"][data-side="left"] a[aria-label="Ineffable"], [data-slot="sidebar-container"][data-side="left"] button[aria-label="New conversation"]').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return r.x + r.width / 2 }))
  check(railCenters.length === 2 && railCenters.every(center => Math.abs(center - 27.5) < 1), "rail brand and new-chat actions share the 56px rail center")
  check(Math.abs(geometry.left - 56) <= 2, `collapsed rail must be 56px, actual ${geometry.left}`)
  for (const width of [1024, 1023, 768, 767, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    geometry = await sample(page, `boundary-${width}`)
    check(Math.abs(geometry.left - (width >= 768 ? 56 : 0)) <= 2, `${width}px sidebar presentation must ${width >= 768 ? "reserve a 56px rail" : "use a closed drawer"}, actual ${geometry.left}`)
    check(!geometry.horizontalOverflow, `${width}px must not overflow horizontally`)
    check(await composer.evaluate((node, original) => node === original, composerHandle), `${width}px keeps exact composer DOM`)
    check(await composer.inputValue() === "STRUCTURE_DRAFT", `${width}px keeps draft`)
  }
  await page.screenshot({ path: join(output, "desktop-rail.png") })
  await page.setViewportSize({ width: 767, height: 900 })
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  const drawer = page.locator('[data-slot="sidebar"][data-compact="true"]')
  await drawer.waitFor()
  check(await drawer.getAttribute("role") === "dialog", "767px navigation is a modal dialog")
  await page.keyboard.press("Escape")
  await drawer.waitFor({ state: "hidden" })
  check(await page.locator('[data-slot="sidebar-trigger"]').first().evaluate(node => document.activeElement === node), "closing drawer restores trigger focus")
  await page.setViewportSize({ width: 900, height: 900 })
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  check((await sample(page, "medium-manual-expand")).left === 328, "medium rail can be expanded manually with the session width")
  await page.setViewportSize({ width: 1440, height: 900 })
  check((await sample(page, "desktop-preference-preserved")).left === 56, "medium expansion does not overwrite desktop preference")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  check((await sample(page, "width-restored")).left === 328, "desktop restores preferred width after viewport changes")
  await page.reload()
  await composer.waitFor()
  check((await sample(page, "reload-width-reset")).left === 280, "refresh resets width, retaining account open preference")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  await page.reload()
  await composer.waitFor()
  check((await sample(page, "reload-open-persisted")).left === 56, "account-scoped collapsed preference survives refresh")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  await page.getByRole("link", { name: "Workspace", exact: true }).click()
  await page.waitForLoadState("networkidle")
  geometry = await sample(page, "contextual-resource")
  check(geometry.left === 280 && geometry.resource === 648 && geometry.chat === 512, "contextual resources default to 45% viewport with 400px center reserve")
  const resourceSeparator = page.getByRole("separator", { name: "Resize resource", exact: true })
  const resourceBox = await resourceSeparator.boundingBox()
  await page.mouse.move(resourceBox.x + 2, 450)
  await page.mouse.down()
  await page.mouse.move(resourceBox.x + 2 - 102, 450, { steps: 4 })
  await page.mouse.up()
  check((await sample(page, "resource-drag")).resource === 750, "resource pointer drag commits actual width")
  await separator.focus()
  await page.keyboard.press("End")
  check((await sample(page, "resource-yields")).resource === 620, "resource yields width before center shrinks below 400")
  await page.keyboard.press("Home")
  check((await sample(page, "resource-restores")).resource === 750, "viewport clamp never replaces the user's resource preference")
  await resourceSeparator.focus()
  await page.keyboard.press("Home")
  check((await sample(page, "resource-keyboard-min")).resource === 300, "resource separator supports accessible Home keyboard resize")
  await page.getByRole("button", { name: "Hide resource", exact: true }).click()
  check((await sample(page, "resource-hidden")).resource === 0, "hiding resource returns its space to chat")
  // The shell fixture's minimal model is sufficient for chat, not model-card metadata.
  await page.route("**/gateway/v1/models/profiles*", route => route.fulfill({ json: { profiles: [] } }))
  await page.goto(`${url}/models`)
  await page.waitForLoadState("networkidle")
  await page.locator('[data-slot="resource-workbench"]').waitFor()
  await page.locator('[data-slot="sidebar-inset"]').waitFor()
  geometry = await sample(page, "global-models")
  check(geometry.chat === 0 && geometry.resource >= 1000, "global page owns central surface, not a narrow contextual panel")
  await page.getByRole("button", { name: "Conversations", exact: true }).first().click()
  check(new URL(page.url()).pathname === "/chat", "conversation entry on a global page returns to /chat, rather than splitting a management page")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  const switchSession = async (id, token) => {
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/auth/me") && response.request().headers().authorization === `Bearer ${token}`),
      page.evaluate(({ id, token }) => {
        localStorage.setItem("ineffable.auth.session_id", id)
        localStorage.setItem("ineffable.auth.access_token", token)
        window.dispatchEvent(new StorageEvent("storage", { key: "ineffable.auth.access_token" }))
      }, { id, token }),
    ])
    await composer.waitFor()
    await page.waitForLoadState("networkidle")
  }
  await switchSession("fixture-session-b", "fixture-token-b")
  check((await sample(page, "account-b-default")).left === 280, "new account does not inherit account A collapsed preference")
  await separator.focus()
  await page.keyboard.press("End")
  check((await sample(page, "account-b-width")).left === 420, "second account can resize independently")
  await page.setViewportSize({ width: 768, height: 900 })
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  geometry = await sample(page, "medium-manual-center-min")
  check(geometry.left === 368 && geometry.chat === 400, "medium manual expansion yields before squeezing the center below 400px")
  await page.setViewportSize({ width: 1440, height: 900 })
  check((await sample(page, "account-b-width-restored")).left === 420, "temporary center clamp preserves the preferred navigation width")
  await switchSession("fixture-session", "fixture-token")
  check((await sample(page, "account-a-restored")).left === 56, "returning account restores only its own collapsed preference")
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  check((await sample(page, "account-a-width-reset")).left === 280, "changing authenticated session discards previous pixel preferences")
  check(fixture.errors.length === 0, `browser errors: ${fixture.errors.join("; ")}`)
  check(fixture.unexpected.length === 0, `unexpected APIs: ${fixture.unexpected.join("; ")}`)
} finally {
  console.log(JSON.stringify({ output, samples, failures }, null, 2))
  writeFileSync(join(output, "metrics.json"), JSON.stringify({ samples, failures }, null, 2))
  await browser?.close()
  await server.close()
}
assert.deepEqual(failures, [], "workbench structure contracts")
