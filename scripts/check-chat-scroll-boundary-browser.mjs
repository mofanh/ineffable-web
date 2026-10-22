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
  const intents=()=>page.locator('#boundary').evaluate(el=>Number(el.dataset.intents))
  // A programmatic correction alone is never user intent.
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=150})
  await page.waitForTimeout(50)
  assert.equal(await intents(),0)
  await page.locator('#nested').evaluate(el=>{el.scrollTop=100;el.dispatchEvent(new WheelEvent('wheel',{deltaY:-30,bubbles:true,cancelable:true}))})
  await page.waitForTimeout(50)
  assert.equal(await intents(),0,'marked nested scrolling does not suspend transcript follow')
  await page.locator('#plain-nested').evaluate(el=>{el.scrollTop=100;el.dispatchEvent(new WheelEvent('wheel',{deltaY:-30,bubbles:true,cancelable:true}))})
  await page.waitForTimeout(50)
  assert.equal(await intents(),0,'plain tool output scrolling does not suspend transcript follow')
  await page.locator('#text-input').dispatchEvent('keydown',{key:'Home',bubbles:true,cancelable:true})
  await page.locator('#consumed-key').dispatchEvent('keydown',{key:'PageUp',bubbles:true,cancelable:true})
  await page.waitForTimeout(50)
  assert.equal(await intents(),0,'editing and React-consumed keys do not suspend follow')
  await page.locator('#boundary').dispatchEvent('wheel',{deltaY:-30,bubbles:true,cancelable:true})
  await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)===1)
  await page.locator('#boundary').dispatchEvent('keydown',{key:'PageUp',bubbles:true,cancelable:true})
  await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)===2)
  // Model a native scrollbar drag: pointer on viewport followed by an upward
  // scroll. A later correction after pointerup must not count as more input.
  await page.locator('#boundary').dispatchEvent('pointerdown',{button:0,bubbles:true})
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=100})
  await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)===3)
  await page.locator('#boundary').dispatchEvent('pointerup',{bubbles:true})
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=50})
  await page.waitForTimeout(50)
  assert.equal(await intents(),3)
  const detached=await page.locator('#boundary').evaluateHandle(el=>el)
  await page.locator('#toggle').click()
  assert.equal(await detached.evaluate(el=>{const e=new WheelEvent('wheel',{deltaY:-100,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented}),false,"unmount removes native listener")
  await detached.dispose()
  await page.locator('#toggle').click()
 }
 assert.deepEqual(errors,[])
 console.log("native scroll containment, input intent, nested controls, StrictMode remount and cleanup passed")
} finally {await browser?.close();await server.close()}
