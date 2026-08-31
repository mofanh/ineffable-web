import { getPaneBlocks } from "../chat-pane-state.ts"
import type {
  AssistantEntry,
  ChatEntry,
  SubagentView,
} from "../gateway-chat-types.ts"

function normalizeEntryContent(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function paneText(entry: AssistantEntry) {
  const mainText = getPaneBlocks(entry.pane)
    .map((block) => ("content" in block ? block.content : ""))
    .filter(Boolean)
    .join("\n")
  const subagentText = entry.subagentOrder
    .map((subagentId) => entry.subagents[subagentId])
    .filter((subagent): subagent is SubagentView => Boolean(subagent))
    .flatMap((subagent) =>
      getPaneBlocks(subagent).map((block) =>
        "content" in block ? block.content : ""
      )
    )
    .filter(Boolean)
    .join("\n")
  return [mainText, subagentText].filter(Boolean).join("\n")
}

function entryContentFingerprint(entry: ChatEntry) {
  if (entry.role === "user" || entry.role === "system") {
    const content = normalizeEntryContent(entry.content)
    return content ? `${entry.role}:${content}` : null
  }
  if (entry.role === "assistant") {
    const content = normalizeEntryContent(paneText(entry))
    return content ? `assistant:${content}` : null
  }
  return entry.approvalId || entry.needId
    ? `approval:${entry.approvalId ?? entry.needId}`
    : null
}

function isLocalAssistantEntry(entry: ChatEntry): entry is AssistantEntry {
  return entry.role === "assistant" && entry.id.startsWith("assistant-")
}

export type CanonicalAssistantHandoff = {
  runId: string
  messageSeqEnd: number
}

export function hasCanonicalAssistantHandoff(
  entries: ChatEntry[],
  handoff: CanonicalAssistantHandoff
) {
  return entries.some(
    (entry) =>
      entry.role === "assistant" &&
      entry.runId === handoff.runId &&
      (entry.canonicalMessageSeqEnd ?? -1) >= handoff.messageSeqEnd
  )
}

export function mergeLatestConversationEntries(
  current: ChatEntry[],
  latestEntries: ChatEntry[],
  handoff?: CanonicalAssistantHandoff | null
) {
  const handoffConfirmed = handoff
    ? hasCanonicalAssistantHandoff(latestEntries, handoff)
    : true
  const latestIds = new Set(latestEntries.map((entry) => entry.id))
  const latestAssistantRunIds = new Set(
    latestEntries.flatMap((entry) =>
      entry.role === "assistant" && entry.runId ? [entry.runId] : []
    )
  )
  const latestContentFingerprintCounts = new Map<string, number>()
  latestEntries.forEach((entry) => {
    const fingerprint = entryContentFingerprint(entry)
    if (fingerprint) {
      latestContentFingerprintCounts.set(
        fingerprint,
        (latestContentFingerprintCounts.get(fingerprint) ?? 0) + 1
      )
    }
  })

  const kept: ChatEntry[] = []
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const entry = current[index]
    if (latestIds.has(entry.id)) continue

    const localAssistant = isLocalAssistantEntry(entry)
    if (
      localAssistant &&
      entry.runId &&
      latestAssistantRunIds.has(entry.runId)
    ) {
      if (!handoff || entry.runId !== handoff.runId || handoffConfirmed) {
        continue
      }
    }

    // Canonical assistant entries from older pages are distinct display units,
    // even when they share a run or repeat the same text as the latest page.
    if (entry.role !== "assistant" || localAssistant) {
      const fingerprint = entryContentFingerprint(entry)
      const count = fingerprint
        ? latestContentFingerprintCounts.get(fingerprint) ?? 0
        : 0
      if (fingerprint && count > 0) {
        latestContentFingerprintCounts.set(fingerprint, count - 1)
        continue
      }
    }

    kept.push(entry)
  }

  const visibleLatestEntries =
    handoff && !handoffConfirmed
      ? latestEntries.filter(
          (entry) =>
            entry.role !== "assistant" || entry.runId !== handoff.runId
        )
      : latestEntries

  return [...kept.reverse(), ...visibleLatestEntries]
}
