import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
assert.ok(executablePath)
const server=await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
try {
 await server.listen();browser=await chromium.launch({executablePath,headless:true})
 const page=await browser.newPage({viewport:{width:390,height:844}})
 const errors=[];page.on("pageerror",e=>errors.push(e.message))
 await page.addInitScript(()=>{
  localStorage.setItem("ineffable.auth.access_token","test-token")
  localStorage.setItem("ineffable.auth.session_id","test-session")
  localStorage.setItem("ineffable.auth.access_expires_at",String(Date.now()/1000+3600))
 })
 const runtime={model_profile_id:"model-a",workspace_id:null,sandbox:{environment_id:"sandbox-offline"},capability_exposure:{mode:"smart"}}
 let nextSaveStatus=400;let connections=[];let saved;let patches=0;let delayedRefresh=false;let releaseRefresh;let refreshStarted=false
 await page.route("**/gateway/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url());let body={}
  if(url.pathname.endsWith("/channel-connections")&&req.method()==="POST") {
   if(nextSaveStatus) {
    const status=nextSaveStatus;nextSaveStatus=0
    if(status===400) assert.deepEqual(req.postDataJSON().runtime_config.sandbox,{environment_id:"sandbox-offline"})
    await route.fulfill({status,json:{error:status===400?"selected sandbox is currently unavailable":"service unavailable"}})
    return
   }
   saved=req.postDataJSON();assert.equal(saved.enabled,undefined);assert.equal(saved.protocol,"qqbot");assert.equal(saved.client_secret,"fixture-secret")
   assert.equal(saved.owner_user_id,undefined)
   assert.deepEqual(saved.runtime_config,{...runtime,sandbox:null})
   const connection={id:"12a45678-1234-4234-9234-123456789abc",...saved,runtime_config_json:saved.runtime_config,enabled:false,connected:false,webhook_verified_at:new Date().toISOString(),last_received_at:null}
   connections=[connection];body={connection,token:"one-time-test-credential"}
  } else if(url.pathname.endsWith("/channel-connections")) body=connections
  else if(url.pathname.includes("/channel-connections/")&&req.method()==="PATCH") {
   patches++;saved=req.postDataJSON();assert.deepEqual(Object.keys(saved).sort(),["allowed_group_ids","allowed_private_ids","display_name","enabled","runtime_config"])
   connections=[{...connections[0],...saved,runtime_config_json:saved.runtime_config}];body=connections[0]
  } else if(url.pathname.includes("/channel-connections/")) body={chats:[{chat_type:"private",external_chat_id:"456",conversation_id:"qq-conversation"}],deliveries:[{status:"outcome_unknown",count:1}]}
  else if(url.pathname.includes("/conversations/preferences")) body={timezone:"Asia/Shanghai",version:1,defaults_json:runtime}
  else if(url.pathname.includes("auth/me")) body={user:{id:"owner",display_name:"Owner"},workspaces:[]}
  else if(url.pathname.includes("conversations/list")) {
   if(delayedRefresh){refreshStarted=true;await new Promise(resolve=>{releaseRefresh=resolve})}
   body={conversations:[{id:"qq-conversation",title:"QQ"},{id:"other",title:"Other"}]}
  }
  else if(url.pathname.includes("models/profiles")) body={profiles:[{id:"model-a",display_name:"Model A"}]}
  else if(url.pathname.includes("workspaces/list")) body={workspaces:[]}
  else if(url.pathname.includes("sandbox/environments")) body={providers:[{provider_id:"offline-provider",display_name:"Offline sandbox",status:"offline"}],environments:[{environment_id:"sandbox-offline",provider_id:"offline-provider",status:"offline"}]}
  else if(url.pathname.includes("capability-exposure/policy")) body={capability_exposure_policy:{policy:{allowed_modes:["smart","clean","custom","full"],exposure_budget:{max_count:24}}}}
  else if(url.pathname.includes("capability-catalog")) body={items:[]}
  await route.fulfill({json:body})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/channels-fixture.html`)
 await page.getByRole("button",{name:"Connect QQ bot",exact:true}).click()
 let dialog=page.getByRole("dialog",{name:"Connect QQ bot",exact:true})
 await dialog.getByText("Model A",{exact:true}).waitFor()
 await dialog.locator("input").nth(0).fill("My QQ")
 await dialog.locator("input").nth(1).fill("123456")
 await dialog.locator("input[type=password]").fill("fixture-secret")
 await dialog.locator("textarea").nth(0).fill("456\n789\n")
 await dialog.getByRole("button",{name:"Save",exact:true}).click()
 await dialog.getByText("The sandbox is offline or unavailable. Start it, or select no sandbox before saving.",{exact:true}).waitFor()
 assert.equal(await dialog.locator("input").first().isEnabled(),true)
 assert.equal(await dialog.getByRole("button",{name:"Save",exact:true}).isEnabled(),true)
 await dialog.getByRole("button",{name:"Choose a Sandbox environment: Offline sandbox",exact:true}).click()
 await page.getByRole("option",{name:"None",exact:true}).click()
 await dialog.getByRole("button",{name:"Save",exact:true}).click()
 const secret=page.getByRole("dialog",{name:"Configure official bot callback"})
 await secret.waitFor()
 assert.equal(saved.allowed_private_ids.length,2)
 const url=await secret.locator("textarea").first().inputValue()
 assert.match(url,/^http:\/\/127.0.0.1:\d+\/gateway\/v1\/channel-connections\//)
 assert.equal(await secret.locator("textarea").count(),1)
 assert.ok(url.endsWith("/qqbot/webhook"))
 assert.equal(await secret.getByText("fixture-secret",{exact:true}).count(),0)
 await secret.getByRole("button",{name:"Close",exact:true}).click()
 assert.equal(await page.getByText("one-time-test-credential",{exact:true}).count(),0)
 await page.getByRole("button",{name:"Edit connection",exact:true}).click()
 dialog=page.getByRole("dialog",{name:"Edit connection",exact:true})
 await dialog.getByRole("switch").click()
 await dialog.getByRole("button",{name:"Save",exact:true}).click()
 await dialog.waitFor({state:"hidden"})
 assert.equal(patches,1);assert.equal(saved.enabled,true)
 await page.getByText("Enabled",{exact:true}).waitFor()
 await page.getByRole("button",{name:"Chats and delivery"}).click()
 await page.getByText("Unknown outcome · 1",{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.evaluate(()=>{window.fixtureOpenCount=0;window.addEventListener("ineffable:right-sidebar:open",()=>window.fixtureOpenCount++)})
 await page.getByRole("button",{name:"Private",exact:false}).click()
 await page.waitForFunction(()=>window.fixtureOpenCount===1)
 assert.equal(await page.locator("[data-selection]").textContent(),"qq-conversation")
 await page.getByRole("button",{name:"Chats and delivery"}).click()
 delayedRefresh=true
 await page.getByRole("button",{name:"Private",exact:false}).click()
 await page.waitForTimeout(100)
 assert.ok(refreshStarted)
 await page.getByRole("dialog").getByRole("button",{name:"Close",exact:true}).click()
 await page.getByRole("button",{name:"Select other fixture"}).click()
 const response=page.waitForResponse(r=>r.url().includes("conversations/list"))
 releaseRefresh();await response
 await page.waitForTimeout(50)
 assert.equal(await page.locator("[data-selection]").textContent(),"other")
 assert.equal(await page.evaluate(()=>window.fixtureOpenCount),1)
 nextSaveStatus=503
 await page.getByRole("button",{name:"Connect QQ bot",exact:true}).click()
 dialog=page.getByRole("dialog",{name:"Connect QQ bot",exact:true})
 await dialog.locator("input").nth(0).fill("Uncertain QQ")
 await dialog.locator("input").nth(1).fill("456789")
 await dialog.locator("input[type=password]").fill("fixture-secret")
 await dialog.getByRole("button",{name:"Save",exact:true}).click()
 await dialog.getByText("service unavailable",{exact:true}).waitFor()
 assert.equal(await dialog.locator("input").first().isEnabled(),false)
 assert.equal(await dialog.getByRole("button",{name:"Save",exact:true}).isEnabled(),false)
 assert.deepEqual(errors,[])
 console.log("owned channel configuration, credentials, payload and mobile checks passed")
} finally {await browser?.close();await server.close()}
