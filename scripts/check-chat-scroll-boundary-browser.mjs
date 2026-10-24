import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath)
const server=await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
try {
 await server.listen()
 // OS defaults differ: macOS usually overlays the bar, while Linux reserves a
 // gutter. Exercise both real browser geometries instead of assuming either.
 for(const mode of ["overlay","classic"]) {
 browser=await chromium.launch({executablePath,headless:true,ignoreDefaultArgs:["--hide-scrollbars"],args:[`--${mode==="overlay"?"enable":"disable"}-features=OverlayScrollbar`]})
 const page=await browser.newPage({viewport:{width:800,height:600}})
 const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(/passive event listener|Unable to preventDefault/i.test(m.text()))errors.push(m.text())})
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/chat-scroll-boundary-fixture.html`)
 for(let mount=0;mount<2;mount++) {
  await page.locator('#boundary').waitFor()
  const gutter=await page.locator('#boundary').evaluate(el=>el.offsetWidth-el.clientWidth-2)
  assert.ok(mode==="overlay"?gutter===0:gutter>0,`${mode} browser must expose the expected scrollbar geometry; gutter=${gutter}`)
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
  await page.locator('#text-input').evaluate(el=>el.focus({preventScroll:true}))
  await page.keyboard.press('Home')
  await page.locator('#consumed-key').evaluate(el=>el.focus({preventScroll:true}))
  await page.keyboard.press('PageUp')
  await page.locator('#native-key').evaluate(el=>el.focus({preventScroll:true}))
  await page.keyboard.press('Shift+Space')
  await page.waitForTimeout(50)
  assert.equal(await intents(),0,'editing and React-consumed keys do not suspend follow')
  await page.locator('#boundary').dispatchEvent('wheel',{deltaY:-30,bubbles:true,cancelable:true})
  await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)===1)
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=150;el.focus({preventScroll:true})})
  await page.keyboard.press('PageUp')
  await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)===2)
  await page.waitForTimeout(300)
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=150})
  // Merely holding empty padding while a layout correction scrolls is not a
  // scrollbar drag. Use trusted pointer input, not only dispatchEvent.
  const padding=await page.locator('#boundary').evaluate(el=>{const box=el.getBoundingClientRect();return{x:box.left+el.clientLeft+el.clientWidth-8,y:box.top+100}})
  await page.mouse.move(padding.x,padding.y)
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,padding),'boundary')
  await page.mouse.down()
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=100})
  await page.waitForTimeout(50)
  assert.equal(await intents(),2,'stationary padding pointer does not turn correction into user intent')
  await page.mouse.up()
  const leftPadding=await page.locator('#boundary').evaluate(el=>{const box=el.getBoundingClientRect();return{x:box.left+el.clientLeft+4,y:box.top+100}})
  await page.mouse.move(leftPadding.x,leftPadding.y)
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,leftPadding),'boundary')
  await page.mouse.down()
  await page.mouse.move(leftPadding.x,leftPadding.y-20,{steps:3})
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=80})
  await page.waitForTimeout(50)
  assert.equal(await intents(),2,'dragging padding away from the scrollbar rail cannot turn correction into intent')
  await page.mouse.up()
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=150})
  await page.mouse.move(padding.x,padding.y)
  await page.mouse.down()
  // Only overlay bars share the client box. With a reserved gutter this same
  // point is ordinary padding and must remain ignored, even during a drag.
  // The overlay scroll itself is modelled; native thumb dragging is tested below.
  await page.mouse.move(padding.x,padding.y-30,{steps:3})
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=50})
  if(mode==="overlay") {
   await page.waitForFunction(()=>Number(document.getElementById('boundary').dataset.intents)>=3)
  } else {
   await page.waitForTimeout(50)
   assert.equal(await intents(),2,'client padding beside a classic gutter does not become scrollbar intent')
  }
  await page.mouse.up()
  const afterDrag=await intents()
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=25})
  await page.waitForTimeout(50)
  assert.equal(await intents(),afterDrag)
  // Force a painted classic scrollbar, then drag its actual thumb with trusted
  // mouse input. Overlay dragging above keeps its modelled-scroll limit explicit.
  const classicStyle=await page.addStyleTag({content:'#boundary::-webkit-scrollbar{width:16px} #boundary::-webkit-scrollbar-thumb{background:#777} #boundary::-webkit-scrollbar-track{background:#ddd}'})
  await page.locator('#boundary').evaluate(el=>{el.scrollTop=300})
  // Native thumb painting and the prior gesture may settle after DOM layout.
  // Wait for paint, then use its actual position rather than stale setup data.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const bar=await page.locator('#boundary').evaluate(el=>{const box=el.getBoundingClientRect();return{x:box.right-8,y:box.top+1,height:el.clientHeight,total:el.scrollHeight,top:el.scrollTop,gutter:el.offsetWidth-el.clientWidth-2}})
  assert.ok(bar.gutter>0,'classic scrollbar has an actual reserved gutter')
  const thumb=Math.max(20,bar.height*bar.height/bar.total)
  const thumbY=bar.y+bar.top/(bar.total-bar.height)*(bar.height-thumb)+thumb/2
  await page.mouse.move(bar.x,thumbY)
  await page.mouse.down()
  await page.mouse.move(bar.x,thumbY-30,{steps:5})
  await page.mouse.up()
  await page.waitForFunction(({before,top})=>document.getElementById('boundary').scrollTop<top && Number(document.getElementById('boundary').dataset.intents)>before,{before:afterDrag,top:bar.top})
  await classicStyle.evaluate(el=>el.remove())
  const detached=await page.locator('#boundary').evaluateHandle(el=>el)
  await page.locator('#toggle').click()
  assert.equal(await detached.evaluate(el=>{const e=new WheelEvent('wheel',{deltaY:-100,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented}),false,"unmount removes native listener")
  await detached.dispose()
  await page.locator('#toggle').click()
 }
 assert.deepEqual(errors,[])
 console.log(`${mode} scrollbar: native scroll containment, input intent, nested controls, StrictMode remount and cleanup passed`)
 await browser.close();browser=undefined
 }
} finally {await browser?.close();await server.close()}
