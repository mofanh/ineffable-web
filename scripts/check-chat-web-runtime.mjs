import assert from "node:assert/strict"

import {
  VisualUpdateScheduler,
} from "../src/features/chat/runtime/visual-update-scheduler.ts"
import {
  createDefaultWebNode,
  isWebNodeView,
  MAX_WEB_NODE_PAYLOAD_BYTES,
  validateWebNodeView,
  webNodeRendererKey,
} from "../src/features/chat/web-node.ts"
import { WebNodeProjectionCache } from "../src/features/chat/runtime/web-node-projection.ts"
import {
  IncrementalMarkdownProjector,
  splitIncrementalMarkdown,
} from "../src/features/chat/runtime/incremental-markdown.ts"
import {
  extractWorkspaceArtifact,
  workspaceArtifactHref,
} from "../src/features/chat/runtime/workspace-artifacts.ts"
import { mergeAssistantDeltaEvents } from "../src/features/chat/runtime/assistant-event-coalescing.ts"
import {
  ConversationWindowCache,
  measureConversationWindow,
} from "../src/features/chat/model/conversation-window-cache.ts"
import {
  hasCanonicalAssistantHandoff,
  reduceConversationTimeline,
} from "../src/features/chat/model/conversation-entry-reconciliation.ts"

function fakeSchedulerHost() {
  let nextHandle = 1
  const frames = new Map()
  const timers = new Map()
  return {
    host: {
      requestFrame(callback) {
        const handle = nextHandle++
        frames.set(handle, callback)
        return handle
      },
      cancelFrame(handle) {
        frames.delete(handle)
      },
      setTimer(callback) {
        const handle = nextHandle++
        timers.set(handle, callback)
        return handle
      },
      clearTimer(handle) {
        timers.delete(handle)
      },
    },
    flushFrame() {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback())
    },
    flushTimer() {
      const callbacks = [...timers.values()]
      timers.clear()
      callbacks.forEach((callback) => callback())
    },
    pendingFrames: () => frames.size,
    pendingTimers: () => timers.size,
  }
}

const frameHost = fakeSchedulerHost()
const framePublishes = []
const scheduler = new VisualUpdateScheduler(
  frameHost.host,
  (updates) => framePublishes.push([...updates])
)
for (let index = 0; index < 1000; index += 1) {
  scheduler.enqueue(index)
}
assert.equal(frameHost.pendingFrames(), 1)
assert.equal(frameHost.pendingTimers(), 1)
frameHost.flushFrame()
assert.equal(framePublishes.length, 1)
assert.equal(framePublishes[0].length, 1000)
frameHost.flushTimer()
assert.equal(framePublishes.length, 1, "timer fallback must not republish a frame")

const immediateHost = fakeSchedulerHost()
const immediatePublishes = []
const immediateScheduler = new VisualUpdateScheduler(
  immediateHost.host,
  (updates) => immediatePublishes.push([...updates])
)
immediateScheduler.enqueue("delta")
immediateScheduler.enqueue("terminal", "immediate")
assert.deepEqual(immediatePublishes, [["delta", "terminal"]])
assert.equal(immediateHost.pendingFrames(), 0)
assert.equal(immediateHost.pendingTimers(), 0)

const hiddenHost = fakeSchedulerHost()
const hiddenPublishes = []
const hiddenScheduler = new VisualUpdateScheduler(
  hiddenHost.host,
  (updates) => hiddenPublishes.push([...updates])
)
hiddenScheduler.enqueue("background-delta")
hiddenHost.flushTimer()
assert.deepEqual(hiddenPublishes, [["background-delta"]])
hiddenHost.flushFrame()
assert.equal(hiddenPublishes.length, 1)

