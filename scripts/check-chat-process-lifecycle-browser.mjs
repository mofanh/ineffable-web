import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { createServer } from "vite"

const executablePath = [process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(path=>path && existsSync(path))
assert.ok(executablePath)
const streams = new Set()
const server = await createServer({root:process.cwd(),logLevel:"error",optimizeDeps:{entries:["scripts/live-refresh-fixture.html"]},plugins:[{
  name:"process-lifecycle-session",enforce:"pre",
  resolveId(id) { if (id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return resolve("scripts/live-refresh-session-fixture.ts") },
  configureServer(server) { server.middlewares.use((req,res,next)=>{
    if (!new URL(req.url,"http://localhost").pathname.endsWith("/subscribe")) return next()
    res.writeHead(200,{"Content-Type":"text/event-stream"});res.write(": ready\n\n");streams.add(res)
    res.on("close",()=>streams.delete(res))
  }) },
}],server:{host:"127.0.0.1",port:0,watch:null,hmr:false}})
let browser
try {
  await server.listen()
  browser = await chromium.launch({executablePath,headless:true})
  const page = await browser.newPage({viewport:{width:800,height:900}})
  const errors=[];page.on("pageerror",error=>errors.push(error.message))
  let status="streaming",resumeMode="none",terminalMessages=0
  const conversation = () => ({id:"refresh-conversation",title:"Process lifecycle",current_run_id:"refresh-run",current_run:{
    id:"refresh-run",status,execution_epoch:1,version:status === "streaming" ? 1 : 2,lifecycle_seq:status === "streaming" ? 0 : 5,
    is_live:status === "streaming",is_streaming:status === "streaming",accepts_guided_input:status === "streaming",resume_mode:resumeMode,
  }})
  await page.route("**/gateway/**",async route=>{
    const path = new URL(route.request().url()).pathname
    if (path.endsWith("/subscribe")) return route.continue()
    let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
    if (path.endsWith("/get")) body=conversation()
    if (path.endsWith("/list")) body={items:[conversation()]}
    if (path.endsWith("/observations/access")) body={allowed:false}
    if (path.endsWith("/messages")) {
      if (status !== "streaming") { terminalMessages++;return route.fulfill({status:500,json:{error:{message:"TERMINAL_HISTORY_UNAVAILABLE"}}}) }
      const common={conversation_id:"refresh-conversation",created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z"}
      body={messages:[{...common,id:"user",role:"user",message_type:"input",message_seq:1,timeline_seq:1,timeline_unit_id:"message:user",content:"Lifecycle task",metadata_json:{}},
        {...common,id:"process",run_id:"refresh-run",role:"assistant",message_type:"output",message_seq:2,canonical_seq:2,timeline_seq:2,timeline_unit_id:"run:refresh-run:anchor:2",content:"LIVE PROCESS CONTENT",run_status:"streaming",metadata_json:{assistant_phase:"commentary",transcript_segment:{id:"refresh-run:1:1",turn:1,execution_epoch:1}}}],next_seq:0,page:{has_older:false,before:null}}
    }
    await route.fulfill({json:body})
  })
  const url=`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`
  for (const [outcome,mode] of [["cancelled","none"],["suspended","none"],["suspended","automatic"],["failed","none"]]) {
    console.log(`Checking live process ${outcome} (${mode})`)
    status="streaming";resumeMode="none";terminalMessages=0
    const subscribed = page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/subscribe"))
    await page.goto(url)
    await subscribed
    const toggle=page.locator("[data-chat-process-toggle]")
    await toggle.waitFor()
    await toggle.click()
    assert.equal(await toggle.getAttribute("aria-expanded"),"false")
    assert.ok(streams.size,"actual Sidebar subscribed to SSE")
    status=outcome;resumeMode=mode
    const event={run_id:"refresh-run",seq:5,ts_ms:1,stream:"run",event:`run.${outcome}`,scope:"run",content:null,
      metadata:{conversation_id:"refresh-conversation",execution_epoch:1,run_version:2,canonical_message_seq_end:2,resume_mode:mode}}
    for (const stream of streams) stream.write(`data: ${JSON.stringify({type:"event",event})}\n\n`)
    await page.waitForFunction(()=>document.querySelector("[data-chat-process-toggle]")?.getAttribute("aria-expanded")==="true")
    assert.equal(await toggle.isDisabled(),true)
    assert.equal(await page.getByText("LIVE PROCESS CONTENT",{exact:true}).isVisible(),true)
    if (outcome !== "suspended") assert.ok(terminalMessages > 0,"history failure did not determine process visibility")
  }
  assert.deepEqual(errors,[])
  console.log("real Sidebar lifecycle keeps cancelled, failed and suspended processes visible without history")
} finally {
  await browser?.close()
  for (const stream of streams) stream.end()
  await server.close()
}
