import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath)
const streams=new Set()
let compacting=true,seq=10,status="streaming"
const server=await createServer({root:process.cwd(),logLevel:"error",optimizeDeps:{entries:["scripts/live-refresh-fixture.html"]},plugins:[{
 name:"compaction-fixture",enforce:"pre",
 resolveId(id){if(id==="@/features/auth/app-session"||id.endsWith("/src/features/auth/app-session"))return resolve("scripts/live-refresh-session-fixture.ts")},
 configureServer(server){server.middlewares.use((req,res,next)=>{
  if(!new URL(req.url,"http://localhost").pathname.endsWith("/subscribe"))return next()
  res.writeHead(200,{"Content-Type":"text/event-stream","Cache-Control":"no-cache"});res.write(": ready\n\n");streams.add(res)
  res.on("close",()=>streams.delete(res))
 })}
}],server:{host:"127.0.0.1",port:0}})
let browser
const emit=kind=>{
 seq++
 for(const res of streams)res.write(`data: ${JSON.stringify({type:"event",event:{run_id:"refresh-run",seq,ts_ms:seq,stream:"agentic",event:kind,metadata:{conversation_id:"refresh-conversation",execution_epoch:1}}})}\n\n`)
}
try{
 await server.listen();browser=await chromium.launch({executablePath,headless:true})
 const page=await browser.newPage({locale:"zh-CN",viewport:{width:390,height:844}})
 const errors=[];page.on("pageerror",e=>errors.push(e.message))
 await page.route("**/gateway/**",async route=>{
  const url=new URL(route.request().url())
  if(url.pathname.endsWith("/subscribe"))return route.continue()
  let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:seq}
  if(url.pathname.endsWith("/get"))body={id:"refresh-conversation",title:"Compaction",current_run_id:"refresh-run",current_run:{id:"refresh-run",status,is_streaming:status==="streaming",is_live:status==="streaming"}}
  if(url.pathname.endsWith("/messages"))body={messages:[{id:"user",conversation_id:"refresh-conversation",role:"user",message_type:"input",content:"Continue",created_at:"2026-09-14T00:00:00Z",updated_at:"2026-09-14T00:00:00Z",metadata_json:{}}],next_seq:seq,run_activities:[{run_id:"refresh-run",execution_epoch:1,seq,compacting}],page:{has_older:false,before:null}}
  if(url.pathname.endsWith("/observations/access"))body={allowed:false}
  await route.fulfill({contentType:"application/json",body:JSON.stringify(body)})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`)
 const label=page.getByText("正在自动压缩上下文…",{exact:true})
 await label.waitFor({timeout:20000})
 await page.reload();await label.waitFor({timeout:20000})
 assert.equal(await label.count(),1,"refresh has one status, without observation entitlement")
 // Wait for the actual browser SSE request, then complete and start another cycle.
 await new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(streams.size){clearInterval(timer);resolve()}else if(Date.now()-started>15000){clearInterval(timer);reject(new Error("no SSE subscription"))}},50)})
 compacting=false;emit("agent.compaction.completed")
 await label.waitFor({state:"hidden"})
 compacting=true;emit("agent.compaction.started")
 await label.waitFor()
 assert.equal(await label.count(),1)
 assert.ok(await label.evaluate(el=>el.getBoundingClientRect().right<=innerWidth),"mobile status fits viewport")
 status="cancelled";compacting=false;emit("run.cancelled")
 await label.waitFor({state:"hidden"})
 await page.reload();await page.getByText("Continue",{exact:true}).waitFor()
 assert.equal(await label.count(),0,"stop and refresh cannot revive compaction")
 assert.deepEqual(errors,[])
 console.log("compaction live completion/restart, refresh, cancellation, mobile and entitlement checks passed")
}finally{for(const res of streams)res.end();await browser?.close();await server.close()}
