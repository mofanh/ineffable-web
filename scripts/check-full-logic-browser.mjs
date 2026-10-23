import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath=[process.env.CHROME_PATH,"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","/usr/bin/chromium"].find(p=>p&&existsSync(p))
const server=await createServer({root:process.cwd(),logLevel:"error",server:{host:"127.0.0.1",port:0}})
let browser
try {
 await server.listen(); const origin=`http://127.0.0.1:${server.httpServer.address().port}`
 browser=await chromium.launch({executablePath,headless:true})
 const { emptyModel }=await server.ssrLoadModule("/src/pages/system-management/shared.tsx")
 const setup=async(page)=>{
  await page.addInitScript(()=>{localStorage.setItem("ineffable.auth.access_token","test-token");localStorage.setItem("ineffable.auth.session_id","test-session");localStorage.setItem("ineffable.auth.access_expires_at",String(Date.now()/1000+3600))})
 }
 // Exact control identity, label focus, unique IDs and error/description association.
 {
  const page=await browser.newPage();await page.goto(`${origin}/scripts/full-logic-fixture.html`)
  for(const name of ["Name 1","Name 2","Choice"]) {
   const control=page.getByLabel(name,{exact:true});await control.waitFor()
   await page.locator("label").filter({hasText:new RegExp(`^${name}$`)}).click()
   if(name === "Choice") { assert.equal(await control.getAttribute("aria-expanded"),"true"); await page.keyboard.press("Escape") }
   else assert.ok(await control.evaluate(el=>document.activeElement===el),`${name} label focuses its actual control`)
  }
  assert.equal(await page.getByLabel("Name 1",{exact:true}).getAttribute("aria-invalid"),"true")
  assert.ok((await page.getByLabel("Name 1",{exact:true}).getAttribute("aria-describedby")).split(" ").length===2)
  assert.equal(await page.getByRole("group",{name:"Range",exact:true}).count(),1)
  const ids=await page.locator("[id]").evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(ids.length,new Set(ids).size)
  await page.close()
 }
 // Native admin forms: duplicate submit, A response after opening B, and label/control wiring.
 for(const section of ["models","secrets"]) for(const outcome of ["replacement","success","failure"]) {
  const page=await browser.newPage();page.on("pageerror",e=>console.error("pageerror",e.message));await setup(page);let release,entered, writes=0
  const gate=new Promise(resolve=>{release=resolve}), held=new Promise(resolve=>{entered=resolve})
  const models=["a","b"].map(id=>({...emptyModel,id,display_name:`Item ${id}`,endpoint_kind:"openai_images",metadata_json:{image_generation:{enabled:true,quality:"medium",reservation_credits:1,max_calls_per_run:3}},archived_at:null}))
  const secrets=["a","b"].map(id=>({secret_ref:`item-${id}`,status:"active",has_secret:true,metadata_json:{}}))
  await page.route("**/gateway/v1/**",async route=>{
   const path=new URL(route.request().url()).pathname, write=route.request().method()!=="GET"
   let body={items:[],profiles:[],environments:[],conversations:[],events:[],usage:[],insights:[],secrets:[],models:[],points:[],range:"7d",granularity:"day",has_data:false}
   if(write){writes++;entered();await gate;body=section==="models"?{profile:{...models[0],...route.request().postDataJSON()}}:{secret:secrets[0]}}
   else if(path.endsWith("auth/me"))body={user:{id:"admin",role:"admin",email:"admin@example.com",display_name:"Admin",status:"active"},workspaces:[]}
   else if(path.endsWith("admin/models"))body={profiles:models}
   else if(path.endsWith("llm/secrets"))body={secrets,models:[]}
   await route.fulfill({status:write && outcome==="failure"?400:200,json:write && outcome==="failure"?{error:"save rejected"}:body})
  })
  await page.goto(`${origin}/scripts/admin-editor-fixture.html?page=${section}&language=en`)
  const row=id=>page.getByRole("row",{includeHidden:true}).filter({hasText:section==="models"?`Item ${id}`:`item-${id}`}).first()
  await row("a").getByRole("button",{name:/edit/i}).click()
  const dialog=page.getByRole("dialog");await dialog.waitFor()
  const labels=await dialog.locator("label[for]").evaluateAll(labels=>labels.map(label=>({text:label.textContent,id:label.htmlFor,exists:!!document.getElementById(label.htmlFor)})))
  assert.ok(labels.length>0&&labels.every(label=>label.exists),JSON.stringify(labels))
  await dialog.locator("form").evaluate(form=>{for(let i=0;i<2;i++)form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))})
  await held;assert.equal(writes,1,"same opening cannot submit twice")
  const fields=dialog.locator("form input,form textarea,form button")
  for(const field of await fields.all()) assert.equal(await field.isDisabled(),true,"save freezes the submitted draft")
  if(section==="models") {
   const quality=dialog.getByRole("combobox")
   const box=await quality.boundingBox();assert.ok(box)
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
   assert.equal(await quality.getAttribute("aria-expanded"),"false","saving disables Radix pointer handlers and portals")
   assert.equal(await page.getByRole("listbox").count(),0)
  }
  if(outcome!=="replacement") {
   const draft=await dialog.locator("input").evaluateAll(inputs=>inputs.map(input=>input.value))
   const response=page.waitForResponse(response=>response.request().method()!=="GET");release();await response
   if(outcome==="success")await dialog.waitFor({state:"hidden"})
   else {
    await page.locator('[role="alert"]').filter({hasText:"save rejected"}).waitFor()
    assert.deepEqual(await dialog.locator("input").evaluateAll(inputs=>inputs.map(input=>input.value)),draft,"failed save keeps the submitted draft")
    assert.equal(await dialog.getByRole("button",{name:/save/i}).isEnabled(),true)
    assert.equal(await dialog.locator("fieldset").isDisabled(),false)
   }
   await page.close();continue
  }
  await row("b").getByRole("button",{name:/edit/i,includeHidden:true}).evaluate(button=>button.click())
  release();await page.waitForResponse(response=>response.request().method()!=="GET")
  const expected=section==="models"?"Item b":"item-b"
  await page.waitForFunction(value=>[...document.querySelectorAll('[role="dialog"] input')].some(input=>input.value===value),expected)
  assert.equal(await dialog.isVisible(),true,"A save cannot close B's editor")
  assert.equal(await dialog.getByRole("button",{name:/save/i}).isEnabled(),true,"old finally cannot leave new editor busy")
  await page.close()
 }
 // JSON body identity gate and the launch page's ownership after unmount/logout.
 for(const change of ["unmount","logout","target"]) {
  const page=await browser.newPage();await setup(page)
  await page.route("**/gateway/v1/**",async route=>{const path=new URL(route.request().url()).pathname;await route.fulfill({json:path.endsWith("auth/me")?{user:{id:"admin",status:"active"},workspaces:[]}:{conversations:[]}})})
  await page.addInitScript(()=>{
   const fetch=window.fetch;window.tickets=[]
   window.fetch=async(url,options)=>{
    if(!String(url).includes("/sandbox/exposures/"))return fetch(url,options)
    const index=window.tickets.length
    return new Response(new ReadableStream({start(controller){window.tickets.push(()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify({launch_url:`https://unexpected-${index}.invalid/`,expires_at:"2099-01-01"})));controller.close()})}}))
   }
  })
  await page.goto(`${origin}/scripts/full-logic-fixture.html?preview`);await page.waitForFunction(()=>window.tickets?.length===1)
  if(change==="unmount")await page.evaluate(()=>window.navigate("/"))
  else if(change==="target") {await page.evaluate(()=>window.navigate("/sandbox-preview/00000000-0000-4000-8000-000000000002"));await page.waitForFunction(()=>window.tickets.length===2)}
  else await page.evaluate(()=>window.session.logout())
  await page.evaluate(()=>window.tickets[0]());await page.waitForTimeout(100)
  assert.ok(page.url().startsWith(origin),"a stale ticket cannot navigate")
  if(change==="target") {await page.evaluate(()=>window.session.logout());await page.evaluate(()=>window.tickets[1]());await page.waitForTimeout(100);assert.ok(page.url().startsWith(origin))}
  await page.close()
 }
 const {workspaceFileCapabilities}=await server.ssrLoadModule("/src/features/workspace/model/file-capabilities.ts")
 for(const mime of ["text/plain; charset=utf-8","application/json","application/xml","application/javascript","application/yaml","application/x-yaml",null])assert.equal(workspaceFileCapabilities({kind:"file",mime_type:mime}).duplicate,true,mime)
 for(const mime of ["image/png","application/octet-stream","application/sql","application/ld+json","application/json; charset=utf-8"])assert.equal(workspaceFileCapabilities({kind:"file",mime_type:mime}).duplicate,false,mime)
 // PNG export preserves bytes; unsupported folder descendants are rejected before creates.
 {
  const page=await browser.newPage();await setup(page)
  const workspace="00000000-0000-0000-0000-000000000001"
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64")
  const folder={id:"folder",workspace_id:workspace,parent_id:null,kind:"folder",name:"folder",path:"folder",mime_type:null}
  const image={id:"image",workspace_id:workspace,parent_id:"folder",kind:"file",name:"sample.png",path:"folder/sample.png",mime_type:"image/png",current_version_id:"v-image"}
  let writes=0,textReads=0
  await page.route("**/gateway/v1/**",async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   if(route.request().method()!=="GET")writes++
   let body={conversations:[],invitations:[],objects:[],next_cursor:null}
   if(path.endsWith("auth/me"))body={user:{id:"actor",role:"user",status:"active"},workspaces:[{id:workspace,workspace_type:"personal",name:"Workspace"}]}
   else if(path.endsWith("/access"))body={workspace:{id:workspace,workspace_type:"personal",name:"Workspace",status:"active"},membership:{role:"owner"},can_write:true}
   else if(path.endsWith("/directory"))body={objects:url.searchParams.get("path")?[image]:[folder],next_cursor:null}
   else if(path.endsWith("/download"))return route.fulfill({contentType:"image/png",body:png})
   else if(path.endsWith("/content"))textReads++
   await route.fulfill({json:body})
  })
  await page.goto(`${origin}/scripts/workspace-image-fixture.html?tree=1&lang=en`)
  await page.getByRole("button",{name:"folder",exact:true}).click()
  await page.getByRole("button",{name:"Actions for sample.png",exact:true}).click()
  await page.getByRole("menuitem",{name:"Rename",exact:true}).waitFor()
  assert.equal(await page.getByRole("menuitem",{name:"Duplicate",exact:true}).count(),0)
  const download=page.waitForEvent("download")
  await page.getByRole("menuitem",{name:"Export",exact:true}).click()
  const saved=await download;assert.deepEqual(readFileSync(await saved.path()),png)
  await page.getByRole("button",{name:"Actions for folder",exact:true}).click()
  await page.getByRole("menuitem",{name:"Duplicate",exact:true}).click()
  await page.getByText(/cannot be duplicated/).waitFor()
  assert.equal(writes,0,"preflight must fail before creating a partial folder")
  assert.equal(textReads,0,"binary actions must never use the UTF-8 content endpoint")
  await page.close()
 }
 // Both Gateway YAML MIME types work as individual files and folder descendants.
 for(const mime of ["application/yaml","application/x-yaml"]) for(const target of ["file","folder"]) {
  const page=await browser.newPage();await setup(page)
  const workspace="00000000-0000-0000-0000-000000000001", writes=[]
  const folder={id:"folder",workspace_id:workspace,parent_id:null,kind:"folder",name:"folder",path:"folder",mime_type:null}
  const yaml={id:"yaml",workspace_id:workspace,parent_id:"folder",kind:"file",name:"config.yaml",path:"folder/config.yaml",mime_type:mime,current_version_id:"v-yaml"}
  await page.route("**/gateway/v1/**",async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   let body={conversations:[],invitations:[],objects:[],next_cursor:null}
   if(route.request().method()!=="GET") {
    const payload=route.request().postDataJSON();writes.push({path,payload})
    body={object:{...(path.endsWith("/files")?yaml:folder),...payload,id:`created-${writes.length}`},version:{id:"created-version"}}
   } else if(path.endsWith("auth/me"))body={user:{id:"actor",role:"user",status:"active"},workspaces:[{id:workspace,workspace_type:"personal",name:"Workspace"}]}
   else if(path.endsWith("/access"))body={workspace:{id:workspace,workspace_type:"personal",name:"Workspace",status:"active"},membership:{role:"owner"},can_write:true}
   else if(path.endsWith("/directory"))body={objects:url.searchParams.get("path")?[yaml]:[folder],next_cursor:null}
   else if(path.endsWith("/content"))body={object:yaml,version:{id:"v-yaml"},content:"key: value\n"}
   await route.fulfill({json:body})
  })
  await page.goto(`${origin}/scripts/workspace-image-fixture.html?tree=1&lang=en`)
  await page.getByRole("button",{name:"folder",exact:true}).click()
  await page.getByRole("button",{name:`Actions for ${target==="file"?"config.yaml":"folder"}`,exact:true}).click()
  await page.getByRole("menuitem",{name:"Duplicate",exact:true}).click()
  await page.getByText("Copy created",{exact:true}).waitFor()
  assert.equal(writes.length,target==="file"?1:2)
  const file=writes.find(write=>write.path.endsWith("/files"))
  assert.equal(file.payload.mime_type,mime);assert.equal(file.payload.content,"key: value\n")
  if(target==="folder")assert.equal(file.payload.parent_id,"created-1")
  await page.close()
 }
 // A service-owned fact refreshes the tree regardless of the current tool label.
 {
  const page=await browser.newPage();await page.goto(`${origin}/scripts/full-logic-fixture.html`)
  const changes=await page.evaluate(async()=>{
   const {notifyWorkspaceOutputEvent}=await import("/src/features/chat/model/workspace-tool-events.ts")
   const events=[];window.addEventListener("ineffable:workspace-objects-changed",e=>events.push(e.detail))
   const base={event:"tool.result",metadata:{tool_name:"workspace",settlement_status:"succeeded",workspace_changes:[{workspace_id:"space",object_id:"file",path:"notes/a.md",version_id:"v1",action:"write_file"}]}}
   notifyWorkspaceOutputEvent(base)
   notifyWorkspaceOutputEvent({...base,metadata:{...base.metadata,tool_name:"tools",workspace_changes:[{...base.metadata.workspace_changes[0],action:"create_folder"}]}})
   notifyWorkspaceOutputEvent({...base,metadata:{...base.metadata,settlement_status:"failed"}})
   notifyWorkspaceOutputEvent({event:"tool.result",content:JSON.stringify({object:{workspace_id:"fake"}}),metadata:{tool_name:"workspace_write_file"}})
   return events
  })
  assert.deepEqual(changes.map(c=>c.action),["write_file","create_folder"])
  await page.close()
 }
 console.log("full logic browser invariants passed")
} finally {await browser?.close();await server.close()}
