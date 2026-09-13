import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
assert.ok(executablePath)
const server = await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64")
try {
  await server.listen()
  browser=await chromium.launch({executablePath,headless:true})
  for (const scenario of ["normal", "new-draft", "navigate", "session-helper"]) {
    console.log(`image send scenario: ${scenario}`)
    const page=await browser.newPage({viewport:{width:1200,height:900}})
    const errors=[];page.on("pageerror",e=>errors.push(e.message))
    await page.addInitScript(()=>{
      localStorage.setItem("ineffable.auth.access_token","fixture-token")
      localStorage.setItem("ineffable.auth.session_id","fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at",String(Date.now()/1000+3600))
      localStorage.setItem("ineffable.auth.workspace_id","00000000-0000-0000-0000-000000000001")
      localStorage.setItem("ineffable.chat.new_conversation_draft","true")
    })
    let releaseCreate;let uploads=0;const sends=[]
    const conversation=id=>({id,title:id,current_run:null,metadata_json:{}})
    await page.route("**/gateway/v1/**",async route=>{
      const url=new URL(route.request().url());const path=url.pathname
      let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
      if(path.endsWith("auth/me"))body={user:{id:"user",role:"user",status:"active"},workspaces:[{id:"00000000-0000-0000-0000-000000000001",name:"Workspace",kind:"personal"}],current_workspace_id:"00000000-0000-0000-0000-000000000001"}
      else if(path.endsWith("conversations/list"))body={conversations:[conversation("other")]}
      else if(path.endsWith("conversations/create")) {await new Promise(resolve=>{releaseCreate=resolve});body=conversation("created")}
      else if(path.endsWith("conversations/get"))body=conversation(url.searchParams.get("conversation_id"))
      else if(path.endsWith("/messages"))body={messages:[],next_seq:0,page:{has_older:false,before:null}}
      else if(path.endsWith("models/profiles"))body={profiles:[{id:"vision",display_name:"Vision",supports_vision:true,is_default:true,enabled:true}]}
      else if(path.endsWith("/images")){uploads++;body={image:{workspace_id:"00000000-0000-0000-0000-000000000001",object_id:`00000000-0000-0000-0001-00000000000${uploads}`,version_id:`00000000-0000-0000-0002-00000000000${uploads}`,mime_type:"image/png",width:1,height:1,size_bytes:png.length}}}
      else if(path.endsWith("/image-preview"))return route.fulfill({contentType:"image/png",body:png})
      else if(path.endsWith("/send")) {
        sends.push(route.request().postDataJSON())
        if(scenario==="navigate") return route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"event",event:{seq:1,event:"model.text.delta",content:"OLD_STREAM_OUTPUT",run_id:"run",metadata:{conversation_id:"created",scope:"main",execution_epoch:1}}})}\n\n`})
        body={status:"queued",queue_len:1,pending_id:1,message_id:"message",conversation_id:"created"}
      }
      else if(path.endsWith("/observations/access"))body={allowed:false}
      await route.fulfill({json:body})
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
    await page.getByLabel("New conversation",{exact:true}).click()
    await page.waitForFunction(()=>![...document.querySelectorAll("button")].find(b=>b.textContent.includes("Add images"))?.disabled)
    const composer=page.locator("textarea")
    if(scenario==="session-helper") await page.getByRole("button",{name:"Create through session",exact:true}).click()
    else {
      await page.getByTitle("No model selected",{exact:true}).click()
      await page.getByRole("option",{name:/Vision/}).click()
      await page.locator('input[type="file"]').setInputFiles({name:"original.png",mimeType:"image/png",buffer:png})
      await page.locator('img').first().waitFor()
      await composer.fill("ORIGINAL_SEND")
      await composer.press("Enter")
    }
    const deadline=Date.now()+10000
    while(!releaseCreate && Date.now()<deadline)await new Promise(r=>setTimeout(r,20))
    if (!releaseCreate) console.error(scenario, await page.locator("body").innerText(), errors)
    assert.ok(releaseCreate,"creation must be in flight")
    if(scenario==="new-draft")await page.getByLabel("New conversation",{exact:true}).click()
    else if(scenario!=="normal") await page.getByRole("button",{name:"Select other",exact:true}).click()
    if(scenario!=="session-helper" && scenario!=="normal") {
      await composer.fill("NEW_DRAFT")
      await page.locator('input[type="file"]').setInputFiles({name:"new.png",mimeType:"image/png",buffer:png})
      await page.waitForFunction(()=>document.querySelector('img')?.getAttribute('src')?.startsWith('blob:'))
    }
    releaseCreate()
    if(scenario!=="session-helper") {
      const deadline=Date.now()+10000
      while(!sends.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20))
      assert.equal(sends.length,1,"original authorized send must continue")
      assert.equal(sends[0].conversation_id,"created")
      assert.equal(sends[0].images[0].version_id,"00000000-0000-0000-0002-000000000001")
      await page.waitForTimeout(150)
      assert.equal(await composer.inputValue(),scenario==="normal"?"":"NEW_DRAFT")
      assert.equal(await page.getByRole("button",{name:"Remove attachment",exact:true}).count(),scenario==="normal"?0:1,"new image draft must survive old acknowledgement")
      assert.equal(uploads,scenario==="normal"?1:2)
      assert.equal(await page.getByText("OLD_STREAM_OUTPUT",{exact:true}).count(),0)
    } else await page.waitForTimeout(200)
    assert.equal(await page.locator('[data-selection]').textContent(),scenario==="normal"?"created":scenario==="new-draft"?"new":"other")
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log("actual sidebar/session delayed creation and image draft isolation checks passed")
} finally {await browser?.close();await server.close()}
