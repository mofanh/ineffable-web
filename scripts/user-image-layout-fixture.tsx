import * as React from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history"
import type { ChatEntry } from "../src/features/chat/gateway-chat-types"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
const image = { workspace_id:"00000000-0000-0000-0000-000000000001",object_id:"00000000-0000-0000-0000-000000000002",version_id:"00000000-0000-0000-0000-000000000003",mime_type:"image/png",width:1200,height:600,size_bytes:1000 }
const entries: ChatEntry[] = [
  {id:"single",role:"user",content:"Look",images:[image]},
  {id:"multiple",role:"user",content:"Compare",images:[image,image,image,image]},
  {id:"only",role:"user",content:"",images:[image]},
  {id:"long",role:"user",content:"Long text should wrap independently. ".repeat(12),images:[image]},
]
const nativeEvent = { seq:1, run_id:"native", event:"model.images", content:"", stream:"chat", metadata:{images:[image],transcript_segment:{id:"native:1:0",turn:0,execution_epoch:1}} }
const nativeLive = projectConversationOutputEvent(undefined,nativeEvent,"native")
const nativeHistory = mapConversationMessagesToEntries([{id:"native-output",conversation_id:"conversation",run_id:"native",role:"assistant",message_type:"output",content:"Edited image",created_at:"2026-09-17T00:00:00Z",updated_at:"2026-09-17T00:00:00Z",canonical_seq:2,timeline_seq:1,timeline_unit_id:"native",metadata_json:{images:[image],transcript_segment:{id:"native:1:0",turn:0,execution_epoch:1}}}])[0]
function Fixture(){
  const [nativeMode,setNativeMode]=React.useState(false)
  const [history,setHistory]=React.useState(false)
  const [reference,setReference]=React.useState("")
  const ref=React.useRef<HTMLDivElement>(null)
  return <div className="flex h-screen flex-col"><button onClick={()=>{setNativeMode(true);setHistory(false)}}>Native live image</button><button onClick={()=>{setNativeMode(true);setHistory(true)}}>Native history image</button><output data-reference>{reference}</output><ChatMessageList onImageReference={image=>setReference(image.version_id)} entries={nativeMode ? [{...(history?nativeHistory:nativeLive),id:"native"}] : entries} accessToken="fixture-token" hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null} isAwaitingResponse={false} isLoadingInitial={false} showScrollToBottom={false} scrollViewportRef={ref} onViewportScroll={()=>{}} onLoadOlderConversationMessagesPage={()=>{}} onScrollToBottomClick={()=>{}} onStreamingContentProgress={()=>{}} onApproveApproval={()=>{}} onRejectApproval={()=>{}} activeHumanRunId={null} onSubmitUserInput={async()=>{}} isFullScreen /></div>
}
createRoot(document.getElementById("root")!).render(<TooltipProvider><Fixture /></TooltipProvider>)
