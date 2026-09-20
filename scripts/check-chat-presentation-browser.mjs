import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].find(path => path && existsSync(path))
assert.ok(executablePath)
const server = await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
try {
  await server.listen()
  browser = await chromium.launch({executablePath,headless:true})
  const page = await browser.newPage({viewport:{width:390,height:900},locale:"zh-CN"})
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(() => {
    window.notifications = []
    window.clipboardWrites = []
    window.addEventListener("ineffable:app-notification", event => window.notifications.push(event.detail))
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text => {
      if (window.rejectCopy) throw new Error("permission denied")
      window.clipboardWrites.push(text)
    }}})
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/chat-presentation-fixture.html`)
  const footer = page.locator("[data-assistant-answer-footer]")
  await footer.waitFor()
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900})
    const layout = await footer.evaluate(node => ({width:node.clientWidth,scrollWidth:node.scrollWidth,body:document.documentElement.scrollWidth,viewport:innerWidth}))
    assert.ok(layout.scrollWidth <= layout.width + 1, `footer overflow at ${width}`)
    assert.ok(layout.body <= layout.viewport + 1, `page overflow at ${width}`)
  }
  assert.equal(await page.locator("[data-answer-run-metadata]").count(),0)
  await page.getByRole("button",{name:"回答信息",exact:true}).click()
  await page.locator("[data-answer-run-metadata]").waitFor()
  assert.match(await page.locator("[data-answer-run-metadata]").innerText(),/智能/)
  assert.match(await page.locator("[data-answer-run-metadata]").innerText(),/sha256:1234567890abcdef/)
  assert.match(await page.locator("[data-answer-run-metadata]").innerText(),/sandbox/, "unknown sandbox retains its persisted id in details")
  await page.keyboard.press("Escape")
  await page.locator("[data-answer-run-metadata]").waitFor({state:"hidden"})
  const details = page.locator("details[data-automation-instruction]")
  assert.equal(await details.count(),1,"ordinary text with same prefix must not be classified as an automation")
  assert.equal(await details.locator("p").isVisible(),false)
  await details.locator("summary").click()
  assert.match(await details.locator("p").innerText(),/保留来源/)
  await details.locator("summary").click()
  const artifact = page.getByRole("link",{name:/整理.md/})
  assert.match(await artifact.innerText(),/Markdown.*2.0 KB/)
  assert.doesNotMatch(await artifact.innerText(),/text\/markdown|version-secret/)
  await page.getByRole("button",{name:"文件详情: 整理.md",exact:true}).click()
  await page.getByText(/version-secret-hash/).waitFor()
  await page.keyboard.press("Escape")
  await footer.getByRole("button",{name:"复制",exact:true}).click()
  await page.waitForFunction(() => window.notifications.at(-1)?.tone === "success")
  assert.match((await page.evaluate(() => window.clipboardWrites))[0],/整理完成/)
  await page.evaluate(() => {window.rejectCopy=true})
  await page.getByRole("button",{name:"复制代码",exact:true}).click()
  await page.waitForFunction(() => window.notifications.at(-1)?.tone === "error")
  await page.evaluate(() => {window.rejectCopy=false})
  await page.getByRole("button",{name:"复制代码",exact:true}).click()
  await page.waitForFunction(() => window.clipboardWrites.length === 2)
  assert.match((await page.evaluate(() => window.clipboardWrites))[1],/console.log/)
  await page.getByRole("button",{name:"English",exact:true}).click()
  await page.getByRole("button",{name:"Answer details",exact:true}).waitFor()
  await page.getByRole("button",{name:"Copy code",exact:true}).waitFor()
  await page.getByRole("button",{name:"File details: 整理.md",exact:true}).waitFor()
  await page.reload()
  await page.locator("details[data-automation-instruction]").waitFor()
  assert.equal(await page.locator("details[data-automation-instruction] p").isVisible(),false)
  assert.deepEqual(errors,[])
  console.log("chat presentation browser checks passed")
} finally { await browser?.close(); await server.close() }
