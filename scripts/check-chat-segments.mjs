import assert from "node:assert/strict"
import { projectConversationOutputEvent, projectConversationUserInputNeed } from "../src/features/chat/runtime/conversation-event-projector.ts"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history.ts"
import { reduceConversationTimeline } from "../src/features/chat/model/conversation-entry-reconciliation.ts"
import { mergeAssistantDeltaEvents } from "../src/features/chat/runtime/assistant-event-coalescing.ts"
const segment = turn => ({id:`run:1:${turn}`, turn, execution_epoch:1})
let seq=0
const event = (turn, kind, content, metadata={}) => ({seq:++seq, run_id:"run", event:kind, content,
  stream:"chat", phase:"model", metadata:{transcript_segment:segment(turn), ...metadata}})
const body = entry => entry.pane.blockOrder.map(id=>entry.pane.blocks[id]).filter(b=>b.type==="text").map(b=>b.content).join("|")
const record = (turn, type, content, canonicalSeq, metadata={}) => ({id:`${turn}-${type}`, conversation_id:"conversation",run_id:"run",
  role:type==="tool_result"?"tool":"assistant",message_type:type,content,created_at:"2026-09-12T00:00:00Z",updated_at:"2026-09-12T00:00:00Z",
  timeline_unit_id:"run:run:anchor:1",timeline_seq:1,canonical_seq:canonicalSeq,
  metadata_json:{transcript_segment:segment(turn),...metadata}})
const canonical = turn => [record(turn,"tool_call",`canonical-${turn}`,turn*2+1,{tool_calls:[{id:"reused",name:"read_file",input:{turn}}]}),
  record(turn,"tool_result",`result-${turn}`,turn*2+2,{tool_call_id:"reused",tool_name:"read_file",status:"succeeded"})]
let live
for(let turn=0;turn<100;turn++){
  live=projectConversationOutputEvent(live,event(turn,"model.text.delta",`live-${turn}`),"run")
  live=projectConversationOutputEvent(live,event(turn,"tool.call.completed","",{tool_call_id:"reused",tool_name:"read_file",full_arguments:"{}"}),"run")
  live=projectConversationOutputEvent(live,event(turn,"tool.result",`result-${turn}`,{tool_call_id:"reused",tool_name:"read_file",status:"succeeded"}),"run")
}
live={...live,id:"run:run:anchor:1",timelineUnitId:"run:run:anchor:1",timelineSeq:1}
const firstFragment=live.segments[segment(0).id]
const tail=mapConversationMessagesToEntries([...canonical(98),...canonical(99)])
const merged=reduceConversationTimeline([live],{type:"canonical-patch",entries:tail,handoff:{runId:"run",messageSeqEnd:200}})[0]
assert.equal(Object.keys(merged.pane.tools).length,100)
assert.equal(merged.segments[segment(0).id],firstFragment,"uncaptured SSE prefix survives a terminal tail-page handoff")
assert.ok(body(merged).includes("live-0|"))
assert.ok(body(merged).endsWith("canonical-98|canonical-99"))
const older=mapConversationMessagesToEntries(canonical(0))
const oldMerged=reduceConversationTimeline([merged],{type:"prepend-history",entries:older})[0]
assert.ok(body(oldMerged).startsWith("canonical-0|live-1"),"an authoritative older page can fill a lossy live segment")
assert.equal(Object.keys(oldMerged.pane.tools).length,100)

// Complete canonical events replace just their segment, even when live events were dropped.
let corrected=merged
const metadata={canonical_reconciliation:true,canonical_message_seq:3,tool_call_id:"reused",tool_name:"read_file",
  canonical_message:{content:"corrected-1",reasoning_content:"reason-1",tool_calls:[{id:"reused",name:"read_file",input:{}}]}}
corrected=projectConversationOutputEvent(corrected,event(1,"tool.call.completed","",metadata),"run")
assert.ok(body(corrected).includes("live-1|"),"partial canonical events must not erase the live segment")
corrected=projectConversationOutputEvent(corrected,event(1,"tool.result","complete-1",{canonical_reconciliation:true,canonical_message_seq:4,
  transcript_segment_complete:true,tool_call_id:"reused",tool_name:"read_file",status:"succeeded"}),"run")
assert.ok(body(corrected).includes("corrected-1|live-2"))
assert.equal(corrected.pane.tools[`${segment(1).id}:tool:reused`].output,"complete-1")
assert.equal(Object.keys(corrected.pane.tools).length,100)
assert.equal(corrected.segments[segment(1).id].canonicalDraft,undefined)

let sparse=projectConversationOutputEvent(undefined,event(0,"model.text.delta","zero"),"run")
sparse=projectConversationOutputEvent(sparse,event(2,"model.text.delta","two"),"run")
sparse=projectConversationOutputEvent(sparse,event(1,"assistant.snapshot","one",{canonical_reconciliation:true,canonical_message_seq:2,transcript_segment_complete:true}),"run")
assert.equal(body(sparse),"zero|one|two","a wholly missing segment is inserted by fixed runtime order")

// Real fallback rows carry canonical_source_message_id, no synthetic occurrence.
const fallbackPage = n => mapConversationMessagesToEntries(canonical(n).map((m,index)=>({...m,metadata_json:{...m.metadata_json,
  transcript_segment:undefined,canonical_source_message_id:index===0?`source-${n}`:`result-${n}`}})))
const fallbacks=reduceConversationTimeline(fallbackPage(2),{type:"prepend-history",entries:fallbackPage(1)})[0]
assert.equal(Object.keys(fallbacks.pane.tools).length,2)
assert.deepEqual(Object.values(fallbacks.pane.tools).map(t=>t.output),["result-1","result-2"])

let needEntry=projectConversationOutputEvent(undefined,event(1,"tool.call.completed","",{tool_call_id:"ask",tool_name:"request_user_input",full_arguments:"{}"}),"run")
const need={needId:"ask",runId:"run",sessionKey:null,questions:[]}
needEntry=projectConversationUserInputNeed(needEntry,event(1,"tool.result","",{tool_call_id:"ask",tool_name:"request_user_input",status:"succeeded"}),need)
assert.equal(Object.keys(needEntry.pane.tools).length,1)
assert.equal(Object.values(needEntry.pane.tools)[0].needId,"ask")
needEntry=projectConversationOutputEvent(needEntry,event(2,"model.text.delta","after"),"run")
assert.equal(Object.values(needEntry.pane.tools)[0].needId,"ask","next segment cannot discard need projection")
assert.equal(mergeAssistantDeltaEvents(event(1,"model.text.delta","a"),event(2,"model.text.delta","b")),null)
console.log("chat segment handoff checks passed")

// Expanded production canonical calls repeat metadata, not the assistant body.
const parallel = ["a","b"].map((id,index)=>({...record(200,"tool_call","",401,{
  canonical_message_seq:401,transcript_occurrence_id:id,tool_call_id:id,tool_name:"read_file",
  canonical_message:{content:"parallel-body",tool_calls:[{id:"a",name:"read_file",input:{}},{id:"b",name:"read_file",input:{}}]},
}),id:`expanded-${index}`}))
const parallelEntry=mapConversationMessagesToEntries(parallel).find(e=>e.role==="assistant")
assert.equal(body(parallelEntry),"parallel-body")
assert.equal(Object.keys(parallelEntry.pane.tools).length,2)