const discardedHost = fakeSchedulerHost()
const discardedPublishes = []
const discardedScheduler = new VisualUpdateScheduler(
  discardedHost.host,
  (updates) => discardedPublishes.push([...updates])
)
discardedScheduler.enqueue("stale-conversation-delta")
discardedScheduler.discardPending()
discardedHost.flushFrame()
discardedHost.flushTimer()
assert.deepEqual(discardedPublishes, [])
discardedScheduler.enqueue("live-delta-after-effect-replay")
discardedHost.flushFrame()
assert.deepEqual(
  discardedPublishes,
  [["live-delta-after-effect-replay"]],
  "effect cleanup must cancel stale work without permanently disabling the scheduler"
)

const node = createDefaultWebNode({
  renderer: "text",
  nodeId: "node-1",
  status: "running",
  payload: { content: "hello" },
  fallback: { title: "Text" },
})
assert.equal(isWebNodeView(node), true)
assert.equal(webNodeRendererKey(node), "ineffable.web.default:text")
assert.equal(isWebNodeView({ ...node, nodeId: "" }), false)
assert.equal(validateWebNodeView({ ...node, schemaVersion: 2 }).ok, false)
assert.equal(
  validateWebNodeView({ ...node, payload: { moduleUrl: "https://evil.invalid/ui.js" } })
    .ok,
  false
)
assert.equal(
  validateWebNodeView({ ...node, payload: "x".repeat(MAX_WEB_NODE_PAYLOAD_BYTES) }).ok,
  false
)

const firstBlock = { id: "text-1", type: "text", content: "stable" }
const tailBlock = { id: "text-2", type: "text", content: "a" }
const pane = {
  activeThinkBlockId: null,
  activeThinkMode: null,
  pendingTagBuffer: "",
  blockOrder: [firstBlock.id, tailBlock.id],
  blocks: { [firstBlock.id]: firstBlock, [tailBlock.id]: tailBlock },
  tools: {},
  receivedTextDelta: true,
}
const projectionCache = new WebNodeProjectionCache()
const firstProjection = projectionCache.project(pane, {
  streaming: true,
  canRespondToUserInput: false,
})
const nextTailBlock = { ...tailBlock, content: "ab" }
const secondProjection = projectionCache.project(
  {
    ...pane,
    blocks: { ...pane.blocks, [tailBlock.id]: nextTailBlock },
  },
  { streaming: true, canRespondToUserInput: false }
)
assert.equal(
  firstProjection[0],
  secondProjection[0],
  "stable sibling must retain its WebNode identity"
)
assert.notEqual(firstProjection[1], secondProjection[1])

const subagent = {
  ...pane,
  id: "subagent-1",
  name: "Verifier",
  status: "done",
}
const projectionWithSubagent = projectionCache.project(
  pane,
  { streaming: true, canRespondToUserInput: false },
  { order: [subagent.id], records: { [subagent.id]: subagent } }
)
const subagentNode = projectionWithSubagent.at(-1)
const projectionAfterMainTail = projectionCache.project(
  { ...pane, blocks: { ...pane.blocks, [tailBlock.id]: nextTailBlock } },
  { streaming: true, canRespondToUserInput: false },
  { order: [subagent.id], records: { [subagent.id]: subagent } }
)
assert.equal(subagentNode?.renderer, "subagent")
assert.equal(
  subagentNode,
  projectionAfterMainTail.at(-1),
  "subagent NodeSeat projection must retain identity during main text updates"
)

const markdown = [
  "# Stable heading\n\n",
  "Stable paragraph.\n\n",
  "```ts\nconst value = 1\n\nconst next = 2\n```\n\n",
  "Streaming tail",
].join("")
const streamingSegments = splitIncrementalMarkdown(markdown, false)
assert.equal(streamingSegments.length, 4)
assert.equal(streamingSegments[0].stable, true)
assert.equal(streamingSegments[1].stable, true)
assert.equal(streamingSegments[2].stable, false)
assert.match(streamingSegments[2].content, /const next = 2/)
const settledSegments = splitIncrementalMarkdown(markdown, true)
assert.deepEqual(settledSegments, [
  { id: "document", content: markdown, stable: true },
])

