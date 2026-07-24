export type AuthTokenSet = {
  access_token: string
  refresh_token: string
  access_expires_at: number
  refresh_expires_at: number
  session_id: string
}

export type AuthSessionSnapshot = {
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
}

const EXPIRY_SECONDS_CUTOFF = 1_000_000_000_000

let adapter: AuthSessionRuntimeAdapter | null = null
let refreshPromise: Promise<string | null> | null = null

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
  return adapter?.getSnapshot().accessToken || fallback || null
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
  if (
    failedAccessToken &&
    snapshot.accessToken &&
    snapshot.accessToken !== failedAccessToken
  ) {
    return snapshot.accessToken
  }

  if (refreshPromise) {
    return refreshPromise
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

  const pendingRefresh = currentAdapter
    .refresh(snapshot.refreshToken)
    .then((tokens) => {
      if (adapter !== currentAdapter) {
        return null
      }
      currentAdapter.onRefreshed(tokens)
      return tokens.access_token
    })
    .catch(() => {
      if (adapter === currentAdapter) {
        currentAdapter.onExpired()
      }
      return null
    })
    .finally(() => {
      if (refreshPromise === pendingRefresh) {
        refreshPromise = null
      }
    })

  refreshPromise = pendingRefresh
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
