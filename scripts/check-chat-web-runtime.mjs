import assert from "node:assert/strict"

import {
  VisualUpdateScheduler,
} from "../src/features/chat/runtime/visual-update-scheduler.ts"
import {
  createDefaultWebNode,
  isWebNodeView,
  webNodeRendererKey,
} from "../src/features/chat/web-node.ts"
import { WebNodeProjectionCache } from "../src/features/chat/runtime/web-node-projection.ts"

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

console.log("chat web runtime checks passed")
