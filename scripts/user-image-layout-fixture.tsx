import * as React from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { ChatMessageList } from "../src/features/chat/components/chat-message-list"
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
function Fixture(){
  const [reference,setReference]=React.useState("")
  const ref=React.useRef<HTMLDivElement>(null)
  return <div className="flex h-screen flex-col"><output data-reference>{reference}</output><ChatMessageList onImageReference={image=>setReference(image.version_id)} entries={entries} accessToken="fixture-token" hasOlderEntries={false} isLoadingOlderEntries={false} olderEntriesError={null} isAwaitingResponse={false} isLoadingInitial={false} showScrollToBottom={false} scrollViewportRef={ref} onViewportScroll={()=>{}} onLoadOlderConversationMessagesPage={()=>{}} onScrollToBottomClick={()=>{}} onStreamingContentProgress={()=>{}} onApproveApproval={()=>{}} onRejectApproval={()=>{}} activeHumanRunId={null} onSubmitUserInput={async()=>{}} isFullScreen /></div>
}
createRoot(document.getElementById("root")!).render(<TooltipProvider><Fixture /></TooltipProvider>)
