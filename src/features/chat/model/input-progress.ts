export type InputProgress = {
  message_id: string
  conversation_id: string
  phase: "received" | "queued" | "resuming" | "accepted" | "cancelled"
  kind: string
  run_id: string | null
  run_state: string | null
  execution_epoch: number | null
  run_version: number | null
}

export function parseInputProgress(value: unknown): InputProgress | undefined {
  if (!value || typeof value !== "object") return undefined
  const item = value as Record<string, unknown>
  if (typeof item.message_id !== "string" || typeof item.conversation_id !== "string" ||
      !["received", "queued", "resuming", "accepted", "cancelled"].includes(String(item.phase))) return undefined
  return {
    message_id: item.message_id, conversation_id: item.conversation_id,
    phase: item.phase as InputProgress["phase"], kind: typeof item.kind === "string" ? item.kind : "ordinary",
    run_id: typeof item.run_id === "string" ? item.run_id : null,
    run_state: typeof item.run_state === "string" ? item.run_state : null,
    execution_epoch: typeof item.execution_epoch === "number" ? item.execution_epoch : null,
    run_version: typeof item.run_version === "number" ? item.run_version : null,
  }
}

export function mergeInputProgress(current: InputProgress | undefined, incoming: InputProgress | undefined) {
  if (!incoming) return current
  if (!current || incoming.run_id !== current.run_id) return incoming
  if ((incoming.execution_epoch ?? 0) < (current.execution_epoch ?? 0) ||
      (incoming.run_version ?? 0) < (current.run_version ?? 0)) return current
  if (current.phase === "accepted" && ["received", "resuming"].includes(incoming.phase)) {
    return { ...incoming, phase: "accepted" as const }
  }
  return incoming
}

export function inputProgressLabel(progress: InputProgress | undefined, delivery?: "sending" | "received") {
  if (!progress) return delivery ? `inputProgress.${delivery}` : null
  if (progress.phase === "cancelled") return "inputProgress.cancelled"
  if (progress.phase === "queued") {
    return ["failed", "cancelled", "awaiting_human", "suspended"].includes(progress.run_state ?? "")
      ? "inputProgress.blocked" : "inputProgress.queued"
  }
  if (progress.phase === "accepted") {
    switch (progress.run_state) {
      case "completed": return "inputProgress.finished"
      case "failed": return "inputProgress.acceptedFailed"
      case "cancelled": return "inputProgress.acceptedCancelled"
      case "awaiting_human": return "inputProgress.acceptedAwaiting"
      case "suspended": return "inputProgress.acceptedSuspended"
      default: return "inputProgress.processing"
    }
  }
  if (["completed", "failed", "cancelled"].includes(progress.run_state ?? "")) return "inputProgress.unconfirmed"
  if (progress.phase === "resuming") return "inputProgress.resuming"
  return "inputProgress.received"
}
