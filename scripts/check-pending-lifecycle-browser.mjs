import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath, "Chrome required")
const server = await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0,watch:null,hmr:false}})
let browser
try {
  await server.listen(); browser = await chromium.launch({executablePath,headless:true})
  const page=await browser.newPage({locale:"en-US",viewport:{width:1100,height:850}})
  const errors=[], retries=[], sends=[]
  page.on("pageerror", e=>errors.push(e.message))
  await page.addInitScript(()=>{
    localStorage.setItem("ineffable.auth.access_token","fixture-token")
    localStorage.setItem("ineffable.auth.session_id","fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at",String(Date.now()/1000+3600))
  })
  let generation=4, revision=5, head=123, processing=false
  const retryStatus=409
  const admission=()=>({conversation_id:"first",generation,revision,queued_count:0,consuming_count:processing?1:0,held_count:1,queue_paused:false})
  const conversation=()=>({id:"first",title:"Held input",current_run_id:null,current_run:null,admission:admission()})
  await page.route("**/gateway/**",async route=>{
    const url=new URL(route.request().url()), path=url.pathname
    let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
    if(path.endsWith("auth/me")) body={user:{id:"owner",status:"active",role:"user"},workspaces:[]}
    else if(path.endsWith("conversations/list"))body={conversations:[conversation()]}
    else if(path.endsWith("conversations/preferences"))body={timezone:"Asia/Shanghai",version:0,defaults_json:{}}
    else if(path.endsWith("conversations/get"))body=conversation()
    else if(path.endsWith("models/profiles"))body={profiles:[{id:"model",display_name:"Model",enabled:true}]}
    else if(path.endsWith("/messages"))body={messages:[],next_seq:0,page:{has_older:false,before:null}}
    else if(path.endsWith("/observations/access"))body={allowed:false}
    else if(path.endsWith("/pending-inputs/resume")) {
      retries.push(Object.fromEntries(url.searchParams))
      return route.fulfill({status:retryStatus,json:retryStatus===409?{error:"pending inputs changed; refresh before continuing"}:{ok:true,released:1}})
    } else if(path.endsWith("/pending-inputs"))body={admission:admission(),hold_reason:processing?null:"outcome_unknown",can_resume:!processing,blocked_by_run_status:null,blocked_by_run_id:null,blocked_by_error_code:null,pending_inputs:[{id:head,conversation_id:"first",message_id:"unknown",run_id:null,content:"UNCERTAIN_INPUT",kind:"pre_input",status:"queued",queued_in_timeline:false,hold_reason:"outcome_unknown"}]}
    else if(path.endsWith("/send")) {sends.push(route.request().postDataJSON());return route.fulfill({status:429,json:{error:"full",reason:"scheduling_user_capacity_exceeded"}})}
    await route.fulfill({json:body})
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
  await page.getByRole("button",{name:"Select first",exact:true}).click()
  await page.getByText("UNCERTAIN_INPUT",{exact:true}).waitFor()
  await page.getByRole("button",{name:"Retry execution",exact:true}).waitFor()
  assert.equal(await page.getByRole("button",{name:"Stop",exact:true}).count(),0,"held work is not a running task")
  await page.locator("textarea").fill("DRAFT_MUST_SURVIVE")
  await page.getByRole("button",{name:"Retry execution",exact:true}).click()
  await page.getByRole("alertdialog").waitFor()
  assert.equal(retries.length,0,"confirmation must precede retry")
  await page.getByRole("button",{name:"Cancel",exact:true}).click()
  assert.equal(retries.length,0)
  await page.getByRole("button",{name:"Retry execution",exact:true}).click()
  await page.getByRole("alertdialog").waitFor()
  // Server advances while the user is looking at the old confirmation.
  generation=6;revision=7;head=124
  await page.getByRole("button",{name:"Confirm",exact:true}).click()
  await page.getByText("pending inputs changed; refresh before continuing",{exact:true}).waitFor()
  assert.deepEqual(retries,[{generation:"4",head_id:"123",retry_unknown:"true"}])
  assert.equal(await page.locator("textarea").inputValue(),"DRAFT_MUST_SURVIVE")
  assert.equal(sends.length,0,"retry never resends ordinary input")
  // A normal send rejects with the structured capacity hint and preserves the draft.
  await page.locator("textarea").press("Enter")
  await page.getByText("Your execution queue is full. Wait for current work before sending or continuing.",{exact:true}).waitFor()
  assert.equal(await page.locator("textarea").inputValue(),"DRAFT_MUST_SURVIVE")
  assert.equal(sends.length,1)
  processing=true
  await page.reload()
  await page.getByRole("button",{name:"Select first",exact:true}).click()
  await page.getByText("UNCERTAIN_INPUT",{exact:true}).waitFor()
  await page.getByText("Needs attention (1)",{exact:true}).waitFor()
  assert.equal(await page.getByRole("button",{name:"Retry execution",exact:true}).count(),0,"a live predecessor must settle before continuation")
  assert.deepEqual(errors,[])
  console.log("held input, explicit retry confirmation, frozen queue identity and capacity draft checks passed")
} finally {await browser?.close();await server.close()}
