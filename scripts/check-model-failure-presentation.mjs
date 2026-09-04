import assert from "node:assert/strict"

const { modelFailurePresentationFromEvent } = await import(
  "../src/features/chat/model/model-failure-presentation.ts"
)

const rateLimited = modelFailurePresentationFromEvent({
  event: "run.failed",
  content: "Model error: inference tpm exhausted",
  metadata: {
    failure: {
      category: "model_rate_limited",
      cause: "Model error: inference tpm exhausted",
      model_failure: {
        category: "rate_limited",
        retryable: true,
        http_status: 429,
        retry_after_ms: 23_000,
        provider_code: "429001",
        provider_message: "inference tpm exhausted",
        provider_request_id: "request-429",
      },
    },
  },
})

assert.equal(rateLimited?.translationKey, "rateLimited")
assert.equal(rateLimited?.retryAfterMs, 23_000)
assert.equal(rateLimited?.providerCode, "429001")
assert.equal(rateLimited?.providerMessage, "inference tpm exhausted")
assert.equal(rateLimited?.providerRequestId, "request-429")

const privateFailure = modelFailurePresentationFromEvent({
  event: "run.failed",
  content: "provider-specific failure",
  metadata: {
    failure: {
      category: "provider_private_failure",
      model_failure: {
        provider_code: "private-code",
        provider_message: "private meaning",
      },
    },
  },
})

assert.equal(privateFailure?.translationKey, null)
assert.equal(privateFailure?.fallbackMessage, "provider-specific failure")
assert.equal(privateFailure?.providerCode, "private-code")

const sanitized = modelFailurePresentationFromEvent({
  event: "run.failed",
  metadata: {
    failure: {
      category: "model_transport",
      cause: "fallback\u0000 cause",
      model_failure: { provider_message: "bad\u0000 message" },
    },
  },
})

assert.equal(sanitized?.fallbackMessage, "fallback� cause")
assert.equal(sanitized?.providerMessage, "bad� message")

assert.equal(modelFailurePresentationFromEvent({ event: "run.completed" }), null)

console.log("model failure presentation checks passed")
