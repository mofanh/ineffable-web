import assert from "node:assert/strict"
import { existsSync, mkdirSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const measure = process.argv.includes("--measure")
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
let browser
try {
  await server.listen()
  const { emptyPlan, emptyModel } = await server.ssrLoadModule("/src/pages/system-management/shared.tsx")
  browser = await chromium.launch({ executablePath, headless: true })
  for (const language of ["en", "zh-CN"]) for (const [width, height] of [[320, 568], [390, 740], [768, 740], [1200, 900], [844, 390]]) for (const section of ["users", "plans", "models", "secrets"]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "test-token")
      localStorage.setItem("ineffable.auth.session_id", "test-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    })
    const longName = "LongNameForMobileLayout".repeat(4)
    const plan = { ...structuredClone(emptyPlan), id: "pro", name: "pro", display_name: longName, archived_at: null }
    const model = { ...structuredClone(emptyModel), id: "model", display_name: longName, upstream_model_name: longName, archived_at: null }
    const user = { id: "user", email: `${"longemail".repeat(12)}@example.com`, display_name: longName, role: "user", status: "active", created_at: "2026-09-08T00:00:00Z" }
    await page.route("**/gateway/v1/**", async route => {
      assert.equal(route.request().method(), "GET", "layout checks must not write management data")
      const path = new URL(route.request().url()).pathname
      let body = {}
      if (path.endsWith("auth/me")) body = {user:{id:"admin",role:"admin",email:"admin@example.com",display_name:"Admin",status:"active"},workspaces:[]}
      else if (path.endsWith("conversations/list")) body = {conversations:[]}
      else if (path.endsWith("admin/models")) body = {profiles:[model]}
      else if (path.endsWith("admin/users")) body = {users:[user]}
      else if (path.endsWith("llm/secrets")) body = {secrets:[{secret_ref:longName,status:"active",has_secret:true,metadata_json:{}}]}
      else if (path.endsWith("/plans")) body = path.includes("/users/") ? {assignments:[]} : {plans:[plan]}
      else if (/plans\/[^/]+\/models$/.test(path)) body = {access:[]}
      else if (path.endsWith("capability-families")) body = {items:[]}
      else if (path.endsWith("insights")) body = {insights:[]}
      else if (path.endsWith("/usage/timeseries")) body = {range:"7d",granularity:"day",has_data:true,points:Array.from({length:7}, (_, i) => ({model_profile_id:"model",user_id:"user",bucket_start:`2026-09-0${i+1}T00:00:00Z`,request_count:100+i,failed_request_count:2,raw_total_tokens:100000+i*200,charged_credits:300+i,average_latency_ms:1234}))}
      else if (path.includes("/usage")) body = {usage:[],points:[],totals:{},has_data:false}
      await route.fulfill({json:body})
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/admin-editor-fixture.html?page=${section}&language=${language}`)
    const row = page.getByRole("row").filter({hasText:longName}).first()
    await row.waitFor()
    await page.waitForLoadState("networkidle")
    const table = row.locator("xpath=ancestor::table")
    const widths = await table.evaluate(el => ({table:el.getBoundingClientRect().width,container:el.parentElement.clientWidth,document:document.documentElement.scrollWidth,viewport:innerWidth}))
    if (measure) console.log(language, section, width, widths)
    if (!measure) {
      assert.ok(widths.document <= width + 1, `${section}: page overflow`)
      assert.ok(await page.locator('[data-slot="card"]').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1)), `${section}: card content clipped`)
      assert.ok(widths.table <= widths.container + 1, `${section}: table overflow`)
    }
    if (!measure && section === "models") {
      const chart = page.locator('[data-slot="chart"]').first()
      await chart.locator('.recharts-line-curve').first().waitFor()
      assert.ok(await chart.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth), "model trend exceeds viewport")
      const surface = chart.locator('svg.recharts-surface')
      const bounds = await surface.boundingBox()
      await surface.hover({position:{x:bounds.width * 0.6,y:80}})
      const tooltip = chart.locator('.recharts-tooltip-wrapper').filter({hasText:longName})
      await tooltip.waitFor({state:"visible"})
      assert.ok(await tooltip.evaluate(el => {const r=el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1}), "model tooltip exceeds viewport")
      await page.mouse.move(0,0)
    }
    if (process.env.ADMIN_MOBILE_SCREENSHOT_DIR && width === 390) {
      mkdirSync(process.env.ADMIN_MOBILE_SCREENSHOT_DIR,{recursive:true})
      await row.scrollIntoViewIfNeeded()
      await page.screenshot({path:`${process.env.ADMIN_MOBILE_SCREENSHOT_DIR}/${section}-${language}-list.png`})
    }
    const edit = measure ? row.locator("td").last().getByRole("button").first() : row.getByRole("button", {name:/edit|编辑/i})
    await edit.click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor()
    await page.waitForLoadState("networkidle")
    for (const disclosure of await dialog.locator('button[aria-expanded="false"]').all()) await disclosure.click()
    await dialog.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)))
    const dimensions = await dialog.evaluate(el => ({width:el.clientWidth,scrollWidth:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}))
    if (measure) console.log(language, section, width, "dialog", dimensions)
    if (!measure) {
      assert.ok(await dialog.locator('[data-slot="app-dialog-body"]').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${section}: dialog body overflow`)
      assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `${section}: dialog content overflow`)
      assert.ok(dimensions.left >= 0 && dimensions.right <= width + 1)
      assert.ok(dimensions.top >= 0 && dimensions.bottom <= height + 1, `${section}: dialog outside viewport`)
      const footer = dialog.locator('[data-slot="app-dialog-footer"]')
      if (await footer.count()) assert.ok(await footer.evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 }), `${section}: footer unreachable`)
    }
    if (process.env.ADMIN_MOBILE_SCREENSHOT_DIR && width === 390) {
      mkdirSync(process.env.ADMIN_MOBILE_SCREENSHOT_DIR,{recursive:true})
      await page.screenshot({path:`${process.env.ADMIN_MOBILE_SCREENSHOT_DIR}/${section}-${language}-dialog.png`})
    }
    await dialog.getByRole("button",{name:/^(Close|关闭)$/}).click()
    await row.getByRole("button",{name:/expand|展开/i}).click()
    await row.locator("xpath=following-sibling::tr[1]").waitFor()
    await page.waitForLoadState("networkidle")
    if (!measure) assert.ok(await table.evaluate(el => el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1), `${section}: expanded content overflow`)
    if (!measure) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${section}: expanded page overflow`)
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log("admin mobile layout checks passed")
} finally {
  await browser?.close()
  await server.close()
}
