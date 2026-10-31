import assert from "node:assert/strict"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { createServer, preview } from "vite"
import { installShellFixture, apiRequests } from "./shell-performance-fixture.mjs"

const production = process.argv.includes("--production")
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const server = production
  ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
  : await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } })
const modelNamePrefix = "AtlasWorkspaceReasoningModelWithLongUnbrokenNameForContainerLayout"
const modelProfiles = Array.from({ length: 2 }, (_, index) => ({
  id: `model-${index}`, display_name: `${modelNamePrefix}${index}`, supports_tool_calls: true,
  supports_reasoning: true, supports_json_schema: true, supports_vision: true,
  input_modalities: ["text", "image"], output_modalities: ["text"], usage_multiplier: 1,
  input_multiplier: 1, output_multiplier: 1, reasoning_multiplier: 1, cached_input_multiplier: 1,
  context_window_tokens: 128000, max_output_tokens: 16000, max_tokens_per_request: 128000,
}))
const mode = production ? "production" : "development"
const results = { mode, measurements: [], animation: [], modelMobile: [], painted: [] }
const paintDirectory = process.env.INEFFABLE_WORKBENCH_PAINT_OUTPUT || join(tmpdir(), `ineffable-workbench-paint-${mode}`)
mkdirSync(paintDirectory, { recursive: true })
let browser

// These dimension-neutral bars belong to the actual layout boxes. Their PNG
// pixel bounds measure what Chrome painted, after layout/ResizeObserver; rAF
// alone can observe a geometry that is corrected before the frame is painted.
const paintMarkers = `
[data-slot="sidebar-inset"]::after,
[data-side="right"][data-slot="sidebar-container"]::after,
[data-side="right"] [data-slot="sidebar-gap"]::after {
  content:""; position:absolute; left:0; right:0; bottom:0; height:3px;
  z-index:2147483647; pointer-events:none;
}
[data-slot="sidebar-inset"]::after { top:0; bottom:auto; background:rgb(255,0,255) }
[data-side="right"][data-slot="sidebar-container"]::after { top:4px; bottom:auto; background:rgb(0,255,255) }
[data-side="right"] [data-slot="sidebar-gap"] { z-index:2147483646 }
[data-side="right"] [data-slot="sidebar-gap"]::after { background:rgb(255,255,0) }
`

function paintedBoxes(base64) {
  const png = Buffer.from(base64, "base64"), chunks = []
  let width, height, channels, position = 8
  while (position < png.length) {
    const length = png.readUInt32BE(position), type = png.toString("ascii", position + 4, position + 8)
    const data = png.subarray(position + 8, position + 8 + length)
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      assert.equal(data[8], 8)
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      assert.ok(channels, "Chrome supplies RGB/RGBA painted PNGs")
      assert.equal(data[12], 0)
    }
    if (type === "IDAT") chunks.push(data)
    position += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels
  const boxes = {}, colors = { center: [255, 0, 255], chat: [0, 255, 255], reserved: [255, 255, 0] }
  let previous = Buffer.alloc(stride), offset = 0
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++], row = Buffer.from(raw.subarray(offset, offset + stride))
    offset += stride
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, b = previous[x], c = x >= channels ? previous[x - channels] : 0
      if (filter === 1) row[x] = (row[x] + a) & 255
      else if (filter === 2) row[x] = (row[x] + b) & 255
      else if (filter === 3) row[x] = (row[x] + Math.floor((a + b) / 2)) & 255
      else if (filter === 4) row[x] = (row[x] + paeth(a, b, c)) & 255
    }
    for (const [name, color] of Object.entries(colors)) {
      let first = -1, last = -1
      for (let x = 0; x < width; x++) {
        if (color.every((value, channel) => row[x * channels + channel] === value)) {
          if (first < 0) first = x
          last = x
        }
      }
      if (first >= 0 && last - first + 1 > (boxes[name]?.width ?? 0)) boxes[name] = { left: first, right: last + 1, width: last - first + 1 }
    }
    previous = row
  }
  return { boxes, width }
}

