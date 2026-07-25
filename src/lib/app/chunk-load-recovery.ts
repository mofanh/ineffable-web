const CHUNK_RELOAD_ATTEMPT_KEY = "ineffable:chunk-reload-attempt"
const CHUNK_RELOAD_COOLDOWN_MS = 60_000
const CHUNK_RELOAD_STABLE_MS = 10_000

function readLastReloadAttempt() {
  const value = Number(window.sessionStorage.getItem(CHUNK_RELOAD_ATTEMPT_KEY))
  return Number.isFinite(value) ? value : 0
}

export function isChunkLoadError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : ""

  return [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "error loading dynamically imported module",
  ].some((pattern) => message.includes(pattern))
}

export function reloadAfterRouteError() {
  window.sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPT_KEY)
  window.location.reload()
}

export function installChunkLoadRecovery() {
  function handlePreloadError(event: Event) {
    const now = Date.now()
    const lastAttempt = readLastReloadAttempt()

    if (lastAttempt > 0 && now - lastAttempt < CHUNK_RELOAD_COOLDOWN_MS) {
      return
    }

    event.preventDefault()
    window.sessionStorage.setItem(CHUNK_RELOAD_ATTEMPT_KEY, String(now))
    window.location.reload()
  }

  window.addEventListener("vite:preloadError", handlePreloadError)
  window.setTimeout(() => {
    window.sessionStorage.removeItem(CHUNK_RELOAD_ATTEMPT_KEY)
  }, CHUNK_RELOAD_STABLE_MS)
}
