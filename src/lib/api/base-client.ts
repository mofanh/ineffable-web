const API_BASE_URL =
  (import.meta.env.VITE_GATEWAY_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  ""

const AUTH_STORAGE_KEYS = {
  accessToken: "ineffable.auth.access_token",
  refreshToken: "ineffable.auth.refresh_token",
  sessionId: "ineffable.auth.session_id",
}

export const BASE_CLIENT_TOAST_EVENT = "ineffable:base-client-toast"

export type BaseClientToastDetail = {
  title: string
  description: string
  actionLabel?: string
}

let tokenRefreshStarted = false
let tokenRefreshReloading = false
let tokenRefreshTimer: number | null = null

export function getApiBaseUrl() {
  return API_BASE_URL || "(same-origin)"
}

export function toApiUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  const normalizedBase = API_BASE_URL.replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

export function buildApiHeaders(options?: {
  accessToken?: string | null
  workspaceId?: string | null
  accept?: string
}) {
  const headers: Record<string, string> = {
    Accept: options?.accept ?? "application/json",
  }

  if (options?.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  if (options?.workspaceId) {
    headers["x-tenant-id"] = options.workspaceId
  }

  return headers
}

export function createIdempotencyKey(prefix = "web") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return `${prefix}-${random}`
}

export async function parseApiError(response: Response) {
  const text = await response.text()

  try {
    const parsed = JSON.parse(text) as { error?: string }
    return parsed.error || text || `Request failed: ${response.status}`
  } catch {
    return text || `Request failed: ${response.status}`
  }
}

export function isAccessTokenExpiredError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""

  return (
    message.includes("ExpiredSignature") ||
    message.toLowerCase().includes("invalid access token")
  )
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return
  }

  if (value) {
    window.localStorage.setItem(key, value)
    return
  }

  window.localStorage.removeItem(key)
}

function showBaseClientToast(detail: BaseClientToastDetail) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent<BaseClientToastDetail>(BASE_CLIENT_TOAST_EVENT, {
      detail,
    })
  )
}

async function refreshAccessTokenForReload() {
  if (typeof window === "undefined") {
    return
  }

  const refreshToken = window.localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken)
  if (!refreshToken) {
    writeStorage(AUTH_STORAGE_KEYS.accessToken, null)
    writeStorage(AUTH_STORAGE_KEYS.sessionId, null)
    return
  }

  const response = await fetch(toApiUrl("/gateway/v1/auth/refresh"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) {
    writeStorage(AUTH_STORAGE_KEYS.accessToken, null)
    writeStorage(AUTH_STORAGE_KEYS.refreshToken, null)
    writeStorage(AUTH_STORAGE_KEYS.sessionId, null)
    return
  }

  const parsed = (await response.json()) as {
    tokens?: {
      access_token?: string
      refresh_token?: string
      session_id?: string
    }
  }

  writeStorage(AUTH_STORAGE_KEYS.accessToken, parsed.tokens?.access_token ?? null)
  writeStorage(AUTH_STORAGE_KEYS.refreshToken, parsed.tokens?.refresh_token ?? null)
  writeStorage(AUTH_STORAGE_KEYS.sessionId, parsed.tokens?.session_id ?? null)
}

export function refreshExpiredSessionNow() {
  if (typeof window === "undefined" || tokenRefreshReloading) {
    return
  }

  tokenRefreshReloading = true
  if (tokenRefreshTimer != null) {
    window.clearTimeout(tokenRefreshTimer)
    tokenRefreshTimer = null
  }

  void refreshAccessTokenForReload().finally(() => {
    window.location.reload()
  })
}

function scheduleExpiredSessionRefresh(delayMs = 1400) {
  if (
    typeof window === "undefined" ||
    tokenRefreshStarted ||
    tokenRefreshReloading
  ) {
    return
  }

  tokenRefreshStarted = true
  showBaseClientToast({
    title: "登录状态已过期",
    description: "正在重新同步会话，页面将自动刷新。",
    actionLabel: "立即刷新",
  })

  tokenRefreshTimer = window.setTimeout(() => {
    refreshExpiredSessionNow()
  }, delayMs)
}

export function createApiError(message: string) {
  if (isAccessTokenExpiredError(message)) {
    scheduleExpiredSessionRefresh()
    return new Error("登录状态已过期，正在刷新页面。")
  }
  return new Error(message)
}

export async function requestApiJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    accessToken?: string | null
    workspaceId?: string | null
    body?: unknown
  }
) {
  const response = await fetch(toApiUrl(path), {
    method: options?.method ?? "GET",
    headers: {
      ...buildApiHeaders({
        accessToken: options?.accessToken,
        workspaceId: options?.workspaceId,
      }),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw createApiError(await parseApiError(response))
  }

  return (await response.json()) as T
}
