import assert from "node:assert/strict"
import { installChunkLoadRecovery, reloadAfterRouteError, isChunkLoadError } from "../src/lib/app/chunk-load-recovery.ts"

const key = "ineffable:chunk-reload-attempt"
const values = new Map([[key, "100000"]])
const events = new EventTarget()
const timers = []
let now = 101000
let reloads = 0
const realNow = Date.now
const realWindow = globalThis.window
Date.now = () => now
globalThis.window = {
  sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  },
  location: { reload: () => { reloads++ } },
  addEventListener: (...args) => events.addEventListener(...args),
  setTimeout: (callback, delay) => { timers.push({ callback, due: now + delay }); return timers.length },
}
const fire = () => {
  const event = new Event("vite:preloadError", { cancelable: true })
  events.dispatchEvent(event)
  return event.defaultPrevented
}
const advance = time => {
  now = time
  for (const timer of timers.splice(0)) {
    if (timer.due <= now) timer.callback()
    else timers.push(timer)
  }
}
try {
  installChunkLoadRecovery()
  assert.equal(fire(), false)
  advance(111000)
  assert.equal(fire(), false, "a live shell after 10 seconds does not clear the 60-second cooldown")
  assert.equal(reloads, 0)
  advance(160000)
  assert.equal(fire(), true, "one automatic recovery is allowed after the complete cooldown")
  assert.equal(reloads, 1)
  advance(171000)
  assert.equal(fire(), false, "a second failure keeps its original error path during cooldown")
  reloadAfterRouteError()
  assert.equal(reloads, 2, "the user can explicitly retry within cooldown")
  assert.equal(fire(), false, "manual reload records the real attempt and cannot immediately auto-bounce")
  assert.equal(values.get(key), String(now))
  assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module")), true)
  assert.equal(isChunkLoadError(new Error("unrelated route error")), false)
  console.log("chunk recovery cooldown, explicit retry and error propagation checks passed")
} finally {
  Date.now = realNow
  if (realWindow === undefined) delete globalThis.window
  else globalThis.window = realWindow
}

if (process.argv.includes("--production")) {
  const { existsSync } = await import("node:fs")
  const { preview } = await import("vite")
  const { chromium } = await import("playwright-core")
  const { installShellFixture, waitForShell } = await import("./shell-performance-fixture.mjs")
  const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
  assert.ok(executablePath)
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } })
  let browser
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage()
    await installShellFixture(page, false)
    await page.route("**/assets/settings-page-*.js", route => route.fulfill({ status: 404, contentType: "text/javascript", body: "" }))
    const url = `http://127.0.0.1:${server.httpServer.address().port}`
    await page.goto(`${url}/channels`)
    await waitForShell(page)
    let navigations = 0
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++ })
    await page.goto(`${url}/settings`)
    const retry = page.getByRole("button", { name: "Refresh page", exact: true })
    await retry.waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(navigations, 2, "explicit navigation to a missing production chunk gets exactly one automatic reload")
    await page.waitForTimeout(11_100)
    const before = navigations
    await page.goto(`${url}/settings`)
    await retry.waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(navigations, before + 1, "the failed chunk must not trigger another automatic reload after only 11 seconds")
    const manual = navigations
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), retry.click()])
    await retry.waitFor()
    await page.waitForLoadState("networkidle")
    assert.equal(navigations, manual + 1, "explicit retry is available without an automatic reload bounce")
    console.log("production Vite missing-chunk recovery, retained cooldown and explicit retry passed")
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  }
}
