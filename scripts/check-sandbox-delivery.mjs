import assert from "node:assert/strict"
import { sandboxDeliveryPresentation as present } from "../src/features/chat/model/sandbox-delivery-presentation.ts"
assert.equal(present(undefined), null)
assert.equal(present({ pending_results: 0, oldest_pending_seconds: 0, inspection_failed: false }), null)
assert.equal(present({ pending_results: 1, oldest_pending_seconds: 2, inspection_failed: false }).key, "chat.composer.sandboxDeliveryPending")
assert.equal(present({ pending_results: 2, oldest_pending_seconds: 60, inspection_failed: false }).key, "chat.composer.sandboxDeliveryRetrying")
assert.equal(present({ pending_results: 0, oldest_pending_seconds: 0, inspection_failed: true }).key, "chat.composer.sandboxDeliveryUnknown")
assert.equal(present({ pending_results: 5, oldest_pending_seconds: 0, inspection_failed: false, scan_truncated: true }).key, "chat.composer.sandboxDeliveryUnknown")
console.log("Sandbox delivery presentation checks passed")
