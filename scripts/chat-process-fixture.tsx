import * as React from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector"
import type { AssistantEntry } from "../src/features/chat/gateway-chat-types"
import type { GatewayChatStreamEvent } from "../src/lib/api/chat/gateway-events"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

const snapshots: Record<string, AssistantEntry> = {}
let current: AssistantEntry | undefined
let sequence = 0
function emit(turn: number, kind: string, content: string, extra = {}) {
  const event: GatewayChatStreamEvent = {run_id:"process-run",seq:++sequence,ts_ms:1,stream:"agentic",event:kind,scope:"main",content,
    metadata:{transcript_segment:{id:`process-run:1:${turn}`,turn,execution_epoch:1},...extra}}
  current = projectConversationOutputEvent(current,event,"process-run")
}
function save(name: string) { snapshots[name] = current! }
emit(1,"model.reasoning.delta","THINK ONE\n\nChecking implementation details.\n\n".repeat(8))
emit(1,"tool.call.started","",{tool_call_id:"read-0",tool_name:"workspace.read"})
save("work-1")
for (let i=0;i<60;i++) {
  if (i) emit(1,"tool.call.started","",{tool_call_id:`read-${i}`,tool_name:"workspace.read"})
  emit(1,"tool.call.completed","",{tool_call_id:`read-${i}`,tool_name:"workspace.read",full_arguments:JSON.stringify({path:`/file-${i}.md`})})
  emit(1,"tool.result","tool result",{tool_call_id:`read-${i}`,tool_name:"workspace.read",settlement_status:"succeeded"})
}
emit(2,"model.text.delta","PROCESS ONLY\n\n"+"Checking implementation details.\n\n".repeat(12),{assistant_phase:"commentary"})
save("body-1")
emit(2,"model.text.delta","More details.")
save("body-1-more")
emit(3,"model.reasoning.delta","THINK TWO")
emit(3,"tool.call.started","",{tool_call_id:"second",tool_name:"workspace.read"})
emit(3,"tool.call.completed","",{tool_call_id:"second",tool_name:"workspace.read",full_arguments:JSON.stringify({path:"/notes/result.md"})})
save("work-2")
emit(3,"tool.result","second result",{tool_call_id:"second",tool_name:"workspace",settlement_status:"succeeded"})
emit(4,"model.text.delta","STAGE ANSWER",{assistant_phase:"partial_answer"})
save("body-2")
emit(5,"model.text.delta","UNKNOWN OLD ANSWER")
save("unknown")
emit(6,"model.reasoning.delta","FINAL THINKING")
emit(6,"model.text.delta","FINAL ANSWER\n\nFinal details.\n\n| Item | Result |\n| --- | --- |\n| Check | Passed |",{assistant_phase:"final_answer"})
save("final-stream")
current=undefined
emit(1,"model.reasoning.delta","CURRENT THINKING")
save("plugin-thinking")
emit(1,"model.stream.other","",{web_view:{schemaVersion:1,pluginId:"ineffable.web.default",renderer:"text",nodeId:"declared-text",status:"settled",payload:{content:"DECLARED PLUGIN",streaming:false},fallback:{title:"Plugin"}}})
save("declared-plugin")
emit(2,"model.text.delta","Actual prose",{assistant_phase:"commentary"})
save("plugin-body")
current=undefined
emit(1,"model.reasoning.delta","先检查配置文件与端口监听状态，再测试网络连接。")
emit(1,"model.text.delta","我先查看当前配置和端口情况。",{assistant_phase:"commentary"})
for (const [index,path] of ["/config/proxy.toml","/config/network.toml"].entries()) {
  emit(2,"tool.call.completed","",{tool_call_id:`config-${index}`,tool_name:"workspace.read",full_arguments:JSON.stringify({path})})
  emit(2,"tool.result",JSON.stringify({window:{start_line:1,end_line:20}}),{tool_call_id:`config-${index}`,tool_name:"workspace.read",settlement_status:"succeeded"})
}
emit(3,"model.reasoning.delta","检查 7890 端口是否有进程监听。")
emit(3,"tool.call.completed","",{tool_call_id:"listener",tool_name:"exec_command",full_arguments:JSON.stringify({command:"lsof -nP -iTCP:7890 -sTCP:LISTEN"})})
emit(3,"tool.result",JSON.stringify({error:"No listener on port 7890"}),{tool_call_id:"listener",tool_name:"exec_command",settlement_status:"failed"})
emit(4,"model.text.delta","## 检查结果\n\n配置使用 **7890** 端口，但当前没有进程监听。启动代理后，再测试 GitHub 连接。",{assistant_phase:"final_answer"})
save("tree-demo")

