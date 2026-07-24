import { ApiRequestError } from "@/lib/app/api-errors"
import {
  getLatestAccessToken,
  refreshAuthSession,
} from "@/lib/api/auth-session-runtime"

const API_BASE_URL =
  (import.meta.env.VITE_GATEWAY_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  ""

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

export function createApiError(message: string, status?: number) {
  return new ApiRequestError(message, { status })
}

async function responseHasExpiredAccessToken(response: Response) {
  if (response.status === 401) {
    return true
  }
  if (response.ok) {
    return false
  }

  try {
    return isAccessTokenExpiredError(await response.clone().text())
  } catch {
    return false
  }
}

export async function requestApi(
  path: string,
  options?: RequestInit & {
    accessToken?: string | null
    workspaceId?: string | null
  }
) {
  const { accessToken, workspaceId, headers, ...requestInit } = options ?? {}
  const performRequest = (token: string | null) =>
    fetch(toApiUrl(path), {
      ...requestInit,
      headers: {
        ...buildApiHeaders({
          accessToken: token,
          workspaceId,
          accept:
            typeof headers === "object" && headers
              ? new Headers(headers).get("Accept") ?? undefined
              : undefined,
        }),
        ...(headers ? Object.fromEntries(new Headers(headers).entries()) : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  const initialAccessToken = getLatestAccessToken(accessToken)
  const response = await performRequest(initialAccessToken)
  if (
    !accessToken ||
    !(await responseHasExpiredAccessToken(response))
  ) {
    return response
  }

  const refreshedAccessToken = await refreshAuthSession(initialAccessToken)
  if (!refreshedAccessToken) {
    return response
  }

  return performRequest(refreshedAccessToken)
}

export async function requestApiJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    accessToken?: string | null
    workspaceId?: string | null
    body?: unknown
  },
) {
  const response = await requestApi(path, {
    method: options?.method ?? "GET",
    accessToken: options?.accessToken,
    workspaceId: options?.workspaceId,
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw createApiError(await parseApiError(response), response.status)
  }

  return (await response.json()) as T
}