async function capturePaint(page, label, targetViewport) {
  const cdp = await page.context().newCDPSession(page), frames = [], failures = []
  let resolveFirstFrame
  const firstFrame = new Promise(resolve => { resolveFirstFrame = resolve })
  const capture = frame => {
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {})
    try {
      const { boxes, width } = paintedBoxes(frame.data)
      if (!boxes.center || !boxes.chat || !boxes.reserved) return
      // Chrome can downscale a screencast frame while the viewport resizes.
      // Its metadata gives the represented viewport in CSS pixels.
      const scale = frame.metadata.deviceWidth / width
      for (const box of Object.values(boxes)) {
        for (const key of ["left", "right", "width"]) box[key] *= scale
      }
      const path = join(paintDirectory, `${label}-${frames.length}.png`)
      writeFileSync(path, Buffer.from(frame.data, "base64"))
      frames.push({ ...boxes, viewport: frame.metadata.deviceWidth, path })
      resolveFirstFrame()
    } catch (error) { failures.push(error) }
  }
  cdp.on("Page.screencastFrame", capture)
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  if (targetViewport) {
    // Observe screencast readiness before triggering resize, so command/event
    // delivery cannot race the entire transition. Keep recording from here.
    let timer
    try {
      await Promise.race([firstFrame, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: screencast did not become ready`)), 5000)
      })])
    } finally { clearTimeout(timer) }
  }
  return async () => {
    await cdp.send("Page.stopScreencast")
    cdp.removeListener("Page.screencastFrame", capture)
    await cdp.detach()
    assert.deepEqual(failures, [])
    assert.ok(frames.length > 0, `${label}: capture actual painted layout frames`)
    assert.ok(!targetViewport || frames.some(frame => frame.viewport === targetViewport), `${label}: capture the target viewport during resize`)
    results.painted.push({ label, frames })
    // Save before assertions so a regression retains its failing painted frame.
    writeFileSync(join(paintDirectory, "measurements.json"), JSON.stringify(results.painted, null, 2))
  }
}

function assertPaintedLayouts() {
  for (const { label, frames } of results.painted) {
    for (const frame of frames) {
      assert.ok(frame.center.width >= 479, `${label}: painted middle meets 480px: ${JSON.stringify(frame)}`)
      assert.ok(frame.center.right <= frame.chat.left + 1, `${label}: painted chat never covers the middle: ${JSON.stringify(frame)}`)
      assert.ok(Math.abs(frame.chat.width - frame.reserved.width) <= 1, `${label}: painted chat agrees with its reservation: ${JSON.stringify(frame)}`)
    }
  }
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect()
    const main = rect('[data-slot="sidebar-inset"]')
    const chat = rect('[data-side="right"][data-slot="sidebar-container"]')
    const gap = rect('[data-side="right"] [data-slot="sidebar-gap"]')
    const metricPage = document.querySelector('main [data-slot="metric-page"]')
    const metricGrid = metricPage?.querySelector('[data-slot="metric-page-metrics"]')
    const modelGrid = document.querySelector('main [data-slot="model-profile-grid"]')
    const columns = element => element ? getComputedStyle(element).gridTemplateColumns.split(" ").length : 0
    return {
      viewport: innerWidth,
      available: document.getElementById("root").getBoundingClientRect().width,
      left: rect('[data-side="left"] [data-slot="sidebar-gap"]')?.width ?? 0,
      chat: chat?.width ?? 0,
      reserved: gap?.width ?? 0,
      center: main.width,
      overlap: chat ? Math.max(0, main.right - chat.left) : 0,
      preference: Number(localStorage.getItem("ineffable.ui.right-sidebar.width")),
      modelColumns: columns(modelGrid),
      metricColumns: columns(metricGrid),
      metricCards: [...(metricGrid?.children ?? [])].map(card => ({ width: card.clientWidth, scrollWidth: card.scrollWidth })),
      modelCards: [...(modelGrid?.children ?? [])].map(card => {
        const header = card.querySelector('[data-slot="card-header"]')
        const title = header.querySelector('[data-slot="card-title"]')
        const badge = header.querySelector('[data-slot="badge"]')
        const box = card.getBoundingClientRect(), state = badge?.getBoundingClientRect()
        return {
          width: card.clientWidth, scrollWidth: card.scrollWidth,
          headerWidth: header.clientWidth, headerScrollWidth: header.scrollWidth,
          titleVisible: Boolean(title.getBoundingClientRect().width && title.getBoundingClientRect().height),
          fullTitle: title.getAttribute("title") === title.textContent,
          stateVisible: Boolean(state?.width && state.height && getComputedStyle(badge).visibility === "visible"),
          stateInside: Boolean(state && state.left >= box.left && state.right <= box.right + 1),
        }
      }),
    }
  })
}

async function settled(page) {
  const stable = await page.evaluate(async () => {
    const start = performance.now()
    let previous = "", stableSince = start
    while (performance.now() - start < 5000) {
      const signature = [...document.querySelectorAll('[data-slot="sidebar-inset"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"]')]
        .map(node => { const box = node.getBoundingClientRect(); return [box.x, box.width].map(value => value.toFixed(2)).join(":") }).join("|")
      const animating = document.getAnimations().some(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity)
      if (signature !== previous || animating) stableSince = performance.now()
      else if (performance.now() - stableSince >= 120) return true
      previous = signature
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    return false
  })
  assert.ok(stable, "layout reaches a stable geometry after its CSS transitions")
}

function assertModelBounds(sample, label) {
  assert.equal(sample.modelCards.length, 2, `${label}: both long-name models remain rendered`)
  assert.ok(sample.modelCards.every(card => card.scrollWidth <= card.width + 1 && card.headerScrollWidth <= card.headerWidth + 1), `${label}: long model names fit the card and its header`)
  assert.ok(sample.modelCards.every(card => card.stateVisible && card.stateInside), `${label}: availability stays visible within each long-name card`)
  assert.ok(sample.metricCards.every(card => card.scrollWidth <= card.width + 1), `${label}: metric values and descriptions fit their container`)
  assert.ok(sample.modelCards.every(card => card.titleVisible && card.fullTitle), `${label}: model names stay visible and retain the complete title`)
}

async function assertDock(page, label, expected = {}) {
  await settled(page)
  const sample = { label, ...await measure(page) }
  results.measurements.push(sample)
  assert.ok(sample.center >= 479, `${label}: actual middle meets the 480px budget: ${JSON.stringify(sample)}`)
  assert.ok(sample.overlap < 1, `${label}: middle is never covered: ${JSON.stringify(sample)}`)
  assert.ok(Math.abs(sample.chat - sample.reserved) < 1, `${label}: chat and its reserved width agree`)
  assertModelBounds(sample, label)
  if (expected.atBudget) assert.ok(sample.center <= 497, `${label}: resizing reaches the middle-width boundary`)
  for (const [key, value] of Object.entries(expected)) {
    if (key !== "atBudget") assert.equal(sample[key], value, `${label}: ${key}`)
  }
  return sample
}

async function animateToggle(page, reverse = false) {
  return page.evaluate(async reverse => {
    const samples = []
    const start = performance.now()
    const done = new Promise(resolve => {
      function frame() {
        const main = document.querySelector('[data-slot="sidebar-inset"]').getBoundingClientRect()
        const chat = document.querySelector('[data-side="right"][data-slot="sidebar-container"]').getBoundingClientRect()
        samples.push({ center: main.width, overlap: Math.max(0, main.right - chat.left) })
        if (performance.now() - start < 550) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    document.querySelector('[data-slot="sidebar-trigger"]').click()
    if (reverse) {
      await new Promise(resolve => setTimeout(resolve, 60))
      document.querySelector('[data-slot="sidebar-trigger"]').click()
    }
    await done
    return samples
  }, reverse)
}

try {
  if (!production) await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  const url = `http://127.0.0.1:${server.httpServer.address().port}`

  // Use an existing real shell with no sidebar cookie: defaults and refresh
  // restoration are exercised independently from tree/performance fixtures.
  const defaults = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const defaultsFixture = await installShellFixture(defaults, false, { leftOpen: null })
  await defaults.goto(`${url}/channels`)
  await defaults.locator('[data-slot="sidebar-trigger"]').waitFor()
  await defaults.waitForLoadState("networkidle")
  assert.equal(await defaults.locator('[data-side="left"][data-slot="sidebar"]').getAttribute("data-state"), "collapsed")
  await defaults.locator('[data-slot="sidebar-trigger"]').click()
  await settled(defaults)
  await defaults.reload()
  await defaults.locator('[data-side="left"][data-state="expanded"]').waitFor()
  await defaults.waitForLoadState("networkidle")
  await defaults.locator('[data-slot="sidebar-trigger"]').click()
  await settled(defaults)
  await defaults.reload()
  await defaults.locator('[data-side="left"][data-state="collapsed"]').waitFor({ state: "attached" })
  assert.deepEqual(defaultsFixture.errors, [])
  assert.deepEqual(defaultsFixture.unexpected, [])
  await defaults.close()

  // A translated availability label must wrap before it can squeeze the name to
  // zero width. Keep the actual model page visible with chat closed on phones.
  for (const language of ["en-US", "zh-CN"]) for (const width of [320, 390]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } })
    const mobileFixture = await installShellFixture(mobile, false, { leftOpen: null })
    await mobile.addInitScript(language => localStorage.setItem("ineffable.ui.language", language), language)
    await mobile.route("**/gateway/v1/models/profiles", route => route.fulfill({ json: { profiles: modelProfiles } }))
    await mobile.goto(`${url}/models`)
    await mobile.locator('[data-slot="model-profile-grid"]').waitFor()
    await mobile.waitForLoadState("networkidle")
    await mobile.evaluate(() => document.fonts.ready)
    const sample = { language, width, ...await measure(mobile) }
    assertModelBounds(sample, `${language} ${width}px model page`)
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile models fit the viewport")
    assert.deepEqual(mobileFixture.errors, [])
    assert.deepEqual(mobileFixture.unexpected, [])
    results.modelMobile.push(sample)
    await mobile.close()
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const fixture = await installShellFixture(page, true, { leftOpen: null })
  await page.context().addCookies([{ name: "sidebar_state", value: "true", url }])
  await page.addInitScript(markers => {
    if (!localStorage.getItem("ineffable.ui.right-sidebar.width")) localStorage.setItem("ineffable.ui.right-sidebar.width", "864")
    const install = () => {
      if (!document.documentElement) return false
      const style = document.createElement("style")
      style.textContent = markers
      document.documentElement.appendChild(style)
      return true
    }
    if (!install()) {
      const observer = new MutationObserver(() => { if (install()) observer.disconnect() })
      observer.observe(document, { childList: true })
    }
  }, paintMarkers)
  await page.route("**/gateway/v1/models/profiles", route => route.fulfill({ json: { profiles: modelProfiles } }))
  const finishInitialPaint = await capturePaint(page, "remembered-left-first-paint")
  await page.goto(`${url}/models`)
  const composer = page.locator('[data-side="right"] textarea').first()
  await composer.waitFor()
  await page.waitForLoadState("networkidle")
  await finishInitialPaint()
  await composer.fill("KEEP_LAYOUT_DRAFT")
  const composerElement = await composer.elementHandle()
  const resize = page.getByRole("separator", { name: "Resize AI assistant", exact: true })
  await assertDock(page, "remembered expanded left", { left: 256, atBudget: true, preference: 864, modelColumns: 1, metricColumns: 1 })
  const beforeLeft = apiRequests(fixture.requests).length
  await page.locator('[data-slot="sidebar-trigger"]').click()
  await assertDock(page, "left collapsed restores preference", { left: 0, chat: 864, preference: 864 })
  assert.equal(apiRequests(fixture.requests).length, beforeLeft, "left opening does not refetch business data")
  await resize.focus()
  await page.keyboard.press("Home")
  await page.waitForTimeout(170)
  await assertDock(page, "wide container restores columns", { chat: 300, modelColumns: 2, metricColumns: 3 })
  const maximumPreference = Number(await resize.getAttribute("aria-valuemax"))
  await page.keyboard.press("End")
  await page.waitForTimeout(170)
  const maximum = await assertDock(page, "keyboard maximum", { atBudget: true, preference: maximumPreference, modelColumns: 1, metricColumns: 1 })
  const narrowerRoot = await page.addStyleTag({ content: "#root { width: calc(100% - 15px); }" })
  await assertDock(page, "root layout budget excludes unavailable width", { chat: maximum.chat - 15, preference: maximumPreference })
  await narrowerRoot.evaluate(node => node.remove())
  await assertDock(page, "root layout budget recovers without losing preference", { chat: maximum.chat, preference: maximumPreference })

  for (const reverse of [false, true, false]) {
    const samples = await animateToggle(page, reverse)
    assert.ok(samples.every(sample => sample.overlap < 1), "CSS animation and rapid reversal keep content visible")
    assert.ok(samples.every(sample => sample.center >= 478), "both width transitions preserve the middle budget")
    results.animation.push({ reverse, minCenter: Math.min(...samples.map(sample => sample.center)), maxOverlap: Math.max(...samples.map(sample => sample.overlap)) })
  }
  await assertDock(page, "after reversals", { left: 0, chat: maximum.chat, preference: maximumPreference })

  // Explicit pointer resizing saves a new preference; temporary constraints do not.
  const box = await resize.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 100)
  await page.mouse.down()
  const layoutRight = await page.locator("#root").evaluate(node => node.getBoundingClientRect().right)
  await page.mouse.move(layoutRight - 820, box.y + 100, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(170)
  await assertDock(page, "pointer preference", { chat: 820, preference: 820 })
  assert.equal(await page.evaluate(() => document.body.style.cursor), "")
  const pointerLimit = Number(await resize.getAttribute("aria-valuemax"))
  const beforeOvershoot = await resize.boundingBox()
  await page.mouse.move(beforeOvershoot.x + beforeOvershoot.width / 2, beforeOvershoot.y + 100)
  await page.mouse.down()
  await page.mouse.move(0, beforeOvershoot.y + 100, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(170)
  await assertDock(page, "pointer overshoot saves only the visible maximum", { atBudget: true, chat: pointerLimit, preference: pointerLimit })
  const afterOvershoot = await resize.boundingBox()
  await page.mouse.move(afterOvershoot.x + afterOvershoot.width / 2, afterOvershoot.y + 100)
  await page.mouse.down()
  await page.mouse.move(layoutRight - 820, afterOvershoot.y + 100, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(170)
  await assertDock(page, "pointer preference after overshoot", { chat: 820, preference: 820 })
  await page.setViewportSize({ width: 1200, height: 900 })
  await assertDock(page, "smaller viewport", { atBudget: true, preference: 820 })
  await page.setViewportSize({ width: 1440, height: 900 })
  await assertDock(page, "larger viewport restores preference", { chat: 820, preference: 820 })
  assert.equal(await composer.inputValue(), "KEEP_LAYOUT_DRAFT")
  assert.equal(await composer.evaluate((node, original) => node === original, composerElement), true, "the same composer survives layout constraints")

  await page.getByRole("button", { name: "Use AI assistant full screen", exact: true }).click()
  await settled(page)
  assert.equal(await page.locator('[data-side="right"][data-slot="sidebar-container"]').evaluate(node => node.getBoundingClientRect().width), 1440)
  assert.equal(await composer.inputValue(), "KEEP_LAYOUT_DRAFT")
  assert.equal(await composer.evaluate((node, original) => node === original, composerElement), true, "fullscreen retains the same composer instance")
  await page.getByRole("button", { name: "Exit full screen", exact: true }).click()
  await assertDock(page, "exit full screen", { chat: 820, preference: 820 })

  await page.locator('[data-slot="sidebar-trigger"]').click()
  await assertDock(page, "expanded before breakpoints", { left: 256, atBudget: true, preference: 820 })
  const unavailableWidth = await page.evaluate(() => innerWidth - document.getElementById("root").getBoundingClientRect().width)
  for (const [index, width] of [1052, 1051, 1052, 1024, 1052, 1440].entries()) {
    // Capture before the one-pixel drawer-to-three-column restoration.
    const finishPaint = index === 2 ? await capturePaint(page, "boundary-1051-to-1052", width + unavailableWidth) : null
    await page.setViewportSize({ width: width + unavailableWidth, height: 900 })
    await assertDock(page, `boundary ${width}`, { available: width, left: width < 1052 ? 0 : 256, preference: 820 })
    await finishPaint?.()
  }
  await page.setViewportSize({ width: 1024, height: 900 })
  await assertDock(page, "left drawer fallback", { left: 0, preference: 820 })
  await page.locator('[data-slot="sidebar-trigger"]').click()
  const leftDrawer = page.locator('[data-side="left"][data-compact="true"]')
  await leftDrawer.waitFor()
  await settled(page)
  const drawerBox = await leftDrawer.boundingBox()
  await page.mouse.click(drawerBox.x + drawerBox.width + 40, 100)
  await leftDrawer.waitFor({ state: "hidden" })
  await page.locator('[data-slot="sidebar-trigger"]').click()
  await leftDrawer.waitFor()
  await leftDrawer.focus()
  await page.keyboard.press("Escape")
  await page.locator('[data-side="left"][data-compact="true"]').waitFor({ state: "hidden" })
  await page.getByRole("button", { name: "Close AI assistant", exact: true }).click()
  await page.getByRole("button", { name: "Open AI assistant", exact: true }).click()
  await assertDock(page, "chat reopen around left fallback", { left: 0, atBudget: true, preference: 820 })
  await composer.focus()
  await composer.evaluate(node => node.setSelectionRange(5, 10))
  await page.setViewportSize({ width: 390, height: 844 })
  await composer.waitFor()
  await settled(page)
  assert.equal(await page.locator('[data-side="right"][data-compact="true"]').evaluate(node => node.getBoundingClientRect().width), 390)
  assert.equal(await composer.inputValue(), "KEEP_LAYOUT_DRAFT")
  assert.equal(await composer.evaluate((node, original) => node === original, composerElement), true, "mobile retains the original composer DOM and subscription owner")
  const modalFocus = await composer.evaluate(node => ({ focused: document.activeElement === node, active: document.activeElement?.outerHTML, selection: [node.selectionStart, node.selectionEnd] }))
  assert.equal(modalFocus.focused, true, `focused composer retains focus across the modal move: ${JSON.stringify(modalFocus)}`)
  assert.deepEqual(await composer.evaluate(node => [node.selectionStart, node.selectionEnd]), [5, 10], "selection survives the DOM host move")
  const compactChat = page.locator('[data-side="right"][data-compact="true"]')
  await page.getByRole("button", { name: /^Choose a model:/ }).click()
  await page.getByRole("option").filter({ hasText: `${modelNamePrefix}0` }).first().click()
  assert.equal(await compactChat.isVisible(), true, "nested model popover interaction does not dismiss the chat")
  await compactChat.locator('[data-slot="dropdown-menu-trigger"]').first().click()
  await page.locator('[role="menu"] input').first().fill("search while modal")
  assert.equal(await compactChat.isVisible(), true, "nested conversation dropdown and focus stay inside the sidebar")
  await page.keyboard.press("Escape")
  await page.locator('[role="menu"]').waitFor({ state: "hidden" })
  assert.equal(await compactChat.isVisible(), true, "Escape closes the nested menu before the sidebar")
  await page.getByRole("button", { name: "Collapse right sidebar", exact: true }).click()
  await compactChat.waitFor({ state: "hidden" })
  const opener = page.getByRole("button", { name: "Open AI assistant", exact: true })
  const openerElement = await opener.elementHandle()
  await opener.click()
  await compactChat.waitFor()
  await compactChat.focus()
  await page.keyboard.press("Escape")
  await compactChat.waitFor({ state: "hidden" })
  assert.equal(await openerElement.evaluate(node => document.activeElement === node), true, "modal dismissal restores focus to the external opener")
  await opener.click()
  await compactChat.waitFor()
  await page.setViewportSize({ width: 1440, height: 900 })
  await assertDock(page, "return from mobile", { left: 0, chat: 820, preference: 820 })
  assert.equal(await composer.inputValue(), "KEEP_LAYOUT_DRAFT")
  assert.equal(await composer.evaluate((node, original) => node === original, composerElement), true, "returning to desktop does not remount the conversation")
  await page.screenshot({ path: join(tmpdir(), `ineffable-workbench-layout-${mode}.png`), fullPage: true })
  await page.setViewportSize({ width: 1052 + unavailableWidth, height: 900 })
  await page.locator('[data-slot="sidebar-trigger"]').click()
  await assertDock(page, "constrained reset before double click", { left: 256, chat: 300, preference: 820 })
  await resize.dblclick()
  await page.waitForTimeout(170)
  await assertDock(page, "reset retains default preference under a temporary constraint", { chat: 300, preference: 384 })
  await page.setViewportSize({ width: 1440, height: 900 })
  await assertDock(page, "reset preference restored with space", { chat: 384, preference: 384 })
  assert.deepEqual(fixture.errors, [])
  assert.deepEqual(fixture.unexpected, [])
  await page.close()
  assertPaintedLayouts()
  writeFileSync(join(tmpdir(), `ineffable-workbench-layout-${mode}.json`), JSON.stringify(results, null, 2))
  console.log(`${mode}: sidebar defaults/refresh, width budgets/preferences, pointer/keyboard, animation reversal, containers and compact/fullscreen draft continuity passed`)
} finally {
  await browser?.close()
  if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  else await server.close()
}