function Fixture() {
  const [stage,setStage] = React.useState("final-stream")
  const [status,setStatus] = React.useState("completed")
  const [canonical,setCanonical] = React.useState(true)
  const [mount,setMount] = React.useState(0)
  const [longFinal,setLongFinal] = React.useState(false)
  const viewport = React.useRef<HTMLDivElement>(null)
  const entry = React.useMemo(() => {
    const source=snapshots[stage]
    const next: AssistantEntry = {...source,id:`fixture-row-${mount}`,timelineUnitId:"run:process-run:anchor:1",runDurationMs:671234,
      runStatus:status,status:status === "streaming" ? "streaming" : "done",
      segments:Object.fromEntries(Object.entries(source.segments ?? {}).map(([id,segment])=>[id,{...segment,canonicalMessageSeqEnd:canonical?100:undefined}]))}
    if (longFinal) {
      const id=next.pane.blockOrder.find(id=>next.pane.blocks[id]?.type==="text" && next.pane.blocks[id].assistantPhase==="final_answer")
      if (id) next.pane={...next.pane,blocks:{...next.pane.blocks,[id]:{...next.pane.blocks[id],content:"FINAL ANSWER\n\n"+"A newly completed conclusion with supporting details.\n\n".repeat(120)}}}
    }
    const id="artifact"
    if(stage==="final-stream") next.pane={...next.pane,blockOrder:[...next.pane.blockOrder.slice(0,-1),id,...next.pane.blockOrder.slice(-1)],blocks:{...next.pane.blocks,[id]:{id,type:"tool",toolId:id}},tools:{...next.pane.tools,[id]:{
      id,name:"workspace",input:"{}",status:"succeeded",output:JSON.stringify({workspace_id:"workspace",object_id:"object",path:"notes/result.md",mime_type:"text/markdown",version_id:"version",size_bytes:2048}),
    }}}
    if(status==="awaiting_human") {
      const id="question"
      next.pane={...next.pane,blockOrder:[...next.pane.blockOrder,id],blocks:{...next.pane.blocks,[id]:{id,type:"tool",toolId:id}},tools:{...next.pane.tools,[id]:{
        id,protocolId:id,needId:"fixture-need",runId:"process-run",name:"request_user_input",status:"waiting",
        input:JSON.stringify({questions:[{id:"q",question:"Continue this task?",options:[{label:"Continue",description:"Keep working"}]}]}),output:"",
      }}}
    }
    return next
  },[stage,status,canonical,mount,longFinal])
  return <div className="flex h-screen min-w-0 flex-col">
    <div className="flex shrink-0 flex-wrap gap-2 text-xs" data-fixture-controls>
      {["work-1","body-1","body-1-more","work-2","body-2","unknown","final-stream","plugin-thinking","declared-plugin","plugin-body","tree-demo"].map(value=><button key={value} onClick={()=>{setStage(value);setStatus("streaming")}}>{value}</button>)}
      {["completed","streaming","failed","cancelled","awaiting_human","suspended"].map(value=><button key={value} onClick={()=>setStatus(value)}>{value}</button>)}
      <button onClick={()=>setCanonical(value=>!value)}>canonical</button>
      <button onClick={()=>setMount(value=>value+1)}>remount-row</button>
      <button onClick={()=>{setLongFinal(true);setStatus("completed")}}>finish-long</button>
      <button onClick={()=>void i18n.changeLanguage(i18n.language.startsWith("en")?"zh-CN":"en-US")}>language</button>
      <button onClick={()=>document.documentElement.classList.toggle("dark")}>theme</button>
    </div>
    <div className="min-h-0 flex-1">
      <ChatMessageList entries={[entry]} hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null}
        isAwaitingResponse={status==="streaming"} isLoadingInitial={false} showScrollToBottom={false} scrollViewportRef={viewport}
        onViewportScroll={()=>{}} onLoadOlderConversationMessagesPage={()=>{}} onScrollToBottomClick={()=>{}} onStreamingContentProgress={()=>{}}
        onApproveApproval={()=>{}} onRejectApproval={()=>{}} activeHumanRunId={status==="awaiting_human"?"process-run":null}
        activeHumanNeedId={status==="awaiting_human"?"fixture-need":null} activeHumanNeedKind={status==="awaiting_human"?"user_input":null}
        onSubmitUserInput={async()=>{}} isFullScreen />
    </div>
  </div>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><TooltipProvider><Fixture /></TooltipProvider></MemoryRouter>)
