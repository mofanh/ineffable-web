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
 const page=await browser.newPage({viewport:{width:800,height:600}})
 const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(/passive event listener|Unable to preventDefault/i.test(m.text()))errors.push(m.text())})
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/chat-scroll-boundary-fixture.html`)
 for(let mount=0;mount<2;mount++) {
  await page.locator('#boundary').waitFor()
  await page.evaluate(()=>{
   window.wheelResults=[]
   document.getElementById('boundary').addEventListener('wheel',event=>window.wheelResults.push(event.defaultPrevented))
  })
  await page.locator('#nested').hover()
  await page.mouse.wheel(0,60)
  await page.waitForFunction(()=>document.getElementById('nested').scrollTop>0)
  assert.equal(await page.evaluate(()=>window.wheelResults.at(-1)),false,"normal nested scroll stays native")
  await page.evaluate(()=>{document.getElementById('nested').scrollTop=10000;window.wheelResults=[]})
  await page.mouse.wheel(0,120)
  await page.waitForFunction(()=>window.wheelResults.length>0)
  assert.equal(await page.evaluate(()=>window.wheelResults.at(-1)),true,"nested boundary cancels outer scroll")
  assert.equal(await page.locator('#boundary').evaluate(el=>el.scrollTop),0)
  assert.equal(await page.evaluate(()=>window.scrollY),0)
  await page.locator('#boundary').hover({position:{x:260,y:140}})
  await page.evaluate(()=>window.wheelResults=[])
  await page.mouse.wheel(0,-100)
  await page.waitForFunction(()=>window.wheelResults.length>0)
  assert.equal(await page.evaluate(()=>window.wheelResults.at(-1)),true,"top boundary cancels the wheel event")
  assert.equal(await page.locator('#boundary').evaluate(el=>{const e=new WheelEvent("wheel",{deltaY:-100,ctrlKey:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented}),false,"browser zoom remains available")
  const detached=await page.locator('#boundary').evaluateHandle(el=>el)
  await page.locator('#toggle').click()
  assert.equal(await detached.evaluate(el=>{const e=new WheelEvent('wheel',{deltaY:-100,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented}),false,"unmount removes native listener")
  await detached.dispose()
  await page.locator('#toggle').click()
 }
 assert.deepEqual(errors,[])
 console.log("native wheel scrolling, boundaries, StrictMode remount and cleanup passed without passive warnings")
} finally {await browser?.close();await server.close()}
