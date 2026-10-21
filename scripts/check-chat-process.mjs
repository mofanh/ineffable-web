import assert from "node:assert/strict"
import { mapConversationMessagesToEntries } from "../src/features/chat/model/chat-history.ts"
import { projectConversationOutputEvent } from "../src/features/chat/runtime/conversation-event-projector.ts"
import { canAutoCollapseAssistantProcess, assistantAnswerText, isAssistantProcessNode } from "../src/features/chat/model/assistant-process.ts"
import { WebNodeProjectionCache } from "../src/features/chat/runtime/web-node-projection.ts"

const segment = turn => ({ id:`process-run:0:${turn}`, turn, execution_epoch:0 })
const event = (turn, kind, content, metadata = {}) => ({ run_id:"process-run",seq:turn * 10,ts_ms:1,stream:"agentic",event:kind,scope:"main",content,metadata:{ transcript_segment:segment(turn), ...metadata } })
const message = (turn, phase, status="completed") => ({
  id:`phase-${turn}`,conversation_id:"conversation",run_id:"process-run",role:"assistant",message_type:"output",content:`body-${turn}`,
  timeline_seq:turn, timeline_unit_id:"run:process-run:anchor:1",canonical_seq:turn,
  created_at:"2026-10-21T00:00:00Z",updated_at:"2026-10-21T00:00:00Z",run_status:status,
  metadata_json:{transcript_segment:segment(turn), ...(phase ? {assistant_phase:phase} : {})},
})
const messages = [message(1,"commentary"),message(2,"partial_answer"),message(3,"final_answer"),message(4,undefined)]
const history = mapConversationMessagesToEntries(messages).find(entry => entry.role === "assistant")
assert.equal(assistantAnswerText(history), "body-2\n\nbody-3\n\nbody-4")
assert.equal(canAutoCollapseAssistantProcess(history), true)
const cache = new WebNodeProjectionCache()
const nodes = cache.project(history.pane,{streaming:false,canRespondToUserInput:false})
assert.deepEqual(nodes.filter(node => !isAssistantProcessNode(node)).map(node => node.payload.content),["body-2","body-3","body-4"])

for (const status of [undefined,"failed","cancelled","awaiting_human","suspended","streaming"]) {
  const entry = mapConversationMessagesToEntries(messages.map(message => ({...message,run_status:status}))).find(entry => entry.role === "assistant")
  assert.equal(canAutoCollapseAssistantProcess(entry),false,`${status} is not successful completion`)
}
// Native phase frames can precede or follow text. Repeated frames never append
// strings or duplicate a display entity; canonical handoff confirms exact slots.
for (const phaseFirst of [true,false]) {
  let live
  for (const turn of [1,2]) {
    const phase = turn === 1 ? "commentary" : "final_answer"
    const phaseEvent = event(turn,"model.stream.other","",{assistant_phase:phase})
    const textEvent = event(turn,"model.text.delta",`body-${turn}`)
    for (const next of phaseFirst ? [phaseEvent,textEvent,phaseEvent] : [textEvent,phaseEvent,phaseEvent]) {
      live = projectConversationOutputEvent(live,next,"process-run")
    }
  }
  assert.equal(assistantAnswerText(live),"body-2")
  live = {...live,status:"done",runStatus:"completed"}
  assert.equal(canAutoCollapseAssistantProcess(live),false,"run completion cannot confirm live content")
  for (const turn of [1,2]) live = projectConversationOutputEvent(live,event(turn,"assistant.snapshot",`body-${turn}`,{
    assistant_phase:turn === 1 ? "commentary" : "final_answer",canonical_reconciliation:true,canonical_message_seq:turn,transcript_segment_complete:true,
  }),"process-run")
  assert.equal(assistantAnswerText(live),"body-2")
  assert.equal(canAutoCollapseAssistantProcess({...live,status:"done"}),true)
  assert.equal(Object.values(live.pane.blocks).filter(block=>block.type === "text").length,2)
}
const node = (renderer,payload) => ({pluginId:"ineffable.web.default",renderer,payload})
for (const status of ["failed","cancelled","waiting"]) assert.equal(isAssistantProcessNode(node("tool",{tool:{status}})),false)
assert.equal(isAssistantProcessNode(node("tool",{tool:{status:"succeeded",images:[{}]}})),false)
assert.equal(isAssistantProcessNode(node("tool",{tool:{status:"succeeded",settlementStatus:"outcome_unknown"}})),false)
assert.equal(isAssistantProcessNode(node("tool",{tool:{status:"succeeded",operation:{status:"save_pending"}}})),false)
assert.equal(isAssistantProcessNode(node("text",{assistantPhase:"commentary",images:[{}]})),false)
assert.equal(isAssistantProcessNode(node("future",{})),false)
console.log("chat process semantics and canonical handoff checks passed")