const longMarkdown = `${"paragraph content\n\n".repeat(6000)}tail`
const longSegments = splitIncrementalMarkdown(longMarkdown, false)
const longerSegments = splitIncrementalMarkdown(`${longMarkdown} grows`, false)
assert.ok(longMarkdown.length > 100_000)
assert.equal(longSegments[0].id, longerSegments[0].id)
assert.equal(longSegments[0].content, longerSegments[0].content)
assert.ok(longSegments.filter((segment) => !segment.stable).length <= 2)
const incrementalProjector = new IncrementalMarkdownProjector()
const cachedLongSegments = incrementalProjector.project(longMarkdown, false)
const extendedLongSegments = incrementalProjector.project(
  `${longMarkdown}\n\nsmall appended tail`,
  false
)
assert.equal(cachedLongSegments[0], extendedLongSegments[0])
assert.ok(
  incrementalProjector.lastScannedCharacters < longMarkdown.length / 10,
  "append must scan only the unstable markdown tail"
)

const mergedHost = fakeSchedulerHost()
const mergedPublishes = []
const mergedScheduler = new VisualUpdateScheduler(
  mergedHost.host,
  (updates) => mergedPublishes.push([...updates]),
  80,
  (previous, next) => `${previous}${next}`
)
for (let index = 0; index < 1000; index += 1) mergedScheduler.enqueue("x")
mergedHost.flushFrame()
assert.equal(mergedPublishes[0].length, 1)
assert.equal(mergedPublishes[0][0].length, 1000)

const deltaHost = fakeSchedulerHost()
const deltaPublishes = []
const deltaScheduler = new VisualUpdateScheduler(
  deltaHost.host,
  (updates) => deltaPublishes.push([...updates]),
  80,
  mergeAssistantDeltaEvents
)
for (let seq = 1; seq <= 1000; seq += 1) {
  deltaScheduler.enqueue({
    event: "model.text.delta",
    seq,
    content: "x",
    metadata: { conversation_id: "conversation-1" },
  })
}
deltaHost.flushFrame()
assert.equal(deltaPublishes[0].length, 1)
assert.equal(deltaPublishes[0][0].content.length, 1000)

