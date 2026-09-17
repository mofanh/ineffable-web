import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/chromium"].find(existsSync)
let response, ended=false
const server=await createServer({root:process.cwd(),logLevel:"error",plugins:[{name:"stream-fixture",configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url?.startsWith("/gateway/v1/conversations/send")){response=res;res.writeHead(200,{"Content-Type":"text/event-stream"});res.flushHeaders();return} next()
})}}],server:{host:"127.0.0.1",port:0}})
let browser
const workspace="00000000-0000-0000-0000-000000000001"
const root={id:"today",title:"Today",kind:"daily_root",root_ends_at:"2099-01-01T00:00:00Z",last_message_at:"2026-09-17T00:00:00Z",current_run:{id:"previous",status:"completed",is_live:false}}
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64")
try {
 await server.listen();browser=await chromium.launch({executablePath,headless:true});
 for (const status of ["completed", "failed", "cancelled"]) {
 response=undefined;ended=false;root.current_run.status=status;const page=await browser.newPage()
 const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",msg=>{if(msg.type()==="warning")console.log(msg.text())})
 await page.addInitScript(()=>{
 localStorage.setItem("ineffable.auth.access_token","fixture-token");localStorage.setItem("ineffable.auth.session_id","fixture-session");localStorage.setItem("ineffable.auth.access_expires_at",String(Date.now()/1000+3600));localStorage.setItem("ineffable.chat.new_conversation_draft","true")
 })
 await page.route("**/gateway/v1/**",async route=>{
 const url=new URL(route.request().url()),path=url.pathname
 if(path.endsWith("/send"))return route.continue()
 let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
 if(path.endsWith("auth/me"))body={user:{id:"user",role:"user",status:"active"},workspaces:[{id:workspace,name:"Workspace",workspace_type:"personal"}],current_workspace_id:workspace}
 else if(path.endsWith("conversations/list"))body={conversations:[root]}
 else if(path.endsWith("conversations/today")||path.endsWith("conversations/get"))body=root
 else if(path.endsWith("/messages"))body={messages:[{id:"old",conversation_id:"today",role:"user",content:"OLD_HISTORY",message_seq:1,created_at:"2026-09-17T00:00:00Z"}],next_seq:0,run_activities:[{run_id:"previous",execution_epoch:0,seq:0,activity_seq:0,compacting:false}],page:{has_older:false,before:null}}
 else if(path.endsWith("models/profiles"))body={profiles:[{id:"vision",display_name:"Vision",supports_vision:true,is_default:true,enabled:true}]}
 else if(path.endsWith("/images"))body={image:{workspace_id:workspace,object_id:"00000000-0000-0000-0000-000000000002",version_id:"00000000-0000-0000-0000-000000000003",mime_type:"image/png",width:1,height:1,size_bytes:png.length}}
 else if(path.endsWith("/image-preview"))return route.fulfill({contentType:"image/png",body:png})
 else if(path.endsWith("/observations/access"))body={allowed:false}
 await route.fulfill({json:body})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
 await page.getByTitle("No model selected",{exact:true}).click();await page.getByRole("option",{name:/Vision/}).first().click()
 await page.locator('input[type="file"]').setInputFiles({name:"original.png",mimeType:"image/png",buffer:png})
 await page.locator('img').first().waitFor();await page.locator("textarea").fill("READ_IMAGE");await page.locator("textarea").press("Enter")
 const deadline=Date.now()+10000;while(!response && Date.now()<deadline)await page.waitForTimeout(20);assert.ok(response)
 let seq=0;const send=(event,content,extra={})=>response.write(`data: ${JSON.stringify({run_id:"run",seq:++seq,ts_ms:Date.now(),stream:event.startsWith("model.")?"agentic":"chat",event,scope:event.startsWith("model.")?"run":"main",content,metadata:{conversation_id:"today",conversation_run_id:"run",transcript_segment:{id:"run:0:1",turn:1,execution_epoch:0},...extra}})}\n\n`)
 send("run.started",null,{trigger_message_id:"input"});await page.waitForTimeout(200);send("model.text.delta","FIRST_LIVE_CHUNK");
 await page.getByText("FIRST_LIVE_CHUNK",{exact:true}).waitFor({timeout:3000});assert.equal(ended,false)
 send("model.text.delta","_SECOND");await page.getByText("FIRST_LIVE_CHUNK_SECOND",{exact:true}).waitFor({timeout:3000})
 send("run.completed");ended=true;response.end();assert.deepEqual(errors,[]);await page.close();console.log(`native image streaming browser regression passed after ${status}`)
 }
} finally {response?.end();await browser?.close();await server.close()}
