const API_BASE_URL =
  (import.meta.env.VITE_GATEWAY_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  ""

export const GATEWAY_AUTH_EXPIRED_EVENT = "ineffable:auth-expired"

export function getGatewayApiBaseUrl() {
  return API_BASE_URL || "(same-origin)"
}

export function toGatewayUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  const normalizedBase = API_BASE_URL.replace(/\/$/, "")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${normalizedBase}${normalizedPath}`
}

export function buildGatewayHeaders(options?: {
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

export async function parseGatewayError(response: Response) {
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

function notifyAccessTokenExpired(message: string) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent(GATEWAY_AUTH_EXPIRED_EVENT, {
      detail: { message },
    })
  )
}

export function createGatewayError(message: string) {
  const error = new Error(message)
  if (isAccessTokenExpiredError(message)) {
    notifyAccessTokenExpired(message)
  }
  return error
}

export async function requestGatewayJson<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
    accessToken?: string | null
    workspaceId?: string | null
    body?: unknown
  }
) {
  const response = await fetch(toGatewayUrl(path), {
    method: options?.method ?? "GET",
    headers: {
      ...buildGatewayHeaders({
        accessToken: options?.accessToken,
        workspaceId: options?.workspaceId,
      }),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw createGatewayError(await parseGatewayError(response))
  }

  return (await response.json()) as T
}
