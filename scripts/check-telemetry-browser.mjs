import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath)
const received=[]
const server=await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0},plugins:[{name:"telemetry-fixture",configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url!=="/collector/track")return next()
 let body="";req.on("data",d=>body+=d);req.on("end",()=>{received.push({body:JSON.parse(body),headers:req.headers});res.writeHead(202);res.end()})
})}}]})
let browser
try {
 await server.listen();browser=await chromium.launch({executablePath,headless:true})
 const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message))
 const base=`http://127.0.0.1:${server.httpServer.address().port}/scripts/telemetry-fixture.html`
 await page.goto(base);await page.waitForFunction(()=>window.fixtureReady);await page.waitForTimeout(500)
 assert.equal(received.length,0,"disabled sends nothing")
 await page.goto(base+"?enabled=true&token=private-token")
 await page.waitForFunction(()=>window.telemetry?.stats.delivered>=1)
 await page.locator("#input").fill("private-input")
 await page.locator("#slow").click()
 await page.evaluate(()=>{window.telemetry.route('/workspace/private-workspace/objects/private-object');window.telemetry.route('/workspace/another/objects/another')})
 await page.mouse.wheel(0,800);await page.waitForTimeout(800)
 // Force hidden lifecycle to flush INP and low-frequency aggregates.
 const other=await browser.newPage();await other.bringToFront()
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForTimeout(1500)
 assert.ok(received.some(x=>x.body.payload.name==='frontend_long_tasks'), 'long task aggregation')
 assert.ok(received.some(x=>x.body.payload.name==='frontend_scroll_frames'), 'scroll frame aggregation')
 assert.ok(received.some(x=>x.body.payload.name==='frontend_web_vital'&&x.body.payload.properties.metric==='INP'), 'standard INP observation')
 const screens=received.filter(x=>x.body.payload.name==='screen_view')
 assert.equal(screens.length,2,"same route template is not duplicate navigation")
 const wire=JSON.stringify(received)
 for(const secret of ['private-token','private-input','Private conversation title','private-workspace','private-object'])assert.ok(!wire.includes(secret),secret)
 assert.ok(received.every(x=>!x.headers['openpanel-client-secret']&&!x.headers.cookie&&!x.headers.referer))
 assert.deepEqual(errors,[])
 await page.evaluate(()=>window.telemetry.stop())
 const count=received.length;await page.locator('#slow').click();await page.waitForTimeout(500);assert.equal(received.length,count)
 console.log('browser optional telemetry pageviews, route sanitization, interaction, isolation and teardown checks passed')
} finally {await browser?.close();await server.close()}
