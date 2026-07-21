const RETURN_PATH_STORAGE_KEY = "ineffable.auth.return_path"
const AUTH_ENTRY_PATHS = new Set(["/", "/login", "/register"])

export type ReturnRouteState = {
  returnTo?: string
}

export function normalizeReturnPath(value?: string | null) {
  const candidate = value?.trim()
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return null
  }

  try {
    const parsed = new URL(candidate, "https://ineffable.local")
    if (parsed.origin !== "https://ineffable.local") {
      return null
    }

    if (AUTH_ENTRY_PATHS.has(parsed.pathname)) {
      return null
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

export function rememberReturnPath(value?: string | null) {
  if (typeof window === "undefined") {
    return null
  }

  const returnPath = normalizeReturnPath(
    value ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
  )
  if (!returnPath) {
    return null
  }

  try {
    window.sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, returnPath)
  } catch {
    // Route restoration is best-effort when storage is unavailable.
  }

  return returnPath
}

export function getReturnPath(candidate: string | null | undefined, fallback: string) {
  const directPath = normalizeReturnPath(candidate)
  if (directPath) {
    return directPath
  }

  if (typeof window !== "undefined") {
    try {
      const storedPath = normalizeReturnPath(
        window.sessionStorage.getItem(RETURN_PATH_STORAGE_KEY)
      )
      if (storedPath) {
        return storedPath
      }
    } catch {
      // Fall back to the caller-provided route when storage is unavailable.
    }
  }

  return fallback
}
