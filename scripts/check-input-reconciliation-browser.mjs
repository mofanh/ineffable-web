import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath,"Chrome required")
const streams=new Set()
const server=await createServer({root:process.cwd(),logLevel:"error",optimizeDeps:{entries:["scripts/live-refresh-fixture.html"]},plugins:[{name:"input-races",enforce:"pre",resolveId(id){
  if(id==="@/features/auth/app-session"||id.endsWith("/src/features/auth/app-session"))return resolve("scripts/live-refresh-session-fixture.ts")
},configureServer(server){server.middlewares.use((req,res,next)=>{
  if(!new URL(req.url,"http://localhost").pathname.endsWith("/subscribe"))return next()
  res.writeHead(200,{"Content-Type":"text/event-stream"});res.write(": connected\n\n");streams.add(res)
  const heartbeat=setInterval(()=>res.write(": heartbeat\n\n"),1000)
  res.on("close",()=>{streams.delete(res);clearInterval(heartbeat)})
})}}],server:{host:"127.0.0.1",port:0,watch:null,hmr:false}})
let browser
try{
  await server.listen();browser=await chromium.launch({executablePath,headless:true})
  const page=await browser.newPage({locale:"zh-CN"});const errors=[];page.on("pageerror",e=>errors.push(e.message))
  const messageId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const pending={id:321,message_id:messageId,run_id:"refresh-run",kind:"pre_input",status:"queued",content:"GUIDE_RACE"}
  let admission={conversation_id:"refresh-conversation",queued_count:1,consuming_count:0,queue_paused:false,revision:0,generation:0}
  let queue=[pending],messages=[],facts=[],releasePromotion=null,queriedIds=[],releaseSend=null,sendPayload=null,holdMessages=false,heldMessages=[]
  await page.route("**/gateway/**",async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    if(path.endsWith("/subscribe"))return route.continue()
    let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
    if(path.endsWith("/get"))body={admission,id:"refresh-conversation",title:"Input races",current_run_id:"refresh-run",current_run:{id:"refresh-run",status:"streaming",is_live:true,is_streaming:true,accepts_guided_input:true,execution_epoch:1}}
    if(path.endsWith("/observations/access"))body={allowed:false}
    if(path.endsWith("/messages")){
      body={messages,next_seq:0,page:{has_older:false,before:null}}
      if(holdMessages)await new Promise(resolve=>heldMessages.push(resolve))
    }
    if(path.endsWith("models/profiles"))body={profiles:[{id:"model",display_name:"Model",supports_tool_calls:true,enabled:true}]}
    if(path.endsWith("/send")){
      sendPayload=route.request().postDataJSON();
      admission={...admission,revision:admission.revision+1}
      const receiptAdmission=structuredClone(admission)
      const receiptMessageId=sendPayload.content==="CLEARED_BEFORE_ACK"?"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"
      await new Promise(resolve=>{releaseSend=resolve});
      if(sendPayload.input_mode!=="guided") {
        body={status:"queued",queued_in_timeline:false,pending_id:323,conversation_id:"refresh-conversation",message_id:receiptMessageId,input_request_id:sendPayload.input_request_id,admission:receiptAdmission}
        await route.fulfill({json:body});return
      }
      body={status:"guided_injected",conversation_id:"refresh-conversation",message_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",input_request_id:sendPayload.input_request_id,pending_id:322}
    }
    if(path.endsWith("/pending-inputs")){
      queriedIds.push(url.searchParams.get("message_ids"));body={admission,pending_inputs:queue,input_progress:facts,blocked_by_run_status:null,can_resume:false}
    }
    if(path.endsWith("/promote")){
      await new Promise(resolve=>{releasePromotion=resolve})
      body={pending_input:{...pending,kind:"guided"}}
    }
    await route.fulfill({json:body})
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`)
  await page.getByText(/GUIDE_RACE/).waitFor({timeout:10000}).catch(async e=>{console.error(await page.locator("body").innerText(),errors);throw e})
  // A canonical queued message retains its identity throughout promotion.
  await page.getByRole("button",{name:"提升为引导",exact:true}).click()
  await page.waitForFunction(()=>document.querySelector("textarea")!==null)
  const deadline=Date.now()+5000;while(!releasePromotion&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(releasePromotion)
  queue=[]
  const progress={message_id:messageId,message_seq:2,conversation_id:"refresh-conversation",kind:"guided",phase:"accepted",run_id:"refresh-run",run_state:"streaming",execution_epoch:1,run_version:2}
  messages=[{id:messageId,timeline_unit_id:`message:${messageId}`,timeline_seq:2,message_seq:2,conversation_id:"refresh-conversation",role:"user",message_type:"input",content:"GUIDE_RACE",metadata_json:{input_progress:progress},created_at:"2026-10-03T00:00:00Z"}]
  for(const stream of streams)stream.write(`data: ${JSON.stringify({type:"event",event:{seq:1,event:"input.accepted",stream:"chat",run_id:"refresh-run",content:"GUIDE_RACE",metadata:{conversation_id:"refresh-conversation",execution_epoch:1,input_progress:progress}}})}\n\n`)
  await page.getByLabel("已接纳，正在处理",{exact:true}).waitFor({timeout:10000}).catch(async e=>{console.error(await page.locator("body").innerText(),errors,streams.size);throw e})
  assert.equal(await page.getByText("GUIDE_RACE",{exact:true}).count(),1,"before HTTP acknowledgement there is exactly one message")
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/promote"));releasePromotion();await response
  assert.equal(await page.getByText("GUIDE_RACE",{exact:true}).count(),1)
  // A wakeup without a persisted identity cannot manufacture a local queue
  // item which would later be resent as a new guided POST.
  const refresh = page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/pending-inputs"))
  for(const stream of streams)stream.write(`data: ${JSON.stringify({type:"event",event:{seq:20,event:"pending_input_queued",stream:"chat",run_id:"refresh-run",content:"DIRECT_GUIDE",metadata:{conversation_id:"refresh-conversation",execution_epoch:1,kind:"pre_input",content:"DIRECT_GUIDE"}}})}\n\n`)
  await refresh
  assert.equal(await page.getByText("DIRECT_GUIDE",{exact:true}).count(),0,"only the server snapshot can add a queue item")
  assert.equal(sendPayload,null,"queue wakeups must never resend user input")
  // A cancelled input stays readable to bounded reconciliation even when omitted from history.
  const oldId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const received={...progress,message_id:oldId,message_seq:3,phase:"received"}
  messages.push({...messages[0],id:oldId,timeline_unit_id:`message:${oldId}`,timeline_seq:3,message_seq:3,content:"CANCEL_ELSEWHERE",metadata_json:{input_progress:received}})
  const emit=(seq,event)=>{for(const stream of streams)stream.write(`data: ${JSON.stringify({type:"event",event:{seq,event,stream:"chat",run_id:"refresh-run",metadata:{conversation_id:"refresh-conversation",execution_epoch:1,pending_id:999}}})}\n\n`)}
  emit(30,"pending_input_guided");await page.getByText("CANCEL_ELSEWHERE",{exact:true}).waitFor()
  messages=messages.filter(m=>m.id!==oldId);facts=[{...received,phase:"cancelled"}]
  const reconciled=page.waitForResponse(r=>new URL(r.url()).searchParams.get("message_ids")?.includes(oldId))
  emit(31,"pending_input_cancelled");await reconciled
  await page.getByText("CANCEL_ELSEWHERE",{exact:true}).waitFor({state:"hidden"})
  assert.ok(queriedIds.some(ids=>ids?.includes(oldId)),"cached canonical IDs participate in bounded reconciliation")
  assert.equal(await page.getByText("GUIDE_RACE",{exact:true}).count(),1,"unrelated accepted input stays visible")
  // Ordinary send: subscription accepts the input while POST's first frame is held.
  releaseSend=null;sendPayload=null
  await page.locator("textarea").fill("ORDINARY_LATE")
  await page.locator("textarea").press("Enter")
  const ordinaryDeadline=Date.now()+5000;while(!releaseSend&&Date.now()<ordinaryDeadline)await new Promise(r=>setTimeout(r,10));assert.ok(releaseSend)
  assert.equal(sendPayload.input_mode,undefined)
  const ordinaryId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  const ordinaryProgress={...progress,message_id:ordinaryId,message_seq:5,kind:"ordinary",input_request_id:sendPayload.input_request_id}
  facts=[ordinaryProgress]
  messages.push({...messages[0],id:ordinaryId,timeline_unit_id:`message:${ordinaryId}`,timeline_seq:5,message_seq:5,content:"ORDINARY_LATE",metadata_json:{input_request_id:sendPayload.input_request_id,input_progress:ordinaryProgress}})
  for(const stream of streams)stream.write(`data: ${JSON.stringify({type:"event",event:{seq:40,event:"input.accepted",stream:"chat",run_id:"refresh-run",content:"ORDINARY_LATE",metadata:{conversation_id:"refresh-conversation",execution_epoch:1,input_progress:ordinaryProgress}}})}\n\n`)
  await page.locator(`[data-chat-row-key="message:${ordinaryId}"]`).waitFor()
  assert.equal(await page.locator("[data-chat-row-key]").getByText("ORDINARY_LATE",{exact:true}).count(),1)
  holdMessages=true
  const ordinaryResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/send"));releaseSend();await ordinaryResponse
  // Wait for React to apply the envelope callback, while every history patch stays held.
  await page.waitForTimeout(200)
  assert.equal(await page.locator("[data-chat-row-key]").getByText("ORDINARY_LATE",{exact:true}).count(),1,"ordinary late first frame cannot append a duplicate before refresh")
  assert.equal(await page.getByText("ORDINARY_LATE",{exact:true}).count(),1,"late queued receipt must not resurrect a queue item")
  holdMessages=false;heldMessages.forEach(resolve=>resolve())
  // A newer queue revision clears an input before its original queued ACK.
  // No accepted bubble exists here: revision fencing alone must prevent resurrection.
  await page.waitForFunction(()=>document.querySelector("textarea")?.getAttribute("aria-busy")==="false")
  releaseSend=null;sendPayload=null
  await page.locator("textarea").fill("CLEARED_BEFORE_ACK")
  await page.locator("textarea").press("Enter")
  const clearDeadline=Date.now()+5000;while(!releaseSend&&Date.now()<clearDeadline)await new Promise(r=>setTimeout(r,10));assert.ok(releaseSend)
  admission={...admission,revision:admission.revision+1,generation:admission.generation+1,queued_count:0,queue_paused:true}
  facts=[{...progress,message_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",kind:"pre_input",phase:"cancelled"}]
  const cleared=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/pending-inputs"))
  emit(41,"pending_input_cancelled");await cleared
  await page.waitForTimeout(100)
  const clearAck=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/send"));releaseSend();await clearAck
  await page.waitForFunction(()=>document.querySelector("textarea")?.getAttribute("aria-busy")==="false")
  assert.equal(await page.getByText("CLEARED_BEFORE_ACK",{exact:true}).count(),0,"a late queued receipt cannot undo the newer cancellation revision")
  assert.deepEqual(errors,[]);console.log("input identity and cancellation browser checks passed")
}finally{await browser?.close();await server.close()}
