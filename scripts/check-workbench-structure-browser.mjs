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
  samples.push({ name, ...geometry })
  return geometry
}
try {
  if (!production) await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
  const fixture = await installShellFixture(page, false)
  await page.addInitScript(() => localStorage.setItem("theme", "light"))
  await page.goto(`${url}/chat`)
  const composer = page.locator('[data-slot="chat-workbench"] textarea').first()
  await composer.waitFor()
  await page.waitForLoadState("networkidle")
  await composer.fill("STRUCTURE_DRAFT")
  const composerHandle = await composer.elementHandle()
  let geometry = await sample(page, "desktop-expanded")
  check(Math.abs(geometry.left - 280) <= 2, `expanded sidebar must be 280px, actual ${geometry.left}`)
  await page.locator('[data-slot="sidebar-trigger"]').first().click()
  geometry = await sample(page, "desktop-rail")
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
  await page.setViewportSize({ width: 1440, height: 900 })
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
  check(fixture.errors.length === 0, `browser errors: ${fixture.errors.join("; ")}`)
  check(fixture.unexpected.length === 0, `unexpected APIs: ${fixture.unexpected.join("; ")}`)
} finally {
  console.log(JSON.stringify({ output, samples, failures }, null, 2))
  writeFileSync(join(output, "metrics.json"), JSON.stringify({ samples, failures }, null, 2))
  await browser?.close()
  await server.close()
}
assert.deepEqual(failures, [], "workbench structure contracts")
