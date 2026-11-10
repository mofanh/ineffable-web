// Synthetic payloads with production ordering: lifecycle events have no output
// identity, while model/tool and canonical records share fixed runtime segments.
export function processCompletionEvents() {
  let seq = 10
  const segment = turn => ({ id: `refresh-run:1:${turn}`, turn, execution_epoch: 1 })
  const event = (turn, kind, content = "", extra = {}) => ({
    run_id: "refresh-run", seq: ++seq, ts_ms: 1, stream: "chat", phase: "model",
    scope: "main", event: kind, content,
    metadata: { conversation_id: "refresh-conversation", ...(turn ? { transcript_segment: segment(turn) } : {}), ...extra },
  })
  const events = []
  for (const turn of [1, 2]) {
    const tool = { tool_call_id: `read-${turn}`, tool_name: "workspace", full_arguments: '{"command":"list"}' }
    const body = `INTERMEDIATE ${turn}`
    events.push(
      event(turn, "model.reasoning.delta", `THINK ${turn}`),
      event(0, "agent.process", "", { node_event: "node.started", node_id: "model" }),
      event(turn, "model.text.delta", body, { assistant_phase: "commentary" }),
      event(turn, "tool.call.completed", "", tool),
      event(0, "agent.process", "", { node_event: "node.finished", node_id: "model" }),
      event(turn, "tool.result", `RESULT ${turn}`, { ...tool, settlement_status: "succeeded" }),
      event(0, "agent.turn.completed"),
    )
  }
  events.push(
    event(3, "model.reasoning.delta", "FINAL THINKING"),
    event(0, "agent.process", "", { node_event: "node.started", node_id: "model" }),
    event(3, "model.text.delta", "# FINAL ANSWER\n\nFull final paragraph.\n\n| Key | Value |\n| --- | --- |\n| A | B |", { assistant_phase: "final_answer" }),
    event(0, "agent.execution.completed"),
  )
  for (const turn of [1, 2]) {
    const tool = { tool_call_id: `read-${turn}`, tool_name: "workspace" }
    events.push(
      event(turn, "tool.call.completed", "", {
        ...tool, canonical_reconciliation: true, canonical_message_seq: turn * 2,
        canonical_message: { content: `INTERMEDIATE ${turn}`, reasoning_content: `THINK ${turn}`,
          tool_calls: [{ id: tool.tool_call_id, name: tool.tool_name, input: { command: "list" } }] },
      }),
      event(turn, "tool.result", `RESULT ${turn}`, {
        ...tool, canonical_reconciliation: true, canonical_message_seq: turn * 2 + 1,
        transcript_segment_complete: true, settlement_status: "succeeded",
      }),
      event(0, "agent.process", "", { node_event: "node.finished", node_id: "recorder" }),
    )
  }
  events.push(event(3, "assistant.snapshot", "# FINAL ANSWER\n\nFull final paragraph.\n\n| Key | Value |\n| --- | --- |\n| A | B |", {
    canonical_reconciliation: true, canonical_message_seq: 6,
    transcript_segment_complete: true, assistant_phase: "final_answer",
  }))
  return events
}
