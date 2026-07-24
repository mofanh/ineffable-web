import assert from "node:assert/strict"

const {
  ensureAuthSessionFresh,
  getAccessTokenRefreshDelay,
  getLatestAccessToken,
  normalizeAuthExpiry,
  refreshAuthSession,
  registerAuthSessionRuntime,
} = await import("../src/lib/api/auth-session-runtime.ts")

const now = Date.now()
assert.equal(normalizeAuthExpiry(1_800_000_000), 1_800_000_000_000)
assert.equal(normalizeAuthExpiry(1_800_000_000_000), 1_800_000_000_000)
assert.equal(normalizeAuthExpiry(0), null)
assert.equal(getAccessTokenRefreshDelay(now + 120_000, 60_000, now), 60_000)

let snapshot = {
  accessToken: "access-old",
  refreshToken: "refresh-old",
  accessExpiresAt: now - 1,
  refreshExpiresAt: now + 600_000,
}
let refreshCalls = 0
let expiredCalls = 0
const unregister = registerAuthSessionRuntime({
  getSnapshot: () => snapshot,
  refresh: async () => {
    refreshCalls += 1
    await Promise.resolve()
    return {
      access_token: "access-new",
      refresh_token: "refresh-new",
      access_expires_at: now + 300_000,
      refresh_expires_at: now + 900_000,
      session_id: "session-new",
    }
  },
  onRefreshed: (tokens) => {
    snapshot = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: tokens.access_expires_at,
      refreshExpiresAt: tokens.refresh_expires_at,
    }
  },
  onExpired: () => {
    expiredCalls += 1
  },
})

const refreshed = await Promise.all([
  refreshAuthSession("access-old"),
  refreshAuthSession("access-old"),
  ensureAuthSessionFresh(60_000, now),
])
assert.deepEqual(refreshed, ["access-new", "access-new", "access-new"])
assert.equal(refreshCalls, 1)
assert.equal(expiredCalls, 0)
assert.equal(getLatestAccessToken("fallback"), "access-new")

assert.equal(await refreshAuthSession("access-old"), "access-new")
assert.equal(refreshCalls, 1)
assert.equal(await ensureAuthSessionFresh(60_000, now), "access-new")
assert.equal(refreshCalls, 1)
unregister()

let failedExpiredCalls = 0
const unregisterFailed = registerAuthSessionRuntime({
  getSnapshot: () => ({
    accessToken: "access-failed",
    refreshToken: "refresh-failed",
    accessExpiresAt: now - 1,
    refreshExpiresAt: now + 60_000,
  }),
  refresh: async () => {
    throw new Error("refresh failed")
  },
  onRefreshed: () => {
    throw new Error("unexpected refresh")
  },
  onExpired: () => {
    failedExpiredCalls += 1
  },
})

assert.equal(await refreshAuthSession("access-failed"), null)
assert.equal(failedExpiredCalls, 1)
unregisterFailed()

console.log("auth session runtime checks passed")
