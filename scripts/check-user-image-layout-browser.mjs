import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath)
const server=await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
try {
  await server.listen();browser=await chromium.launch({executablePath,headless:true})
  for(const width of [1000,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1600}})
    const errors=[];page.on("pageerror",e=>errors.push(e.message))
    const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=1200;c.height=600;const ctx=c.getContext("2d");ctx.fillStyle="#dbeafe";ctx.fillRect(0,0,1200,600);ctx.fillStyle="#4f46e5";ctx.fillRect(120,100,960,400);return c.toDataURL().split(",")[1]})
    await page.route("**/gateway/v1/workspace-object-versions/**",route=>route.fulfill({contentType:"image/png",body:Buffer.from(png,"base64")}))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/user-image-layout-fixture.html`)
    const single=page.locator('[data-chat-row-key="single"]')
    await single.locator('img').waitFor()
    await single.locator('img').evaluate(img=>img.decode())
    const geometry=await single.evaluate(el=>{
      const text=el.querySelector('[data-user-message-text]');const img=el.querySelector('img');const a=text.getBoundingClientRect(),b=img.getBoundingClientRect()
      return {textWidth:a.width,imageWidth:b.width,imageHeight:b.height,gap:a.top-b.bottom,aligned:Math.abs(a.right-b.right),imageInBubble:text.contains(img)}
    })
    assert.equal(geometry.imageInBubble,false)
    assert.ok(geometry.textWidth<geometry.imageWidth,"short text bubble must size independently")
    assert.ok(geometry.imageWidth<=240.5&&geometry.imageHeight<=240.5)
    assert.ok(geometry.gap>=7&&geometry.aligned<=1,"image must sit above and right-align with text")
    const multi=page.locator('[data-chat-row-key="multiple"]')
    await multi.locator('img').nth(3).waitFor()
    assert.ok(await multi.locator('img').evaluateAll(imgs=>imgs.every(img=>Math.abs(img.getBoundingClientRect().width-64)<1)))
    assert.equal(await page.locator('[data-chat-row-key="only"] [data-user-message-text]').count(),0)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"long text/multi-images must not overflow")
    await single.getByRole("button",{name:"Image preview",exact:true}).click()
    await page.getByRole("dialog").waitFor()
    const dialog=page.getByRole("dialog")
    const footer=dialog.locator('[data-slot="app-dialog-footer"]')
    await footer.getByRole("link",{name:"Download image",exact:true}).waitFor()
    assert.equal(await footer.locator('a,button').count(),4)
    assert.ok(await footer.evaluate(el=>el.scrollWidth<=el.clientWidth),"preview actions must fit viewport")
    await footer.getByRole("button",{name:"Actual size",exact:true}).click()
    await footer.getByRole("button",{name:"Fit",exact:true}).click()
    assert.ok(await footer.getByRole("link",{name:"Open in workspace",exact:true}).getAttribute("href"))
    if(process.env.IMAGE_LAYOUT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.IMAGE_LAYOUT_SCREENSHOT_DIR}/image-preview-${width}.png`})
    await footer.getByRole("button",{name:"Use as reference",exact:true}).click()
    await page.getByRole("dialog").waitFor({state:"hidden"})
    assert.equal(await page.locator('[data-reference]').textContent(),"00000000-0000-0000-0000-000000000003")
    if(process.env.IMAGE_LAYOUT_SCREENSHOT_DIR) await page.screenshot({path:`${process.env.IMAGE_LAYOUT_SCREENSHOT_DIR}/user-images-${width}.png`})
    assert.deepEqual(errors,[]);await page.close()
  }
  console.log("user image/text separation, single/multi/image-only, mobile wrapping and preview passed")
} finally {await browser?.close();await server.close()}
