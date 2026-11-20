import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { createServer } from "vite"
import { processCompletionEvents } from "./process-completion-events.mjs"

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
  const inputSources = new Map(), requestedSources = new Set()
  let lateSource
  let status="streaming",resumeMode="none",terminalMessages=0,completionScenario=false
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
    if (path.endsWith("/image-preview")) return route.fulfill({contentType:"image/png",
      body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aloAAAAASUVORK5CYII=","base64")})
    if (path.endsWith("/pending-inputs")) {
      const ids = (new URL(route.request().url()).searchParams.get("message_ids") ?? "").split(",")
      ids.forEach(id => requestedSources.add(id))
      if (ids.includes("late-report") && lateSource) await lateSource
      body.input_progress = ids.flatMap(id => inputSources.has(id) ? [inputSources.get(id)] : [])
    }
    if (path.endsWith("/messages")) {
      if (status !== "streaming") { terminalMessages++;return route.fulfill({status:500,json:{error:{message:"TERMINAL_HISTORY_UNAVAILABLE"}}}) }
      const common={conversation_id:"refresh-conversation",created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z"}
      body={messages:[{...common,id:"user",role:"user",message_type:"input",message_seq:1,timeline_seq:1,timeline_unit_id:"message:user",content:"Lifecycle task",metadata_json:{}},
        ...completionScenario?[]:[{...common,id:"process",run_id:"refresh-run",role:"assistant",message_type:"output",message_seq:2,canonical_seq:2,timeline_seq:2,timeline_unit_id:"run:refresh-run:anchor:2",content:"LIVE PROCESS CONTENT",run_status:"streaming",metadata_json:{reasoning_content:"LIVE THINKING",assistant_phase:"commentary",transcript_segment:{id:"refresh-run:1:1",turn:1,execution_epoch:1}}}]],next_seq:0,page:{has_older:false,before:null}}
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
    assert.equal(await toggle.getAttribute("aria-expanded"),"false")
    await toggle.click()
    assert.equal(await toggle.getAttribute("aria-expanded"),"true")
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
  // The real Sidebar must consolidate inline canonical handoff without a page
  // reload or a successful terminal history response. Include the same empty
  // lifecycle interleaving that occurs between production model/tool chunks.
  status="streaming";resumeMode="none";terminalMessages=0;completionScenario=true
  const subscribed = page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/subscribe"))
  await page.goto(url)
  await subscribed
  await page.getByText("Lifecycle task",{exact:true}).waitFor()
  const publish = event => {
    assert.ok(streams.size,"real Sidebar stream is connected")
    for (const stream of streams) stream.write(`data: ${JSON.stringify({type:"event",event})}\n\n`)
  }
  const events=processCompletionEvents()
  const split=events.findIndex(event=>event.metadata.canonical_reconciliation)
  for (const event of events.slice(0,split)) publish(event)
  await page.getByRole("heading",{name:"FINAL ANSWER",exact:true}).waitFor()
  assert.equal(await page.getByText("INTERMEDIATE 2",{exact:true}).isVisible(),true,"running prose is still visible")
  assert.equal(await page.locator("[data-chat-process-mode]").getAttribute("data-chat-process-mode"),"stages")
  status="completed"
  for (const event of events.slice(split)) publish(event)
  publish({run_id:"refresh-run",seq:events.at(-1).seq+1,ts_ms:1,stream:"run",scope:"run",event:"run.completed",content:null,
    metadata:{conversation_id:"refresh-conversation",execution_epoch:1,run_version:2,canonical_message_seq_end:6,canonical_reconcile_message_seq_end:6}})
  await page.waitForFunction(()=>document.querySelector("[data-chat-process-mode]")?.getAttribute("data-chat-process-mode")==="completed")
  const toggle=page.locator("[data-chat-process-toggle]")
  assert.equal(await toggle.count(),1,"completed process has a single disclosure")
  assert.equal(await toggle.getAttribute("aria-expanded"),"false")
  assert.equal(await page.getByText("INTERMEDIATE 1",{exact:true}).count(),0)
  assert.equal(await page.getByText("INTERMEDIATE 2",{exact:true}).count(),0)
  assert.equal(await page.getByText("Full final paragraph.",{exact:true}).isVisible(),true)
  assert.equal(await page.locator("table").isVisible(),true,"the entire final Markdown remains visible")
  if (process.env.CHAT_PROCESS_COMPLETION_SCREENSHOT) await page.screenshot({path:process.env.CHAT_PROCESS_COMPLETION_SCREENSHOT})
  await page.waitForFunction(()=>document.querySelector("[data-chat-process-mode]")?.getAttribute("data-chat-process-mode")==="completed")
  assert.ok(terminalMessages>0,"inline handoff completed while terminal history was unavailable")
  await toggle.click()
  assert.equal(await toggle.getAttribute("aria-expanded"),"true")
  await page.getByText("INTERMEDIATE 1",{exact:true}).waitFor({state:"attached"})
  await page.getByText("INTERMEDIATE 2",{exact:true}).waitFor({state:"attached"})
  assert.equal(await page.locator("[data-tool-call-id]").count(),2,"original tool occurrences remain available")

  // A child report arrives between two segments of the same run. Keep HTTP
  // history stale so the live result cannot accidentally pass via a reload.
  status="streaming";terminalMessages=0
  const nextStream=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith("/subscribe"))
  await page.goto(url)
  await nextStream
  await page.getByText("Lifecycle task",{exact:true}).waitFor()
  let seq=20
  const frame=(event,content,metadata={})=>publish({run_id:"refresh-run",seq:++seq,ts_ms:1,stream:"chat",scope:"main",
    event,content,metadata:{conversation_id:"refresh-conversation",...metadata}})
  const section=(turn,anchor,phase)=>({transcript_segment:{id:`refresh-run:1:${turn}`,turn,execution_epoch:1},
    response_to_message_seq:anchor,assistant_phase:phase})
  const first=section(1,1,"commentary"), last=section(2,2,"final_answer")
  frame("model.text.delta","Inspecting files",first)
  await page.getByText("Inspecting files",{exact:true}).waitFor()
  const command = {command:"sleep 25; echo done"}
  const call = {tool_call_id:"inspect",tool_name:"exec_command",full_arguments:JSON.stringify(command)}
  const commandError = "Sandbox command timed out"
  frame("tool.call.completed","",{...first,...call})
  frame("tool.result",commandError,{...first,...call,settlement_status:"failed"})
  const tool = page.locator("[data-tool-call-id]").first()
  await tool.click()
  const openTool = await tool.elementHandle()
  const focusedToolStillOpen = () => openTool.evaluate(el => el.isConnected && document.activeElement === el && el.getAttribute("aria-expanded") === "true")
  assert.ok(await focusedToolStillOpen())
  const progress={conversation_id:"refresh-conversation",message_id:"report",message_seq:2,kind:"guided",
    phase:"accepted",run_id:"refresh-run",run_state:"streaming",run_version:1,execution_epoch:1,
    agent_report:{task_id:"external-task",name:"Codex",content:"Verified the working directory",delivery_epoch:1}}
  frame("input.accepted","External agent report envelope",{input_progress:progress})
  await page.locator("[data-agent-report=external-task]").waitFor()
  assert.equal(await page.locator("[data-chat-entry-role=user]").count(),1)
  frame("model.text.delta","Directory inspected",last)
  await page.getByText("Directory inspected",{exact:true}).waitFor()
  assert.ok(await focusedToolStillOpen(),"the open tool retains its DOM node and focus across both report and response")
  await tool.evaluate(el => el.blur())
  status="completed"
  frame("tool.call.completed","",{...first,...call,canonical_reconciliation:true,canonical_message_seq:3,
    canonical_message:{content:"Inspecting files",tool_calls:[{id:call.tool_call_id,name:call.tool_name,input:command}]}})
  frame("tool.result",commandError,{...first,...call,canonical_reconciliation:true,canonical_message_seq:4,transcript_segment_complete:true,settlement_status:"failed"})
  frame("assistant.snapshot","Directory inspected",{...last,canonical_reconciliation:true,canonical_message_seq:5,transcript_segment_complete:true})
  publish({run_id:"refresh-run",seq:++seq,ts_ms:1,stream:"run",scope:"run",event:"run.completed",content:null,
    metadata:{conversation_id:"refresh-conversation",execution_epoch:1,run_version:2,canonical_message_seq_end:5,canonical_reconcile_message_seq_end:5}})
  await page.waitForFunction(()=>document.querySelector("[data-chat-process-mode]")?.getAttribute("data-chat-process-mode")==="completed")
  assert.equal(await toggle.count(),1)
  assert.equal(await toggle.getAttribute("aria-expanded"),"false")
  assert.equal(await page.getByText("Directory inspected",{exact:true}).count(),1)
  assert.equal(await page.locator("[data-tool-call-id]").count(),0,"the completed reply folds a prior tool error with the child report")
  await toggle.click()
  assert.equal(await tool.getAttribute("data-tool-status"),"failed","the original failed call returns on expansion")
  const report=page.locator("[data-agent-report=external-task]")
  await report.locator("summary").click()
  assert.equal(await report.locator("p").innerText(),"Verified the working directory")
  assert.equal(await page.getByText("External agent report envelope",{exact:true}).count(),0)
  // The server still retains both input IDs while neither appears in the HTTP tail.
  status="streaming"
  const reconnect = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/subscribe"))
  await page.goto(url)
  await reconnect
  await page.getByText("Lifecycle task",{exact:true}).waitFor()
  const legacy = {...progress}
  delete legacy.agent_report
  inputSources.set("report",progress)
  inputSources.set("guide",{...progress,message_id:"guide",message_seq:7,agent_report:null})
  frame("input.accepted","External agent report envelope",{replayed:true,input_progress:legacy})
  frame("input.accepted","Please also check the tests",{replayed:true,input_progress:{...legacy,message_id:"guide",message_seq:7}})
  await page.getByText("Please also check the tests",{exact:true}).waitFor()
  await page.locator("[data-agent-report=external-task]").waitFor()
  assert.ok(requestedSources.has("report") && requestedSources.has("guide"))
  assert.equal(await page.locator("[data-chat-entry-role=user]").count(),2)
  assert.equal(await page.getByText("External agent report envelope",{exact:true}).count(),0)
  const imageId = "00000000-0000-0000-0000-000000000001"
  inputSources.set("photo",{...progress,message_id:"photo",message_seq:8,agent_report:null,
    images:[{workspace_id:imageId,object_id:imageId,version_id:imageId,mime_type:"image/png",width:1,height:1,size_bytes:68}]})
  frame("model.text.delta","Before the photo",section(3,7,"commentary"))
  await page.getByText("Before the photo",{exact:true}).waitFor()
  frame("input.accepted","",{replayed:true,input_progress:{...legacy,message_id:"photo",message_seq:8}})
  frame("input.accepted","Envelope",{input_progress:{...progress,message_id:"photo-report",message_seq:9}})
  frame("model.text.delta","After the photo",section(4,9,"commentary"))
  const photo = page.locator('[data-chat-row-key="message:photo"] img')
  await photo.scrollIntoViewIfNeeded()
  await photo.waitFor()
  const answerRow = text => page.getByText(text,{exact:true}).locator("xpath=ancestor::*[@data-chat-entry-role='assistant'][1]")
  assert.notEqual(await answerRow("Before the photo").getAttribute("data-chat-row-key"),
    await answerRow("After the photo").getAttribute("data-chat-row-key"),"reports cannot merge across an image-only human input")

  let releaseSource
  lateSource = new Promise(resolve => { releaseSource = resolve })
  inputSources.set("late-report",{...progress,message_id:"late-report",message_seq:11,
    agent_report:{...progress.agent_report,task_id:"late-task"}})
  frame("input.accepted","old envelope",{replayed:true,input_progress:{...legacy,message_id:"late-report",message_seq:11}})
  const lateSection = section(5,11,"commentary"), lateCall = {...call,tool_call_id:"late-tool"}
  frame("tool.call.completed","",{...lateSection,...lateCall})
  frame("tool.result","Late tool output",{...lateSection,...lateCall,settlement_status:"succeeded"})
  const suffixTool = page.locator('[data-tool-call-id$=":tool:late-tool"]')
  await suffixTool.click()
  const focusedSuffix = await suffixTool.elementHandle()
  releaseSource()
  await page.locator("[data-agent-report=late-task]").waitFor()
  assert.ok(await focusedSuffix.evaluate(el=>el.isConnected && document.activeElement===el && el.getAttribute("aria-expanded")==="true"))
  await suffixTool.evaluate(el=>el.blur())
  await page.waitForFunction(() => {
    const row = document.querySelector('[data-tool-call-id$=":tool:late-tool"]')?.closest("[data-chat-entry-role]")
    return Boolean(row?.querySelector("[data-agent-report=late-task]"))
  })
  assert.deepEqual(errors,[])
  console.log("real Sidebar completes and collapses without reload; cancelled/failed/suspended processes stay visible without history")
} finally {
  await browser?.close()
  for (const stream of streams) stream.end()
  await server.close()
}
