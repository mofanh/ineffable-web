import assert from "node:assert/strict"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history.ts"
import { isAgentReportInput, needsReportSource, projectAgentReportTurns } from "../src/features/chat/model/agent-report-turns.ts"
import { bindAssistantToHumanBoundary } from "../src/features/chat/model/human-input-timeline.ts"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector.ts"
import { reduceConversationTimeline } from "../src/features/chat/model/conversation-entry-reconciliation.ts"
import { projectAssistantProcessLayout, assistantAnswerText } from "../src/features/chat/model/assistant-process.ts"
import { WebNodeProjectionCache } from "../src/features/chat/runtime/web-node-projection.ts"

const common = { conversation_id:"c", created_at:"2026-11-18T10:00:00Z", updated_at:"2026-11-18T10:00:00Z" }
const envelope = "External agent report from Codex"
function input(seq, fromAgent, kind = "guided", run = "r") {
  const id = `m${seq}`
  const progress = { message_id:id, message_seq:seq, conversation_id:"c", kind, phase:"accepted",
    run_id:run, run_state:"completed", execution_epoch:1, run_version:1,
    agent_report:fromAgent ? { task_id:"task", name:"Codex", content:`report ${seq}`, delivery_epoch:kind === "guided" ? 1 : null } : null }
  return { ...common, id, role:"user", message_type:"input", content:envelope, canonical_seq:seq, timeline_seq:seq,
    timeline_unit_id:`message:${id}`, metadata_json:{input_progress:progress} }
}
function output(seq, anchor, phase, run = "r", epoch = 1) {
  return { ...common, id:`a${seq}`, role:"assistant", message_type:"output", run_id:run, run_status:"completed",
    canonical_seq:seq, timeline_seq:anchor+1, timeline_unit_id:`run:${run}:anchor:${anchor+1}`, content:`answer ${seq}`,
    metadata_json:{ assistant_phase:phase, transcript_segment:{id:`${run}:${epoch}:${seq}`,turn:seq,execution_epoch:epoch} } }
}
const question = input(1,false,"pre_input")
const receipt = input(2,true)
const second = input(3,true)
const prefix = output(4,1,"commentary"), mid = output(5,2,"commentary"), end = output(6,3,"final_answer")
const page = messages => mapConversationMessagesToEntries(messages)
const rows = page([question,prefix,receipt,mid,second,end])
const [human,turn] = projectAgentReportTurns(rows)
assert.equal(human.content,envelope,"identical human wording stays a human message")
assert.equal(isAgentReportInput(human),false)
assert.equal(turn.reportTurn.length,5)
assert.equal(assistantAnswerText(turn),"answer 6")
const cache = new WebNodeProjectionCache()
const nodes = cache.project(turn.pane,{streaming:false,canRespondToUserInput:false},undefined,turn.reportTurn)
assert.deepEqual(nodes.map(n=>n.payload.content),["answer 4","report 2","answer 5","report 3","answer 6"])
assert.deepEqual(Object.keys(turn.pane.tools),[],"report receipt must not fabricate a tool call or settlement")
const layout = projectAssistantProcessLayout(turn,nodes,()=>true)
assert.equal(layout.consolidated,true)
assert.deepEqual([...layout.groups[0].nodeIds],nodes.slice(0,-1).map(n=>n.nodeId))

const late = page([question,prefix,input(2,true,"pre_input","later"),output(6,2,"final_answer","later")])
assert.deepEqual(projectAgentReportTurns(late).map(e=>e.runId ?? e.role),["user","r","later"])
const guidedHuman = page([question,prefix,input(2,false),mid,second,end])
assert.deepEqual(projectAgentReportTurns(guidedHuman).map(e=>e.role),["user","assistant","user","assistant"])
assert.equal(projectAgentReportTurns(page([receipt]))[0].inputProgress.agent_report.content,"report 2")
const orphan = page([output(4,1,"commentary","other"),receipt,output(6,4,"final_answer")])
assert.equal(projectAgentReportTurns(orphan).length,3,"no adjacent-run or unproven reply-anchor inference")
const stale = page([output(4,1,"commentary","r",2),receipt,output(6,2,"final_answer","r",2)])
assert.equal(projectAgentReportTurns(stale).length,3,"a receipt cannot join another execution epoch")
const resumed = output(6,2,"final_answer","r",2)
resumed.metadata_json.response_to_message_id = receipt.id
resumed.metadata_json.response_to_message_seq = receipt.canonical_seq
assert.equal(projectAgentReportTurns(page([question,prefix,receipt,resumed])).length,2,"Finalizer can answer a previously accepted input after durable resume")
const restored = projectConversationOutputEvent(undefined,{run_id:"r",event:"assistant.snapshot",role:"assistant",scope:"main",seq:8,
  content:"restored",metadata:{...resumed.metadata_json,canonical_reconciliation:true,canonical_message_seq:6,transcript_segment_complete:true}},"r")
const withLive = [...page([question,prefix,receipt]), bindAssistantToHumanBoundary(restored,[],2)]
assert.equal(projectAgentReportTurns(withLive).length,2,"inline Finalizer handoff proves the same response owner as refreshed history")
resumed.metadata_json.response_to_message_id = question.id
assert.equal(projectAgentReportTurns(page([question,prefix,receipt,resumed])).length,3,"a later epoch needs the exact canonical input owner")
const provisional = rows.map((r,i)=>i===1 ? { ...r, segments:undefined, canonicalMessageSeqEnd:null,segmentIdentity:{execution_epoch:1,turn:1,id:"partial"} } : r)
const pendingTurn = projectAgentReportTurns(provisional).at(-1)
assert.equal(projectAssistantProcessLayout(pendingTurn,nodes,()=>true).consolidated,false)
const [inputRow] = page([receipt])
const once = reduceConversationTimeline([], {type:"input-progress",progress:inputRow.inputProgress})
const again = reduceConversationTimeline(once,{type:"input-progress",progress:{...inputRow.inputProgress,agent_report:undefined},content:envelope})
assert.equal(again.length,1)
assert.equal(again[0].inputProgress.agent_report.content,"report 2")
const old = {...inputRow.inputProgress, agent_report:undefined}
const unclassified = reduceConversationTimeline([human],{type:"input-progress",progress:old,content:envelope,awaitingReportSource:true})
assert.ok(needsReportSource(unclassified[1]))
assert.equal(bindAssistantToHumanBoundary({role:"assistant",runId:"r"},unclassified).humanInputBoundarySeq,2)
for (const expected of [inputRow.inputProgress.agent_report, null]) {
  const hydrated = reduceConversationTimeline(unclassified,{type:"pending-inputs",inputs:[],progress:[{...old,agent_report:expected}]})
  assert.ok(!needsReportSource(hydrated[1]))
  assert.equal(hydrated[1].content,envelope)
  assert.equal(isAgentReportInput(hydrated[1]),!!expected)
}
const paged = reduceConversationTimeline(rows.slice(2),{type:"prepend-history",entries:rows.slice(0,2)})
assert.deepEqual(projectAgentReportTurns(paged).at(-1).reportTurn.map(p=>p.id),turn.reportTurn.map(p=>p.id))
console.log("Agent mailbox reports preserve source, order, epoch, paging, canonical coverage and human input boundaries")
