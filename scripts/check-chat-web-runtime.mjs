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
import { splitIncrementalMarkdown } from "../src/features/chat/runtime/incremental-markdown.ts"
import {
  extractWorkspaceArtifact,
  workspaceArtifactHref,
} from "../src/features/chat/runtime/workspace-artifacts.ts"

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

console.log("chat web runtime checks passed")
