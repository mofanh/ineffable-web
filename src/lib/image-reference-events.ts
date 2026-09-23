import type { ImageReference } from "./image-reference"

export const IMAGE_REFERENCE_REQUEST = "ineffable:image-reference-request"
export const IMAGE_REFERENCE_TARGET_PROBE = "ineffable:image-reference-target-probe"
export const IMAGE_REFERENCE_TARGET_READY = "ineffable:image-reference-target-ready"
type SelectionIdentity = { sessionId: string; version: number }
export type ImageReferenceRequest = CustomEvent<SelectionIdentity & { image: ImageReference }>

// Prepare presentation only. The caller retains its image and frozen selection;
// this handshake does not accept an attachment or create a second draft queue.
export function prepareImageReferenceTarget(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const probe = () => !window.dispatchEvent(new Event(IMAGE_REFERENCE_TARGET_PROBE, { cancelable: true }))
    const finish = (ready: boolean) => {
      window.clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      window.removeEventListener(IMAGE_REFERENCE_TARGET_READY, onReady)
      resolve(ready)
    }
    const abort = () => finish(false)
    const onReady = () => { if (probe()) finish(true) }
    const timer = window.setTimeout(() => finish(false), 10_000)
    signal.addEventListener("abort", abort, { once: true })
    window.addEventListener(IMAGE_REFERENCE_TARGET_READY, onReady)
    if (probe()) finish(true)
    else window.dispatchEvent(new Event("ineffable:right-sidebar:open"))
  })
}

// Synchronous UI intent only. The mounted composer owns the draft and accepts it.
export function requestImageReference(selection: SelectionIdentity, image: ImageReference) {
  return !window.dispatchEvent(new CustomEvent(IMAGE_REFERENCE_REQUEST, {
    cancelable: true, detail: { ...selection, image },
  }))
}
