import type { ImageReference } from "./image-reference"

export const IMAGE_REFERENCE_REQUEST = "ineffable:image-reference-request"
export type ImageReferenceRequest = CustomEvent<{ sessionId: string; image: ImageReference }>

// Synchronous UI intent only. The mounted composer owns the draft and accepts it.
export function requestImageReference(sessionId: string, image: ImageReference) {
  return !window.dispatchEvent(new CustomEvent(IMAGE_REFERENCE_REQUEST, {
    cancelable: true, detail: { sessionId, image },
  }))
}
