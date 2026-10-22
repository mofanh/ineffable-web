import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { inflateSync } from "node:zlib"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(path => path && existsSync(path))
assert.ok(executablePath, "Chrome is required")
const streams = new Set()
let seq = 1
let status = "streaming"
const baselineRef = process.env.INEFFABLE_CHAT_STREAM_BASELINE_REF
const baselinePath = "src/features/chat/components/chat-message-list.tsx"
const baselineSource = baselineRef ? execFileSync("git", ["show", `${baselineRef}:${baselinePath}`], { encoding: "utf8" }) : null
const server = await createServer({
  root: process.cwd(), logLevel: "error",
  optimizeDeps: { entries: ["scripts/live-refresh-fixture.html"] },
  plugins: [{
    name: "stream-layout-fixture", enforce: "pre",
    resolveId(id) {
      if (id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return resolve("scripts/live-refresh-session-fixture.ts")
    },
    load(id) {
      if (baselineSource && id.split("?")[0] === resolve(baselinePath)) return baselineSource
    },
    transform(code, id) {
      if (id.split("?")[0].endsWith("/scripts/live-refresh-fixture.tsx")) {
        // Match the real Sidebar's column container. The standalone fixture's
        // row flex item otherwise grows wider than a phone and touch misses it.
        assert.match(code, /minHeight:\s*0/)
        return code.replace(/minHeight:\s*0/, 'minHeight: 0, flexDirection: "column"')
      }
      if (!id.split("?")[0].endsWith("/src/features/chat/components/chat-message-list.tsx")) return
      // Count actual component renders, including memo bailouts, without adding
      // production debug state or replacing the component under test.
      for (const name of ["RunActivity", "ThinkingPlaceholder"]) {
        const signature = code.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{`))?.[0]
        assert.ok(signature, `instrument ${name}`)
        code = code.replace(signature, `${signature}\nwindow.layoutRenders.${name}++;`)
      }
      return code
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!new URL(req.url, "http://localhost").pathname.endsWith("/subscribe")) return next()
        // The UI placeholder can appear well before subscribe connects.
        // Deliberately delay headers to exercise the handshake barrier.
        const timer = setTimeout(() => {
          if (res.destroyed) return
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
          res.write(": ready\n\n")
          streams.add(res)
        }, 3000)
        res.on("close", () => { clearTimeout(timer); streams.delete(res) })
      })
    },
  }],
  server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
})
function emit(event, content, metadata = {}) {
  assert.ok(streams.size, "wait for the current page's SSE handshake before emitting")
  for (const response of streams) response.write(`data: ${JSON.stringify({ type: "event", event: {
    run_id: "refresh-run", seq: ++seq, ts_ms: seq, stream: "agentic", event, content,
    metadata: { conversation_id: "refresh-conversation", execution_epoch: 1, scope: "main", ...metadata },
  } })}\n\n`)
}
const history = Array.from({ length: 120 }, (_, index) => ({
  id: `user-${index}`, conversation_id: "refresh-conversation", role: "user", message_type: "input",
  content: `Old message ${index}\n${"Earlier text.\n".repeat(index % 5 + 1)}`, timeline_seq: index + 1,
  created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z", metadata_json: {},
}))

// Inspect actual CDP painted PNGs, not rAF geometry (rAF precedes the browser's
// layout/ResizeObserver phase and can expose intermediates that never paint).
function paintedMarkerBottom(base64) {
  const png = Buffer.from(base64, "base64"), chunks = []
  let width, height, channels, position = 8
  while (position < png.length) {
    const length = png.readUInt32BE(position), type = png.toString("ascii", position + 4, position + 8)
    const data = png.subarray(position + 8, position + 8 + length)
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      assert.equal(data[8], 8)
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0
      assert.ok(channels, "Chrome screencast must supply RGB/RGBA PNG")
      assert.equal(data[12], 0, "non-interlaced PNG")
    }
    if (type === "IDAT") chunks.push(data)
    position += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels
  let previous = Buffer.alloc(stride), offset = 0, bottom = -1
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
    for (let x = 0; x < stride; x += channels) {
      if (row[x] === 255 && row[x + 1] === 0 && row[x + 2] === 255) bottom = y
    }
    previous = row
  }
  return bottom
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath, headless: true })
  for (const width of [390, 1000]) {
    seq = 1
    status = "streaming"
    const page = await browser.newPage({ viewport: { width, height: 844 }, locale: "zh-CN", hasTouch: true })
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    page.on("console", message => {
      if (/ResizeObserver loop|Maximum update depth|passive event listener/i.test(message.text())) errors.push(message.text())
    })
    await page.addInitScript(() => {
      window.layoutRenders = { RunActivity: 0, ThinkingPlaceholder: 0 }
      window.layoutWrites = 0
      const scrollTo = Element.prototype.scrollTo
      Element.prototype.scrollTo = function (...args) {
        if (this.hasAttribute("data-chat-scroll-region")) window.layoutWrites++
        return scrollTo.apply(this, args)
      }
    })
    await page.route("**/gateway/**", async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith("/subscribe")) return route.continue()
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: seq }
      if (url.pathname.endsWith("/get")) body = {
        id: "refresh-conversation", title: "Stream layout", current_run_id: "refresh-run",
        current_run: { id: "refresh-run", status, is_streaming: status === "streaming", is_live: status === "streaming", execution_epoch: 1 },
      }
      if (url.pathname.endsWith("/messages")) body = { messages: history, next_seq: seq, page: { has_older: false, before: null } }
      if (url.pathname.endsWith("/observations/access")) body = { allowed: false }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
    })
    const frames = count => page.evaluate(async count => {
      for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve))
    }, count)
    const viewport = page.locator("[data-chat-scroll-region]").first()
    const activity = page.locator("[data-chat-run-activity]")
    const latest = page.getByRole("button", { name: "最新消息", exact: true })
    const assertTail = async () => {
      await page.waitForFunction(() => {
        const viewport = document.querySelector("[data-chat-scroll-region]")
        const status = document.querySelector("[data-chat-run-activity], [data-chat-thinking-placeholder]")
        if (!viewport || !status) return false
        const rect = viewport.getBoundingClientRect(), position = status.getBoundingClientRect()
        return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2 && position.top >= rect.top && position.bottom <= rect.bottom
      })
      assert.equal(await latest.count(), 0, "layout correction must not pause following")
    }
    const assertIdle = async selector => {
      await frames(12)
      const result = await page.evaluate(async selector => {
        const viewport = document.querySelector("[data-chat-scroll-region]")
        const before = { renders: { ...window.layoutRenders }, writes: window.layoutWrites }
        const samples = []
        for (let i = 0; i < 45; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          samples.push([viewport.scrollHeight, viewport.scrollTop, document.querySelector(selector)?.getBoundingClientRect().top])
        }
        return { before, after: { renders: window.layoutRenders, writes: window.layoutWrites }, samples }
      }, selector)
      for (let axis = 0; axis < 3; axis++) {
        const values = result.samples.map(sample => sample[axis])
        assert.ok(values.every(Number.isFinite), "activity stays mounted and visible")
        assert.ok(Math.max(...values) - Math.min(...values) <= 1, "idle layout must not drift")
      }
      assert.equal(result.after.writes - result.before.writes, 0, "idle content must not repeatedly scroll")
      assert.ok(result.after.renders.RunActivity - result.before.renders.RunActivity <= 2, "only elapsed-time ticks render the activity")
      assert.equal(result.after.renders.ThinkingPlaceholder - result.before.renders.ThinkingPlaceholder, 0)
    }
    const subscribed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/subscribe"))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`)
    await page.locator("[data-chat-thinking-placeholder]").waitFor()
    await assertTail()
    const initialCount = Number(await page.locator("[data-chat-entry-count]").getAttribute("data-chat-entry-count"))
    await assertIdle("[data-chat-thinking-placeholder]")
    assert.equal((await subscribed).status(), 200)
    await page.waitForFunction(() => window.layoutRenders.ThinkingPlaceholder > 0)
    // The first reasoning delta used to misclassify a virtual row correction as
    // an upward user gesture, leaving the activity below the viewport.
    emit("model.reasoning.delta", "Reasoning begins.\n")
    let reasoning = "Reasoning begins.\n"
    await activity.waitFor()
    await assertTail()
    const originalActivity = await activity.elementHandle()
    const beforeTokens = await page.evaluate(() => window.layoutRenders.RunActivity)
    const tokensStarted = Date.now()
    for (let index = 0; index < 70; index++) {
      const delta = ` ${"streaming evidence ".repeat(20)}${index}`
      reasoning += delta
      emit("model.reasoning.delta", delta)
      await frames(1)
    }
    await assertTail()
    assert.ok(await page.locator("[data-chat-reasoning-preview]").evaluate(node => node.textContent.length <= 240), "collapsed preview has bounded text")
    assert.ok(await page.evaluate(() => window.layoutRenders.RunActivity) - beforeTokens <= Math.ceil((Date.now() - tokensStarted) / 1000) + 2, "only clock ticks, not tokens, repaint the activity")
    assert.ok(await originalActivity.evaluate(node => node === document.querySelector("[data-chat-run-activity]")), "reasoning deltas preserve activity identity")
    await page.getByRole("button", { name: /思考过程/ }).evaluate(node => node.focus({ preventScroll: true }))
    await page.keyboard.press("Shift+Space")
    await assertTail()
    await page.getByText(/streaming evidence/).first().waitFor()
    assert.ok(await page.locator("[data-chat-scroll-content]").textContent().then(text => text.replace(/\s+/g, " ").includes(reasoning.replace(/\s+/g, " ").trim())), "expanded reasoning retains complete content")
    await page.getByRole("button", { name: /思考过程/ }).click()
    await assertTail()
    assert.ok(await originalActivity.evaluate(node => node === document.querySelector("[data-chat-run-activity]")), "reasoning disclosure preserves activity identity")
    // Cross the inner virtualization threshold while the outer transcript is
    // already scrolled. Initializing a nested engine at zero must not reset it.
    await page.evaluate(() => {
      window.streamScrollTops = []
      const viewport = document.querySelector("[data-chat-scroll-region]")
      viewport.addEventListener("scroll", () => window.streamScrollTops.push(viewport.scrollTop))
    })
    for (let index = 0; index < 48; index++) {
      emit("tool.call.completed", null, { tool_call_id: `tool-${index}`, tool_name: "exec_command", full_arguments: JSON.stringify({ command: `echo ${index}` }) })
      emit("tool.result", JSON.stringify({ status: "exited", exit_code: 0, stdout: `${index}` }), { tool_call_id: `tool-${index}`, tool_name: "exec_command", status: "succeeded" })
      await frames(2)
    }
    await assertTail()
    assert.ok(await page.evaluate(() => window.streamScrollTops.every(top => top > 1000)), "nested window must not scroll transcript to zero")
    assert.ok(await originalActivity.evaluate(node => node === document.querySelector("[data-chat-run-activity]")), "nested window activation preserves activity identity")
    assert.ok(Number(await page.locator("[data-chat-entry-count]").getAttribute("data-chat-entry-count")) <= initialCount + 1, "internal scrolling must not load hidden history")
    await assertIdle("[data-chat-run-activity]")
    // Give the existing status a dimension-neutral paint marker, then inspect
    // every actual screencast frame while Markdown gains paragraphs/tables.
    const markerStyle = await page.addStyleTag({ content: "[data-chat-run-activity]{background:rgb(255,0,255)!important;color:rgb(255,0,255)!important}" })
    const paint = await page.context().newCDPSession(page)
    const painted = []
    const captureFrame = frame => {
      void paint.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {})
      painted.push(paintedMarkerBottom(frame.data))
    }
    paint.on("Page.screencastFrame", captureFrame)
    await paint.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
    await frames(6)
    painted.length = 0
    for (let index = 0; index < 45; index++) {
      emit("model.text.delta", `正文增长 ${index} ${"painted frame evidence ".repeat(8)}\n\n`)
      await new Promise(resolve => setTimeout(resolve, 40))
    }
    await frames(10)
    await paint.send("Page.stopScreencast")
    paint.removeListener("Page.screencastFrame", captureFrame)
    await paint.detach()
    await markerStyle.evaluate(node => node.remove())
    assert.ok(painted.length >= 15, "sample actual painted frames during streaming")
    assert.ok(painted.every(bottom => bottom >= 0), "footer must not flash below the viewport between streamed chunks")
    assert.ok(Math.max(...painted) - Math.min(...painted) <= 1, "painted footer must not drop and rebound each frame")
    console.log(`${width}px: ${painted.length} painted frames, footer bottom ${Math.min(...painted)}..${Math.max(...painted)}`)
    // Native wheel input intentionally suspends follow; subsequent SSE must not
    // pull a reader away. Returning through Latest restores the same scroll owner.
    await viewport.hover({ position: { x: 40, y: 180 } })
    await page.mouse.wheel(0, -300)
    await latest.waitFor()
    await frames(15)
    const paused = await viewport.evaluate(node => node.scrollTop)
    emit("model.text.delta", "Answer starts.\n\n" + "More answer text.\n\n".repeat(50))
    await frames(15)
    assert.equal(await viewport.evaluate(node => node.scrollTop), paused, "new output respects the reader's position")
    await latest.click()
    await assertTail()
    // Keyboard scroll and a real browser touch gesture follow the same intent
    // contract; neither relies on interpreting arbitrary scroll events.
    await viewport.evaluate(node => { node.tabIndex = 0; node.focus({ preventScroll: true }) })
    await page.keyboard.press("PageUp")
    await latest.waitFor()
    await frames(15)
    await page.keyboard.press("End")
    await assertTail()
    emit("model.text.delta", `\n\n\`\`\`text\n${"nested horizontal evidence ".repeat(500)}\n\`\`\`\n`)
    const code = page.locator("[data-chat-entry-role=assistant] pre").last()
    await code.waitFor()
    await frames(12)
    await assertTail()
    await code.evaluate(node => { node.scrollLeft = 100 })
    const bounds = await viewport.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "the real scroll viewport fits the device")
    const cdp = await page.context().newCDPSession(page)
    const touchPoint = { x: bounds.x + 60, y: bounds.y + 200 }
    const codeBounds = await code.boundingBox()
    const horizontalPoint = { x: Math.max(bounds.x + 20, codeBounds.x + 30), y: codeBounds.y + 10 }
    const beforeHorizontal = await viewport.evaluate(node => node.scrollTop)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [horizontalPoint] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: horizontalPoint.x + 40, y: horizontalPoint.y + 1 }] })
    await frames(4)
    assert.ok(await code.evaluate(node => node.scrollLeft < 100), "the nested code actually consumes the horizontal gesture")
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: horizontalPoint.x + 40, y: horizontalPoint.y + 61 }] })
    await frames(4)
    assert.equal(await viewport.evaluate(node => node.scrollTop), beforeHorizontal)
    assert.equal(await latest.count(), 0, "a browser-locked horizontal gesture cannot become a parent up-scroll when bent")
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await frames(8)
    assert.equal(await viewport.evaluate(node => node.scrollTop), beforeHorizontal)
    assert.equal(await latest.count(), 0, "horizontal touch and 1px jitter must not pause following")
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint] })
    for (let step = 1; step <= 5; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...touchPoint, y: touchPoint.y + step * 30 }] })
      await frames(1)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await latest.waitFor()
    await frames(15)
    await latest.click()
    await assertTail()
    await cdp.detach()
    status = "cancelled"
    emit("run.cancelled")
    await activity.waitFor({ state: "hidden" })
    assert.equal(await page.locator("[data-chat-thinking-placeholder]").count(), 0, "terminal state removes the placeholder")
    assert.deepEqual(errors, [])
    console.log(`${width}px: actual Sidebar HTTP SSE, bounded reasoning, nested window, idle layout, wheel/keyboard/touch follow passed`)
    await originalActivity.dispose()
    await page.close()
  }
} finally {
  for (const response of streams) response.end()
  await browser?.close()
  await server.close()
}
