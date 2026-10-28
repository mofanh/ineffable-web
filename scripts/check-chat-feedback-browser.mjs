import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(path => path && existsSync(path))
assert.ok(executablePath, 'Chrome required')
for (const receiptStatus of ["queued", "consuming"]) {
const streams=new Set(),requests=[],snapshots=[],heldHistory=[]
const policy={allowed_modes:['smart','clean','full','custom'],exposure_budget:{max_count:24}}
let run=null,sent=false,browser,seq=0,failRecovery=false,recoveryFailures=0,holdHistory=true,opens=0
const admission=()=>({conversation_id:'first',revision:run?.status==='completed'?2:sent?1:0,generation:0,queued_count:0,consuming_count:sent&&run?.status!=='completed'?1:0,queue_paused:false})
const conversation=()=>({id:'first',title:'First attach review',current_run_id:run?.id??null,current_run:run,admission:admission(),capability_exposure_selection:{mode:'smart'},capability_exposure_policy:{policy}})
const other={id:'other',title:'Other',current_run:null,admission:{conversation_id:'other',revision:0,generation:0,queued_count:0,consuming_count:0,queue_paused:false},capability_exposure_selection:{mode:'smart'},capability_exposure_policy:{policy}}
const server=await createServer({root:process.cwd(),logLevel:'error',server:{host:'127.0.0.1',port:0,watch:null,hmr:false},plugins:[{name:'attach-probe',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(!new URL(req.url,'http://localhost').pathname.endsWith('/subscribe'))return next()
 opens++;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': connected\n\n');streams.add(res);res.on('close',()=>streams.delete(res))
})}}]})
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath})
 const page=await browser.newPage({locale:'zh-CN',viewport:{width:1100,height:850}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  localStorage.setItem('ineffable.auth.access_token','fixture-token');localStorage.setItem('ineffable.auth.session_id','fixture-session');localStorage.setItem('ineffable.auth.access_expires_at',String(Date.now()/1000+3600));localStorage.setItem('ineffable.chat.new_conversation_draft','true')
  window.__activity=[];for(const e of ['focus','online','pageshow'])window.addEventListener(e,()=>window.__activity.push(e));document.addEventListener('visibilitychange',()=>window.__activity.push('visibility:'+document.visibilityState))
 })
 await page.route('**/gateway/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname;requests.push({path,method:route.request().method()})
  if(path.endsWith('/subscribe'))return route.continue()
  if(path.endsWith('/events') && failRecovery) { recoveryFailures++;return route.fulfill({status:503,json:{error:'fixture recovery unavailable'}}) }
  let body={items:[],profiles:[],environments:[],pending_inputs:[],events:[],next_seq:0}
  if(path.endsWith('auth/me'))body={user:{id:'owner',status:'active',role:'user'},workspaces:[]}
  else if(path.endsWith('conversations/list'))body={conversations:[conversation(),other]}
  else if(path.endsWith('conversations/preferences'))body={timezone:'Asia/Shanghai',version:0,defaults_json:{}}
  else if(path.endsWith('conversations/get'))body=u.searchParams.get('conversation_id')==='other'?other:conversation()
  else if(path.endsWith('capability-exposure/policy'))body={selection:{mode:'smart'},capability_exposure_policy:{policy}}
  else if(path.endsWith('models/profiles'))body={profiles:[{id:'model',display_name:'Model',enabled:true}]}
  else if(path.endsWith('/messages'))body={messages:sent?[{id:'input',conversation_id:'first',timeline_unit_id:'message:input',timeline_seq:1,role:'user',message_type:'input',message_seq:1,content:'FIRST_ATTACH_INPUT',created_at:'2026-10-28T00:00:00Z',metadata_json:{input_progress:{message_id:'input',conversation_id:'first',kind:'pre_input',phase:'accepted',run_id:'real-run',run_state:'streaming',execution_epoch:1,run_version:1}}}]:[],next_seq:seq,page:{has_older:false,before:null}}
  else if(path.endsWith('/observations/access'))body={allowed:false}
  else if(path.endsWith('/pending-inputs'))body={pending_inputs:[],input_progress:[],admission:admission(),can_resume:false}
  else if(path.endsWith('/send')){
   const payload=route.request().postDataJSON();sent=true;run={id:'real-run',status:'streaming',version:1,execution_epoch:1,lifecycle_seq:1,is_live:true,is_streaming:true}
   body={status:receiptStatus,queued_in_timeline:receiptStatus==='queued',pending_id:1,message_id:'input',conversation_id:'first',input_request_id:payload.input_request_id,admission:admission()}
  }
  if(path.endsWith('/messages') && u.searchParams.get('conversation_id')==='other') body={messages:[],next_seq:0,page:{has_older:false,before:null}}
  if(path.endsWith('/messages') && sent && holdHistory) await new Promise(resolve=>heldHistory.push(resolve))
  await route.fulfill({json:body})
 })
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/image-send-fixture.html`)
 await page.getByRole('button',{name:'Select first',exact:true}).click();await page.locator('textarea').waitFor()
 await page.waitForFunction(()=>document.querySelector('[data-selection]')?.textContent==='first')
 await page.evaluate(async()=>{
  await(await import('/src/lib/i18n/i18n.ts')).i18n.changeLanguage('zh');window.__activity=[]
  const {APP_NOTIFICATION_EVENT}=await import('/src/lib/app/notifications.ts')
  window.__recoveryNotifications=0
  window.addEventListener(APP_NOTIFICATION_EVENT,e=>{if(e.detail.title==='恢复会话失败')window.__recoveryNotifications++})
 })
 await page.waitForTimeout(150);await page.locator('textarea').fill('FIRST_ATTACH_INPUT');await page.locator('textarea').press('Enter')
 const deadline=Date.now()+10000;while(!streams.size&&Date.now()<deadline)await page.waitForTimeout(25)
 assert.equal(streams.size,1,'normal first send should attach to actual run')
 await page.locator('[data-chat-thinking-placeholder]').waitFor()
 await page.locator('[data-chat-row-key="message:input"]').waitFor()
 assert.equal(await page.getByText('FIRST_ATTACH_INPUT',{exact:true}).count(),1,'receipt displays input before the held history read')
 assert.equal(await page.locator('[data-slot="toast-description"]').count(),0,'ordinary first attach must stay silent')
 assert.equal(await page.getByText('页面已恢复，正在重新连接会话流…',{exact:true}).count(),0)
 assert.equal(await page.locator('form .text-destructive').count(),0,'composer has no generic error banner')
 const capture=async name=>{
  snapshots.push({name,streamCount:streams.size,...await page.evaluate(()=>({thinking:[...document.querySelectorAll('[data-chat-thinking-placeholder]')].map(x=>x.textContent),recovery:[...document.querySelectorAll('.text-destructive')].map(x=>x.textContent).filter(x=>x.includes('恢复')||x.includes('连接')),activity:window.__activity,busy:document.querySelector('textarea')?.getAttribute('aria-busy'),users:document.querySelectorAll('[data-chat-row-key="message:input"]').length}))})

 }
 await capture('04-first-attach-comment')
 assert.equal(snapshots.at(-1).recovery.length,0)
 assert.deepEqual(snapshots.at(-1).activity,[],'no page lifecycle recovery occurred')
 const emit=(event,content)=>{for(const stream of streams)stream.write(`data: ${JSON.stringify({type:'event',event:{event,seq:++seq,run_id:'real-run',stream:'chat',scope:'main',content,metadata:{conversation_id:'first',conversation_run_id:'real-run',execution_epoch:1,run_version:1,transcript_segment:{id:'real-run:1:1',turn:1,execution_epoch:1}}}})}\n\n`)}
 emit('run.started',null);await page.waitForTimeout(200);await capture('05-after-run-started')
 emit('model.text.delta','RESPONSE_TEXT');await page.getByText('RESPONSE_TEXT',{exact:true}).waitFor();await capture('06-after-model-text')
 assert.equal(snapshots.at(-1).recovery.length,0,'model events need no recovery banner')
 failRecovery=true
 for(const stream of streams)stream.end()
 await page.locator('[data-slot="toast-title"]').filter({hasText:'恢复会话失败'}).waitFor()
 const retried=Date.now()+6000
 while(recoveryFailures<2 && Date.now()<retried)await page.waitForTimeout(25)
 assert.ok(recoveryFailures>=2,'HTTP catch-up continues after the first failure')
 assert.equal(await page.locator('[data-slot="toast-title"]').filter({hasText:'恢复会话失败'}).count(),1,'one notification for continuous recovery failure')
 assert.equal(await page.locator('form .text-destructive').count(),0)
 assert.equal(await page.getByText('RESPONSE_TEXT',{exact:true}).count(),1,'a broken connection keeps received content')
 // Same run/epoch, but a successful new SSE ends the previous failure episode.
 if(receiptStatus==='queued') {
  holdHistory=false;heldHistory.splice(0).forEach(resolve=>resolve())
  const priorOpens=opens
  await page.getByRole('button',{name:'Select other',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[data-selection]')?.textContent==='other')
  await page.getByRole('button',{name:'Select first',exact:true}).click()
  const reopened=Date.now()+8000
  while((!streams.size || opens<=priorOpens) && Date.now()<reopened)await page.waitForTimeout(25)
  assert.equal(streams.size,1);assert.ok(opens>priorOpens)
  emit('model.text.delta','SECOND_SSE_CONNECTED')
  await page.getByText('SECOND_SSE_CONNECTED',{exact:false}).first().waitFor()
  assert.equal(await page.evaluate(()=>window.__recoveryNotifications),1)
  const previousFailures=recoveryFailures
  for(const stream of streams)stream.end()
  await page.waitForFunction(()=>window.__recoveryNotifications===2)
  const repeated=Date.now()+6000
  while(recoveryFailures<previousFailures+2 && Date.now()<repeated)await page.waitForTimeout(25)
  assert.ok(recoveryFailures>=previousFailures+2)
  assert.equal(await page.evaluate(()=>window.__recoveryNotifications),2,'one notification per distinct connection failure episode')
 }
 failRecovery=false
 run={...run,status:'completed',version:2,lifecycle_seq:++seq,is_live:false,is_streaming:false}
 await page.locator('[data-chat-thinking-placeholder]').waitFor({state:'hidden'})
 await page.getByRole('button',{name:'停止',exact:true}).waitFor({state:'hidden'})
 assert.deepEqual(errors,[])
 console.log('first stream attach, silent readiness, bounded recovery notifications and canonical completion checks passed')
}finally{heldHistory.splice(0).forEach(resolve=>resolve());for(const stream of streams)stream.end();await browser?.close();await server.close()}

}
