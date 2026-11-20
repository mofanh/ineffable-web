import assert from "node:assert/strict"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector.ts"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history.ts"
import { projectAssistantProcessLayout, finalAssistantBlockIds } from "../src/features/chat/model/assistant-process.ts"
import { WebNodeProjectionCache } from "../src/features/chat/runtime/web-node-projection.ts"

const segment = turn => ({id:`run:1:${turn}`,turn,execution_epoch:1})
let seq = 0
const event = (turn,event,content,extra={}) => ({run_id:"run",seq:++seq,ts_ms:1,stream:"agentic",event,scope:"main",content,metadata:{transcript_segment:segment(turn),...extra}})
const nodes = entry => new WebNodeProjectionCache().project(entry.pane,{streaming:entry.status==="streaming",canRespondToUserInput:false})
const layout = entry => projectAssistantProcessLayout(entry,nodes(entry),()=>true)
let live
const emit = (turn,kind,content,extra) => live=projectConversationOutputEvent(live,event(turn,kind,content,extra),"run")
emit(1,"model.reasoning.delta","thinking one")
assert.deepEqual(layout(live).groups.map(g=>g.autoCollapse),[false])
emit(1,"tool.call.started","",{tool_call_id:"read",tool_name:"workspace"})
assert.equal(layout(live).membership.has(Object.values(live.pane.tools)[0].id),false,"active tools cannot disappear with a process")
emit(1,"tool.result","read done",{tool_call_id:"read",tool_name:"workspace",settlement_status:"succeeded"})
emit(2,"model.text.delta","   ",{assistant_phase:"commentary"})
assert.deepEqual(layout(live).groups.map(g=>g.autoCollapse),[false],"whitespace is not a new answer")
emit(2,"model.text.delta","Stage one",{assistant_phase:"commentary"})
assert.deepEqual(layout(live).groups.map(g=>g.autoCollapse),[true])
const firstGroup=layout(live).groups[0].id
emit(2,"model.text.delta"," continues")
assert.equal(layout(live).groups[0].id,firstGroup,"tokens cannot reset disclosure identity")
emit(3,"model.reasoning.delta","thinking two")
assert.deepEqual(layout(live).groups.map(g=>g.autoCollapse),[true,false],"new work opens without reopening old work")
emit(4,"model.text.delta","Stage two",{assistant_phase:"partial_answer"})
assert.deepEqual(layout(live).groups.map(g=>g.autoCollapse),[true,true])
assert.equal(layout(live).consolidated,false)
for(const node of nodes(live).filter(n=>n.renderer==="text")) assert.equal(layout(live).membership.has(node.nodeId),false,"intermediate prose remains visible while running")

const record=(turn,phase,content,index=turn)=>({id:`message-${index}`,conversation_id:"conversation",run_id:"run",role:"assistant",message_type:"output",content,
  timeline_seq:1,timeline_unit_id:"run:run:anchor:1",canonical_seq:index,run_status:"completed",created_at:"2026-11-10T00:00:00Z",updated_at:"2026-11-10T00:00:00Z",
  metadata_json:{transcript_segment:segment(turn),assistant_phase:phase}})
const records=[record(1,"commentary","Stage one"),record(2,"partial_answer","Stage two"),record(3,"final_answer","Final paragraphs\n\nFinal table",3)]
const history=mapConversationMessagesToEntries(records).find(e=>e.role==="assistant")
const finalIds=finalAssistantBlockIds(history)
const finalNodes=nodes(history).filter(n=>finalIds.has(n.nodeId))
assert.equal(finalNodes.map(n=>n.payload.content).join(""),"Final paragraphs\n\nFinal table","retain the entire final response, not its last DOM block")
assert.equal(layout(history).consolidated,true)
assert.equal(layout(history).groups.length,1)
assert.equal(nodes(history).filter(n=>!layout(history).membership.has(n.nodeId)).map(n=>n.payload.content).join(""),"Final paragraphs\n\nFinal table")
const restored=mapConversationMessagesToEntries(records).find(e=>e.role==="assistant")
assert.equal(layout(history).groups[0].id,layout(restored).groups[0].id,"canonical reconstruction retains group identity")
for(const status of ["streaming","failed","cancelled","awaiting_human","suspended",undefined]) assert.equal(layout({...history,runStatus:status}).consolidated,false)
const uncovered={...history,segments:{...history.segments,"not-covered":{...live,canonicalMessageSeqEnd:undefined}}}
assert.equal(layout(uncovered).consolidated,false,"a completed tail cannot hide an uncovered live prefix")
const draft={...history,segments:Object.fromEntries(Object.entries(history.segments).map(([id,s])=>[id,{...s,canonicalDraft:live}]))}
assert.equal(layout(draft).consolidated,false)
const unknown=mapConversationMessagesToEntries([...records,record(4,undefined,"Unclassified tail",5)]).find(e=>e.role==="assistant")
assert.equal(layout(unknown).consolidated,false,"unknown trailing prose cannot be guessed to be a final answer")
assert.equal(finalAssistantBlockIds({...history,runStatus:"failed"}).size,0)
const otherScope={...history,timelineUnitId:"run:run:anchor:99"}
assert.notEqual(layout(otherScope).groups[0].id,layout(history).groups[0].id,"human response/input boundaries remain separate")

