import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history"
import type { AssistantEntry } from "../src/features/chat/gateway-chat-types"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

const phases = ["commentary", "partial_answer", "final_answer", undefined]
const bodies = ["PROCESS ONLY\n\n" + "Checking implementation details.\n\n".repeat(12), "STAGE ANSWER", "FINAL ANSWER", "UNKNOWN OLD ANSWER"]
const messages = phases.map((phase, index) => ({
  id:`fixture-${index}`, conversation_id:"process-fixture",run_id:"process-run",role:"assistant",message_type:"output",
  content:bodies[index], timeline_seq:index+1,timeline_unit_id:"run:process-run:anchor:1",canonical_seq:index+1,
  created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z",run_status:"completed",
  metadata_json:{ assistant_phase:phase, transcript_segment:{id:`process-run:0:${index+1}`,turn:index+1,execution_epoch:0} },
}))
const base = mapConversationMessagesToEntries(messages).find(entry => entry.role === "assistant") as AssistantEntry
Object.assign(base, { runDurationMs: 671234,runStatus:"completed" })
base.pane = { ...base.pane, blockOrder:[...base.pane.blockOrder],blocks:{...base.pane.blocks}, tools:{...base.pane.tools} }
for (let i=0;i<60;i++) {
  const id = `tool-${i}`
  base.pane.blockOrder.splice(1+i,0,id)
  base.pane.blocks[id] = {id,type:"tool",toolId:id}
  base.pane.tools[id] = {id,name:"workspace",input:JSON.stringify({command:`read /file-${i}.md`}),output:"tool result",status:"succeeded"}
}
const artifact = "artifact"
base.pane.blockOrder.push(artifact)
base.pane.blocks[artifact] = {id:artifact,type:"tool",toolId:artifact}
base.pane.tools[artifact] = {id:artifact,name:"workspace",input:"{}",status:"succeeded",output:JSON.stringify({workspace_id:"workspace",object_id:"object",path:"notes/result.md",mime_type:"text/markdown",version_id:"version",size_bytes:2048})}

function Fixture() {
  const [status,setStatus] = React.useState("completed")
  const [canonical,setCanonical] = React.useState(true)
  const [mount,setMount] = React.useState(0)
  const [longFinal,setLongFinal] = React.useState(false)
  const viewport = React.useRef<HTMLDivElement>(null)
  const entry = React.useMemo(() => {
    const next: AssistantEntry = {...base,id:`fixture-row-${mount}`,runStatus:status,status:status === "streaming" ? "streaming" : "done"}
    if (longFinal) {
      const id = next.pane.blockOrder.find(id => next.pane.blocks[id]?.type === "text" && next.pane.blocks[id].content === "FINAL ANSWER")!
      next.pane = {...next.pane,blocks:{...next.pane.blocks,[id]:{...next.pane.blocks[id],content:"FINAL ANSWER\n\n" + "A newly completed conclusion with supporting details.\n\n".repeat(120)}}}
    }
    if (!canonical) next.segments = Object.fromEntries(Object.entries(next.segments ?? {}).map(([id,segment])=>[id,{...segment,canonicalMessageSeqEnd:undefined}]))
    if (status === "awaiting_human") {
      const id = "question"
      next.pane = {...next.pane,blockOrder:[...next.pane.blockOrder,id],blocks:{...next.pane.blocks,[id]:{id,type:"tool",toolId:id}},tools:{...next.pane.tools,[id]:{
        id,protocolId:id,needId:"fixture-need",runId:"process-run",name:"request_user_input",status:"waiting",
        input:JSON.stringify({questions:[{id:"q",question:"Continue this task?",options:[{label:"Continue",description:"Keep working"}]}]}),output:"",
      }}}
    }
    return next
  },[status,canonical,mount,longFinal])
  return <div className="flex h-screen min-w-0 flex-col">
    <div className="flex shrink-0 flex-wrap gap-2 text-xs" data-fixture-controls>
      {["completed","streaming","failed","cancelled","awaiting_human","suspended"].map(value=><button key={value} onClick={()=>setStatus(value)}>{value}</button>)}
      <button onClick={()=>setCanonical(value=>!value)}>canonical</button>
      <button onClick={()=>setMount(value=>value+1)}>remount-row</button>
      <button onClick={()=>{setLongFinal(true);setStatus("completed")}}>finish-long</button>
      <button onClick={()=>void i18n.changeLanguage(i18n.language.startsWith("en") ? "zh-CN" : "en-US")}>language</button>
      <button onClick={()=>document.documentElement.classList.toggle("dark")}>theme</button>
    </div>
    <div className="min-h-0 flex-1">
    <ChatMessageList entries={[entry]} hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null}
      isAwaitingResponse={status === "streaming"} isLoadingInitial={false} showScrollToBottom={false} scrollViewportRef={viewport}
      onViewportScroll={()=>{}} onLoadOlderConversationMessagesPage={()=>{}} onScrollToBottomClick={()=>{}}
      onStreamingContentProgress={()=>{}} onApproveApproval={()=>{}} onRejectApproval={()=>{}}
      activeHumanRunId={status === "awaiting_human" ? "process-run" : null} activeHumanNeedId={status === "awaiting_human" ? "fixture-need" : null}
      activeHumanNeedKind={status === "awaiting_human" ? "user_input" : null} onSubmitUserInput={async()=>{}} isFullScreen />
    </div>
  </div>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><TooltipProvider><Fixture /></TooltipProvider></MemoryRouter>)
