export type AuthTokenSet = {
  access_token: string
  refresh_token: string
  access_expires_at: number
  refresh_expires_at: number
  session_id: string
}

export type AuthSessionSnapshot = {
  sessionId?: string | null
  accessToken: string | null
  refreshToken: string | null
  accessExpiresAt: number | null
  refreshExpiresAt: number | null
}

type AuthSessionRuntimeAdapter = {
  getSnapshot: () => AuthSessionSnapshot
  refresh: (refreshToken: string) => Promise<AuthTokenSet>
  onRefreshed: (tokens: AuthTokenSet) => void
  onExpired: () => void
  shouldExpireOnRefreshError?: (error: unknown) => boolean
  runRefreshExclusive?: <T>(run: () => Promise<T>, sessionId?: string | null) => Promise<T>
}

const EXPIRY_SECONDS_CUTOFF = 1_000_000_000_000

let adapter: AuthSessionRuntimeAdapter | null = null
let refreshFlight: {
  adapter: AuthSessionRuntimeAdapter
  sessionId: string | null | undefined
  promise: Promise<string | null>
} | null = null

// The signed sid is used only to fence browser operations. Authorization remains
// the gateway's responsibility; decoding here never grants access.
function tokenSessionId(token: string) {
  try {
    const payload = token.split(".")[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof claims.sid === "string" ? claims.sid : null
  } catch {
    return null
  }
}

function tokenMatchesSession(token: string, snapshot: AuthSessionSnapshot) {
  return token === snapshot.accessToken ||
    Boolean(snapshot.sessionId && tokenSessionId(token) === snapshot.sessionId)
}

export function captureAuthSession(accessToken?: string | null, expectedSessionId?: string) {
  if (!accessToken && expectedSessionId === undefined) return () => true
  const owner = adapter
  const snapshot = owner?.getSnapshot()
  const sessionId = snapshot?.sessionId ?? null
  const valid = (expectedSessionId === undefined || expectedSessionId === sessionId) &&
    (!owner || !accessToken || Boolean(snapshot && tokenMatchesSession(accessToken, snapshot)))
  return () => valid && adapter === owner && (owner?.getSnapshot().sessionId ?? null) === sessionId
}

export function normalizeAuthExpiry(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value < EXPIRY_SECONDS_CUTOFF ? value * 1000 : value
}

export function registerAuthSessionRuntime(
  nextAdapter: AuthSessionRuntimeAdapter
) {
  adapter = nextAdapter
  return () => {
    if (adapter === nextAdapter) {
      adapter = null
    }
  }
}

export function getLatestAccessToken(fallback?: string | null) {
  if (!fallback) return null
  const snapshot = adapter?.getSnapshot()
  return snapshot && tokenMatchesSession(fallback, snapshot)
    ? snapshot.accessToken
    : fallback
}

export function getCurrentAuthSessionId() {
  return adapter?.getSnapshot().sessionId ?? null
}

export function expireAuthSession() {
  adapter?.onExpired()
}

export function getAccessTokenRefreshDelay(
  expiresAt: number | null | undefined,
  refreshAheadMs = 60_000,
  now = Date.now()
) {
  const normalized = normalizeAuthExpiry(expiresAt)
  if (normalized === null) {
    return null
  }
  return Math.max(0, normalized - now - refreshAheadMs)
}

export async function refreshAuthSession(failedAccessToken?: string | null) {
  const currentAdapter = adapter
  if (!currentAdapter) {
    return null
  }

  const snapshot = currentAdapter.getSnapshot()
  const isCurrentSession = () => adapter === currentAdapter && currentAdapter.getSnapshot().sessionId === snapshot.sessionId
  if (failedAccessToken && snapshot.sessionId && !tokenMatchesSession(failedAccessToken, snapshot)) {
    return null
  }
  if (
    failedAccessToken &&
    snapshot.accessToken &&
    snapshot.accessToken !== failedAccessToken
  ) {
    return snapshot.accessToken
  }

  if (refreshFlight?.adapter === currentAdapter && refreshFlight.sessionId === snapshot.sessionId) {
    return refreshFlight.promise
  }

  if (!snapshot.refreshToken) {
    currentAdapter.onExpired()
    return null
  }

  const refreshExpiresAt = normalizeAuthExpiry(snapshot.refreshExpiresAt)
  if (refreshExpiresAt !== null && refreshExpiresAt <= Date.now()) {
    currentAdapter.onExpired()
    return null
  }

  const performRefresh = async () => {
    if (!isCurrentSession()) return null
    const latestSnapshot = currentAdapter.getSnapshot()
    if (
      snapshot.accessToken &&
      latestSnapshot.accessToken &&
      snapshot.accessToken !== latestSnapshot.accessToken
    ) {
      return latestSnapshot.accessToken
    }

    if (!latestSnapshot.refreshToken) {
      currentAdapter.onExpired()
      return null
    }

    const latestRefreshExpiresAt = normalizeAuthExpiry(
      latestSnapshot.refreshExpiresAt
    )
    if (
      latestRefreshExpiresAt !== null &&
      latestRefreshExpiresAt <= Date.now()
    ) {
      currentAdapter.onExpired()
      return null
    }

    const tokens = await currentAdapter.refresh(latestSnapshot.refreshToken)
    if (!isCurrentSession()) {
      return null
    }
    currentAdapter.onRefreshed(tokens)
    return tokens.access_token
  }

  const pendingRefresh = (
    currentAdapter.runRefreshExclusive?.(performRefresh, snapshot.sessionId) ?? performRefresh()
  )
    .then((refreshedAccessToken) => {
      if (!isCurrentSession()) {
        return null
      }
      return refreshedAccessToken
    })
    .catch((error: unknown) => {
      const shouldExpire =
        currentAdapter.shouldExpireOnRefreshError?.(error) ?? true
      if (isCurrentSession() && shouldExpire) {
        currentAdapter.onExpired()
      }
      return null
    })
    .finally(() => {
      if (refreshFlight?.promise === pendingRefresh) {
        refreshFlight = null
      }
    })

  refreshFlight = { adapter: currentAdapter, sessionId: snapshot.sessionId, promise: pendingRefresh }
  return pendingRefresh
}

export function ensureAuthSessionFresh(
  minimumValidityMs = 60_000,
  now = Date.now()
) {
  const snapshot = adapter?.getSnapshot()
  if (!snapshot?.accessToken) {
    return Promise.resolve<string | null>(null)
  }

  const expiresAt = normalizeAuthExpiry(snapshot.accessExpiresAt)
  if (expiresAt === null || expiresAt > now + minimumValidityMs) {
    return Promise.resolve(snapshot.accessToken)
  }

  return refreshAuthSession(snapshot.accessToken)
}