const toolNode = (id,status,extra={}) => ({schemaVersion:1,pluginId:"ineffable.web.default",renderer:"tool",nodeId:id,status,payload:{tool:{status,...extra}},fallback:{title:"tool"}})
const settled = [toolNode("first-command","failed"),toolNode("second-command","cancelled")]
for (const entry of [live,uncovered,unknown,{...history,runStatus:"failed"},{...history,runStatus:"cancelled"}]) {
  const projected = projectAssistantProcessLayout(entry,[...settled,...nodes(entry)],()=>true)
  for (const node of settled) assert.equal(projected.membership.has(node.nodeId),false,"failed and cancelled calls remain visible before a confirmed successful answer")
}
const pinned=[
 ...["pending","running","waiting"].map(status=>toolNode(status,status)),
 ...["succeeded","failed","cancelled"].flatMap(status=>[
   toolNode(`unknown-${status}`,status,{settlementStatus:"outcome_unknown"}),
   toolNode(`unsaved-${status}`,status,{operation:{status:"save_pending"}}),
   toolNode(`image-${status}`,status,{images:[{}]}),
   toolNode(`need-${status}`,status,{needId:"open-need"}),
 ]),
 {schemaVersion:1,pluginId:"ineffable.web.default",renderer:"reasoning",nodeId:"malformed",status:"settled",payload:null,fallback:{title:"invalid"}},
 ...["failed","cancelled","waiting"].map(status=>({schemaVersion:1,pluginId:"ineffable.web.default",renderer:"reasoning",nodeId:`reasoning-${status}`,status,payload:{block:{content:"attention"}},fallback:{title:"attention"}})),
 {schemaVersion:1,pluginId:"custom",renderer:"tool",nodeId:"plugin",status:"settled",payload:{},fallback:{title:"unknown"}},
 {schemaVersion:1,pluginId:"ineffable.web.default",renderer:"future",nodeId:"future",status:"settled",payload:{},fallback:{title:"unknown"}},
 {schemaVersion:1,pluginId:"ineffable.web.default",renderer:"text",nodeId:"image",status:"settled",payload:{content:"picture",images:[{}]},fallback:{title:"picture"}},
]
const guarded=projectAssistantProcessLayout(history,[...settled,...pinned,...nodes(history)],()=>true,"open-need")
for(const node of pinned) assert.equal(guarded.membership.has(node.nodeId),false,`${node.nodeId} remains visible`)
assert.equal(guarded.groups.length,1)
assert.deepEqual([...guarded.groups[0].nodeIds].slice(0,2),["first-command","second-command"],"completed disclosure contains both settled calls in order")
for (const key of ["settlement_status","status","tool_status","result_status"]) {
  const result = projectConversationOutputEvent(undefined,event(1,"tool.result","",{tool_name:"exec_command",tool_call_id:"uncertain",[key]:"outcome_unknown"}),"run")
  const row = nodes(result).find(node=>node.renderer==="tool")
  assert.equal(projectAssistantProcessLayout(history,[row,...nodes(history)],()=>true).membership.has(row.nodeId),false,`an unknown result from ${key} stays visible`)
}
assert.equal(projectAssistantProcessLayout(history,nodes(history),()=>false).membership.size,0,"unresolved/fallback renderers cannot be hidden")
let declared = projectConversationOutputEvent(undefined,event(1,"model.reasoning.delta","CURRENT THINKING"),"run")
const nativeLayout = entry => projectAssistantProcessLayout(entry,nodes(entry),node=>entry.pane.blocks[node.nodeId]?.type!=="plugin")
assert.deepEqual(nativeLayout(declared).groups.map(group=>group.autoCollapse),[false])
declared = projectConversationOutputEvent(declared,event(1,"model.stream.other","",{web_view:{schemaVersion:1,pluginId:"ineffable.web.default",renderer:"text",nodeId:"declared-text",status:"settled",payload:{content:"DECLARED PLUGIN",streaming:false},fallback:{title:"Plugin"}}}),"run")
assert.equal(Object.values(declared.pane.blocks).filter(block=>block.type==="text").length,0)
assert.deepEqual(nativeLayout(declared).groups.map(group=>group.autoCollapse),[false],"a declared plugin is not a native prose boundary")
declared = projectConversationOutputEvent(declared,event(2,"model.text.delta","Actual prose",{assistant_phase:"commentary"}),"run")
assert.deepEqual(nativeLayout(declared).groups.map(group=>group.autoCollapse),[true])
console.log("segmented live disclosure, final response, canonical coverage and pinned-node invariants passed")
