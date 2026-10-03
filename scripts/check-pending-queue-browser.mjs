import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome required")
const streams = new Set()
let hold = false, release = null
const pending = { id: 123, message_id: "queued", run_id: "old-run", content: "QUEUED_FIXTURE", kind: "pre_input", status: "queued" }
let queue = { pending_inputs: [pending], blocked_by_run_status: "failed", blocked_by_run_id: "old-run", blocked_by_error_code: "context_request_overflow", can_resume: true }
const server = await createServer({ root: process.cwd(), logLevel: "error", optimizeDeps: {entries:["scripts/live-refresh-fixture.html"]}, plugins: [{name:"pending-fixture", enforce:"pre", resolveId(id) {
  if (id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return resolve("scripts/live-refresh-session-fixture.ts")
}, configureServer(server) { server.middlewares.use((req,res,next) => {
  if (!new URL(req.url,"http://localhost").pathname.endsWith("/subscribe")) return next()
  res.writeHead(200, {"Content-Type":"text/event-stream"}); res.write(": connected\n\n"); streams.add(res)
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"),1000)
  res.on("close",()=>{streams.delete(res);clearInterval(heartbeat)})
}) }}], server:{host:"127.0.0.1",port:0,watch:null,hmr:false} })
let browser
try {
  await server.listen(); browser = await chromium.launch({executablePath,headless:true})
  const page = await browser.newPage({locale:"zh-CN"}); const errors=[]; page.on("pageerror",e=>errors.push(e.message))
  const conversation = {id:"refresh-conversation",title:"Pending test",current_run_id:"refresh-run",current_run:{id:"refresh-run",status:"streaming",is_live:true,is_streaming:true,execution_epoch:1}}
  await page.route("**/gateway/**",async route=>{
    const url=new URL(route.request().url()); const path=url.pathname
    if(path.endsWith("/subscribe")) return route.continue()
    let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
    if(path.endsWith("/get")) body=conversation
    if(path.endsWith("/messages")) body={messages:[],next_seq:0,page:{has_older:false,before:null}}
    if(path.endsWith("/observations/access")) body={allowed:false}
    if(path.endsWith("/pending-inputs")) {
      body=structuredClone(queue)
      if(hold){hold=false;await new Promise(resolve=>{release=resolve})}
    }
    await route.fulfill({json:body})
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`)
  await page.getByText("请求超出上下文容量，请调整模型或工具配置",{exact:true}).waitFor()
  const send=(seq,event)=>{for(const stream of streams)stream.write(`data: ${JSON.stringify({type:"event",event:{seq,event,stream:"chat",run_id:"refresh-run",content:"QUEUED_FIXTURE",metadata:{conversation_id:conversation.id,execution_epoch:1,pending_id:123,kind:"pre_input"}}})}\n\n`)}
  const waitForHeld=async()=>{const deadline=Date.now()+5000;while(!release&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(release,"pending GET must be held")}
  hold=true; send(1,"pending_input_queued"); await waitForHeld()
  queue={pending_inputs:[],blocked_by_run_status:null,blocked_by_run_id:null,blocked_by_error_code:null,can_resume:false}
  const fresh=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/pending-inputs")); send(2,"pending_input_consuming"); await fresh
  const stale=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/pending-inputs"));release();await stale;await page.waitForTimeout(150)
  assert.equal(await page.getByText("QUEUED_FIXTURE",{exact:true}).count(),0,"late GET cannot resurrect consumed queue")
  assert.equal(await page.getByText("请求超出上下文容量，请调整模型或工具配置",{exact:true}).count(),0)
  // A → B → A must invalidate the first A request even when its conversation id matches again.
  release=null; hold=true;queue={pending_inputs:[pending],blocked_by_run_status:"failed",blocked_by_error_code:"context_request_overflow",can_resume:true}
  send(3,"pending_input_queued");await waitForHeld()
  const select=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent("fixture:select",{detail:id})),id)
  await select("other-conversation");queue={pending_inputs:[],blocked_by_run_status:null,blocked_by_error_code:null,can_resume:false};await select("refresh-conversation")
  release();await page.waitForTimeout(300)
  assert.equal(await page.getByText("请求超出上下文容量，请调整模型或工具配置",{exact:true}).count(),0)
  assert.deepEqual(errors,[]); console.log("pending queue browser checks passed")
} finally {await browser?.close();await server.close()}
