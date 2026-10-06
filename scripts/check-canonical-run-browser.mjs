import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"
import { chromium } from "playwright-core"

const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome required")
const streams = new Set()
let mode = "approval", version = 3, epoch = 1, seq = 30, status = "awaiting_human", approved = false
let heldStop, heldOlder, stopStarted, olderStarted
let needId = "formal-need"
const calls = []
const need = () => ({ kind: "approval", need_id: needId, payload: { action: "FORMAL_BATCH", ...(mode === "sandbox" ? {approval_id:"sandbox-id"} : {}) } })
const conversation = id => ({id, title:"Refresh test",current_run_id:"refresh-run",current_run:{id:"refresh-run",status,version,execution_epoch:epoch,lifecycle_seq:seq,
  is_live:false,is_streaming:status === "streaming",accepts_guided_input:false,resume_mode:mode === "automatic" ? "automatic" : "none",
  pending_segments:mode === "automatic" ? [{segment_seq:2,attempt:0,status:"pending"}] : [],pending_need:status === "awaiting_human" ? need() : null}})
const message = id => ({id:"user",conversation_id:id,role:"user",message_type:"input",message_seq:1,content:"STATE_FIXTURE",created_at:"2026-10-06T00:00:00Z",updated_at:"2026-10-06T00:00:00Z",metadata_json:{}})
const server = await createServer({root:process.cwd(),logLevel:"error",optimizeDeps:{entries:["scripts/live-refresh-fixture.html"]},plugins:[{
  name:"canonical-run-fixture",enforce:"pre",resolveId(id){if(id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return resolve("scripts/live-refresh-session-fixture.ts")},
  configureServer(server){server.middlewares.use((req,res,next)=>{
    if(!new URL(req.url,"http://localhost").pathname.endsWith("/subscribe")) return next()
    res.writeHead(200,{"Content-Type":"text/event-stream"});res.write(": ready\n\n");streams.add(res)
    res.on("close",()=>streams.delete(res))
  })}
}],server:{host:"127.0.0.1",port:0,watch:null,hmr:false}})
let browser
try {
  await server.listen();browser = await chromium.launch({executablePath,headless:true})
  const page = await browser.newPage({locale:"zh-CN"}), errors=[]
  page.on("pageerror",error=>errors.push(error.message))
  await page.route("**/gateway/**",async route=>{
    const url=new URL(route.request().url()),path=url.pathname,id=url.searchParams.get("conversation_id") ?? "refresh-conversation"
    if(path.endsWith("/subscribe")) return route.continue()
    let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:seq}
    if(path.endsWith("/get")) body=conversation(id)
    if(path.endsWith("/list")) body={items:[conversation("refresh-conversation")]}
    if(path.endsWith("/messages")) {
      if(url.searchParams.has("before") && mode === "older") {
        olderStarted?.();await new Promise(resolve=>{heldOlder=resolve})
        return route.fulfill({status:500,json:{error:{message:"STALE_OLDER_FAILURE"}}})
      }
      body={messages:[message(id),...(mode === "second-approval" ? [
        {...message(id),id:"old-approval",run_id:"refresh-run",role:"assistant",message_type:"text",message_seq:2,content:"",metadata_json:{blocking_need:{...need(),need_id:"first-need",payload:{action:"FIRST_BATCH",operations:[{call_id:"reused"}]}}}},
        {...message(id),id:"old-receipt",run_id:"refresh-run",message_seq:3,content:"Approved",metadata_json:{human_resolution:{kind:"approval",need_id:"first-need",approved:true}}},
      ] : []),...(mode === "history" ? [{...message(id),id:"old-approval",run_id:"refresh-run",role:"assistant",message_type:"text",message_seq:2,content:"",metadata_json:{blocking_need:need()}}] : [])],next_seq:0,page:{has_older:mode === "older",before:mode === "older" ? "older-cursor" : null}}
    }
    if(path.endsWith("/observations/access")) body={allowed:false}
    if(path.endsWith("/approvals/approve") || path.endsWith("/approvals/reject")) calls.push({path,payload:route.request().postDataJSON()})
    if(path.endsWith("/runs/resume")) {
      calls.push({path,payload:route.request().postDataJSON()});approved=route.request().postDataJSON().resolution.approved
      status=approved ? "streaming" : "cancelled";version++;epoch++;seq++
      body={accepted:true,run_id:"refresh-run",conversation_id:"refresh-conversation",need_id:"formal-need",execution_epoch:epoch,run_state:status}
    }
    if(path.endsWith("/stop")) {
      stopStarted?.();await new Promise(resolve=>{heldStop=resolve})
      return route.fulfill({status:500,json:{error:{message:"STALE_STOP_FAILURE"}}})
    }
    await route.fulfill({json:body})
  })
  const url=`http://127.0.0.1:${server.httpServer.address().port}/scripts/live-refresh-fixture.html`
  const select=id=>page.evaluate(id=>window.dispatchEvent(new CustomEvent("fixture:select",{detail:id})),id)
  for(const kind of ["approval","sandbox"]) {
    mode=kind;status="awaiting_human";version=3;epoch=1;seq=30;calls.length=0
    console.log("Checking approval",kind)
    await page.goto(url);await page.getByText("FORMAL_BATCH",{exact:true}).waitFor()
    const button=page.getByRole("button",{name:kind === "approval" ? "批准" : "拒绝",exact:true})
    await Promise.all([page.waitForResponse(response=>response.url().endsWith("/runs/resume")),button.click()])
    await page.waitForTimeout(100)
    assert.equal(calls.filter(call=>call.path.includes("/approvals/")).length,kind === "sandbox" ? 1 : 0,"generic approval must not call sandbox API")
    if(kind === "sandbox") assert.equal(calls[0].payload.approval_id,"sandbox-id")
    assert.equal(calls.at(-1).payload.resolution.need_id,"formal-need")
    assert.equal(calls.at(-1).payload.resolution.approved,kind === "approval")
  }
  mode="history";status="completed";version=6;seq=50
  await page.goto(url);await page.getByText("FORMAL_BATCH",{exact:true}).waitFor()
  assert.equal(await page.getByRole("button",{name:"批准",exact:true}).isDisabled(),true,"historical approval is read-only")
  // Unfinished streaming with no live lease and automatic suspended work both stay observable/stoppable.
  for(const kind of ["non-live","automatic"]) {
    mode=kind;status=kind === "automatic" ? "suspended" : "streaming";version=3;seq=30;epoch=1
    await page.goto(url);await page.getByText("STATE_FIXTURE",{exact:true}).waitFor()
    await page.getByRole("button",{name:"停止",exact:true}).waitFor()
    assert.equal(await page.getByText("已完成",{exact:true}).count(),0)
  }
  // A late Stop error and older-page error/finally cannot cross an A → B → A view generation.
  mode="non-live";status="streaming";await page.goto(url)
  const started = new Promise(resolve=>{stopStarted=resolve})
  await page.getByRole("button",{name:"停止",exact:true}).click();await started
  await select("other-conversation");await page.getByText("STATE_FIXTURE",{exact:true}).waitFor();await select("refresh-conversation")
  heldStop();await page.waitForTimeout(200)
  assert.equal(await page.getByText(/STALE_STOP_FAILURE/).count(),0)
  mode="older";status="completed";version=6;seq=50;await page.goto(url)
  const older = new Promise(resolve=>{olderStarted=resolve})
  await page.getByRole("button",{name:"更早消息",exact:true}).click();await older
  await select("other-conversation");await page.getByText("STATE_FIXTURE",{exact:true}).waitFor();await select("refresh-conversation")
  await page.getByRole("button",{name:"更早消息",exact:true}).waitFor();heldOlder();await page.waitForTimeout(200)
  assert.equal(await page.getByText(/STALE_OLDER_FAILURE/).count(),0)
  assert.equal(await page.getByRole("button",{name:"重试更早消息",exact:true}).count(),0)
  // A previously answered occurrence with the same protocol ID must not disable
  // the current independently persisted approval need.
  mode="second-approval";needId="second-need";status="awaiting_human";version=9;epoch=3;seq=90;calls.length=0
  await page.goto(url);await page.getByText("FORMAL_BATCH",{exact:true}).waitFor()
  const activeApproval=page.getByRole("button",{name:"批准",exact:true})
  assert.equal(await activeApproval.count(),2)
  assert.equal(await activeApproval.nth(0).isDisabled(),true)
  assert.equal(await activeApproval.nth(1).isDisabled(),false)
  await Promise.all([page.waitForResponse(response=>response.url().endsWith("/runs/resume")),activeApproval.nth(1).click()])
  assert.equal(calls.at(-1).payload.resolution.need_id,"second-need")
  needId="formal-need"
  // Menus use the same reducer projection as the selected conversation. A late
  // list response cannot reopen an already viewed terminal or create new unread.
  mode="non-live";status="streaming";version=3;epoch=1;seq=30
  await page.goto(url);await page.getByText("STATE_FIXTURE",{exact:true}).waitFor()
  await page.evaluate(value=>window.dispatchEvent(new CustomEvent("fixture:conversations",{detail:[value]})),conversation("refresh-conversation"))
  const deadline=Date.now()+5000
  while(!streams.size && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10))
  assert.ok(streams.size)
  status="completed";version=6;seq=60
  for(const stream of streams) stream.write(`data: ${JSON.stringify({type:"event",event:{run_id:"refresh-run",seq:60,event:"run.completed",content:null,stream:"chat",metadata:{conversation_id:"refresh-conversation",execution_epoch:1,run_version:6}}})}\n\n`)
  await page.getByRole("button",{name:"停止",exact:true}).waitFor({state:"hidden"})
  await select(null)
  const publish=items=>page.evaluate(items=>window.dispatchEvent(new CustomEvent("fixture:conversations",{detail:items})),items)
  const terminalSummary=conversation("refresh-conversation")
  status="streaming";version=3;seq=30
  await publish([conversation("refresh-conversation")])
  await page.getByRole("button",{name:"新对话",exact:true}).first().click()
  let menuRow=page.getByRole("button").filter({hasText:"Refresh test"}).last()
  await menuRow.waitFor();assert.equal(await menuRow.getByText("运行中",{exact:true}).count(),0)
  await page.keyboard.press("Escape")
  await publish([terminalSummary])
  await page.getByRole("button",{name:"新对话",exact:true}).first().click()
  menuRow=page.getByRole("button").filter({hasText:"Refresh test"}).last()
  assert.equal(await menuRow.getByText("已完成",{exact:true}).count(),0,"late terminal list must not recreate viewed unread completion")
  await page.keyboard.press("Escape")
  // With a new draft selected, unfinished background work stays polled even
  // without a live lease. Its actual completion produces one unread badge.
  for(const kind of ["non-live","automatic"]) {
    mode=kind;status=kind === "automatic" ? "suspended" : "streaming";version=3;seq=30
    await page.goto(url);await page.getByText("STATE_FIXTURE",{exact:true}).waitFor()
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("fixture:poll-list")))
    await publish([conversation("refresh-conversation")]);await select(null)
    const before=await page.evaluate(()=>window.fixtureRefreshCount)
    await page.waitForFunction(before=>window.fixtureRefreshCount>=before+2,before,{timeout:12000})
    status="completed";version=6;seq=60
    await page.waitForTimeout(5500)
    await page.getByRole("button",{name:"新对话",exact:true}).first().click()
    menuRow=page.getByRole("button").filter({hasText:"Refresh test"}).last()
    assert.equal(await menuRow.getByText("已完成",{exact:true}).count(),1)
    await page.keyboard.press("Escape")
    const finished=await page.evaluate(()=>window.fixtureRefreshCount)
    await page.waitForTimeout(5500)
    assert.equal(await page.evaluate(()=>window.fixtureRefreshCount),finished,"terminal background work stops timed observation")
  }
  assert.deepEqual(errors,[])
  console.log("generic/sandbox approvals, unfinished run observation and async view ownership browser checks passed")
} finally {heldStop?.();heldOlder?.();for(const stream of streams) stream.end();await browser?.close();await server.close()}