const { highlightSettledCode } = await import(
  "../src/features/chat/runtime/chat-syntax-highlighter.ts"
)
const highlighted = await highlightSettledCode("const value = 1", "ts")
assert.match(highlighted ?? "", /class="shiki(?:\s|\")/)
assert.equal(await highlightSettledCode("plain", "unknown-language"), null)

const artifactFixtures = [
  ["report.md", "text/markdown"],
  ["analysis.ts", "text/plain"],
  ["data.json", "application/json"],
  ["chart.png", "image/png"],
  ["archive.bin", "application/octet-stream"],
]
for (const [path, expectedMime] of artifactFixtures) {
  const artifact = extractWorkspaceArtifact({
    id: `tool-${path}`,
    name: "workspace_write_file",
    input: "",
    output: JSON.stringify({
      object: { id: `object-${path}`, workspace_id: "workspace-1", path },
      version_id: "version-1",
      version_no: 1,
    }),
    status: "succeeded",
  })
  assert.equal(artifact?.mimeType, expectedMime)
  assert.equal(artifact?.path, path)
  assert.equal(
    workspaceArtifactHref(artifact),
    `/workspace/workspace-1/objects/object-${path}`
  )
  assert.equal("content" in artifact, false)
}
assert.equal(
  extractWorkspaceArtifact({
    id: "failed",
    name: "publish_sandbox_file",
    input: "",
    output: JSON.stringify({ workspace_id: "secret", object_id: "secret" }),
    status: "failed",
  }),
  null
)

const artifactTool = {
  id: "publish-1",
  name: "publish_sandbox_file",
  input: "",
  output: JSON.stringify({
    workspace_id: "workspace-1",
    object_id: "object-1",
    version_id: "version-1",
    path: "results/report.md",
    mime_type: "text/markdown",
    size_bytes: 42,
  }),
  status: "succeeded",
}
const artifactPane = {
  ...pane,
  blockOrder: [...pane.blockOrder, "tool-block"],
  blocks: {
    ...pane.blocks,
    "tool-block": { id: "tool-block", type: "tool", toolId: artifactTool.id },
  },
  tools: { [artifactTool.id]: artifactTool },
}
const artifactProjectionCache = new WebNodeProjectionCache()
const artifactProjection = artifactProjectionCache.project(artifactPane, {
  streaming: true,
  canRespondToUserInput: false,
})
const artifactNode = artifactProjection.at(-1)
const artifactProjectionAfterText = artifactProjectionCache.project(
  {
    ...artifactPane,
    blocks: {
      ...artifactPane.blocks,
      [tailBlock.id]: { ...tailBlock, content: "changed text" },
    },
  },
  { streaming: true, canRespondToUserInput: false }
)
assert.equal(artifactNode?.renderer, "artifact-stack")
assert.equal(
  artifactNode,
  artifactProjectionAfterText.at(-1),
  "settled artifact stack must retain identity when only text changes"
)

const windowSnapshot = (id) => ({
  entries: [{ id, role: "system", content: id }],
  renderedEntryLimit: 40,
  olderMessagesCursor: null,
  hasOlderMessages: false,
  scrollAnchor: { atBottom: false, scrollTop: 120 },
})
const windowCache = new ConversationWindowCache(2, 3)
windowCache.set("a", windowSnapshot("a"))
windowCache.set("b", windowSnapshot("b"))
assert.equal(windowCache.get("a")?.scrollAnchor.scrollTop, 120)
windowCache.set("c", windowSnapshot("c"))
assert.deepEqual(windowCache.ids(), ["a", "c"], "LRU access must protect the active window")
windowCache.set("oversized", {
  ...windowSnapshot("oversized"),
  entries: Array.from({ length: 4 }, (_, index) => ({
    id: `oversized-${index}`,
    role: "system",
    content: "x",
  })),
})
assert.equal(windowCache.get("oversized"), null, "an oversized window must not enter the cache")
const byteBoundedCache = new ConversationWindowCache(2, 10, 100)
byteBoundedCache.set("large-content", {
  ...windowSnapshot("large-content"),
  entries: [{ id: "large-content", role: "system", content: "x".repeat(100) }],
})
assert.equal(
  byteBoundedCache.get("large-content"),
  null,
  "a low-node window that exceeds the byte budget must not enter the cache"
)
let visitedLongHistoryEntries = 0
const boundedScanCache = new ConversationWindowCache(2, 3, 1024)
boundedScanCache.set("long-history", {
  ...windowSnapshot("long-history"),
  entries: Array.from({ length: 10_000 }, (_, index) => ({
    id: `long-${index}`,
    get role() {
      visitedLongHistoryEntries += 1
      return "system"
    },
    content: "x",
  })),
})
assert.ok(
  visitedLongHistoryEntries <= 4,
  `cache admission must stop at the fixed node budget, visited ${visitedLongHistoryEntries}`
)

const assistantHistoryEntry = (id, runId, content) => ({
  id,
  role: "assistant",
  runId,
  status: "done",
  pane: {
    blockOrder: [`${id}-text`],
    blocks: {
      [`${id}-text`]: { id: `${id}-text`, type: "text", content },
    },
    tools: {},
    activeThinkBlockId: null,
    activeThinkMode: null,
    pendingTagBuffer: "",
    receivedTextDelta: true,
  },
  subagentOrder: [],
  subagents: {},
})
const olderRunUnit = assistantHistoryEntry("older-unit", "shared-run", "same output")
const localRunDraft = assistantHistoryEntry(
  "assistant-123-local",
  "shared-run",
  "same output"
)
const latestRunUnit = assistantHistoryEntry("latest-unit", "shared-run", "same output")
assert.deepEqual(
  reduceConversationTimeline(
    [olderRunUnit, localRunDraft],
    { type: "canonical-patch", entries: [latestRunUnit] }
  ).map((entry) => entry.id),
  ["older-unit", "latest-unit"],
  "latest reconciliation must replace only the local draft and preserve older same-run units"
)

const staleTerminalUnit = {
  ...assistantHistoryEntry("stale-terminal", "terminal-run", "before final"),
  canonicalMessageSeqEnd: 82,
}
const liveTerminalDraft = assistantHistoryEntry(
  "assistant-terminal-local",
  "terminal-run",
  "final body"
)
const terminalHandoff = { runId: "terminal-run", messageSeqEnd: 83 }
assert.equal(
  hasCanonicalAssistantHandoff([staleTerminalUnit], terminalHandoff),
  false,
  "a stale canonical page must not acknowledge the terminal watermark"
)
assert.deepEqual(
  reduceConversationTimeline(
    [liveTerminalDraft],
    {
      type: "canonical-patch",
      entries: [staleTerminalUnit],
      handoff: terminalHandoff,
    }
  ).map((entry) => entry.id),
  ["assistant-terminal-local"],
  "terminal reconciliation must retain live body until canonical output is visible"
)
const committedTerminalUnit = {
  ...assistantHistoryEntry("committed-terminal", "terminal-run", "final body"),
  canonicalMessageSeqEnd: 83,
}
assert.equal(
  hasCanonicalAssistantHandoff([committedTerminalUnit], terminalHandoff),
  true,
  "the canonical terminal watermark must explicitly acknowledge handoff"
)
assert.deepEqual(
  reduceConversationTimeline(
    [liveTerminalDraft],
    {
      type: "canonical-patch",
      entries: [committedTerminalUnit],
      handoff: terminalHandoff,
    }
  ).map((entry) => entry.id),
  ["committed-terminal"],
  "confirmed canonical output must replace the local live entry exactly once"
)

const orderedTimeline = reduceConversationTimeline([], {
  type: "hydrate",
  entries: [
    {
      ...committedTerminalUnit,
      timelineSeq: 2,
      timelineUnitId: "run:terminal-run:anchor:2",
    },
    {
      id: "message:trigger",
      role: "user",
      content: "trigger",
      timelineSeq: 1,
      timelineUnitId: "message:trigger",
    },
  ],
})
assert.deepEqual(
  orderedTimeline.map((entry) => entry.role),
  ["user", "assistant"],
  "canonical timeline order must not depend on response or merge array position"
)

let deeplyNestedPayload = "leaf"
for (let depth = 0; depth < 20_000; depth += 1) {
  deeplyNestedPayload = { child: deeplyNestedPayload }
}
const pluginEntry = {
  ...assistantHistoryEntry("plugin-entry", "plugin-run", ""),
  pane: {
    ...assistantHistoryEntry("plugin-entry", "plugin-run", "").pane,
    blockOrder: ["deep-plugin"],
    blocks: {
      "deep-plugin": {
        id: "deep-plugin",
        type: "plugin",
        node: { payload: deeplyNestedPayload },
      },
    },
  },
}
assert.doesNotThrow(
  () => measureConversationWindow([pluginEntry]),
  "deep plugin payload measurement must use an explicit stack"
)
const throwingPayload = {}
Object.defineProperty(throwingPayload, "broken", {
  enumerable: true,
  get() {
    throw new Error("unreadable plugin payload")
  },
})
const throwingEntry = {
  ...pluginEntry,
  id: "throwing-entry",
  pane: {
    ...pluginEntry.pane,
    blocks: {
      "deep-plugin": {
        ...pluginEntry.pane.blocks["deep-plugin"],
        node: { payload: throwingPayload },
      },
    },
  },
}
const defensiveCache = new ConversationWindowCache()
assert.doesNotThrow(() =>
  defensiveCache.set("throwing", {
    ...windowSnapshot("throwing"),
    entries: [throwingEntry],
  })
)
assert.equal(
  defensiveCache.get("throwing"),
  null,
  "an unmeasurable optional snapshot must be skipped"
)

console.log("chat web runtime checks passed")
