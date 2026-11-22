import { useCallback, useState, useSyncExternalStore } from "react"
import { useAuthSession } from "@/features/auth/app-session"
import { AUTO_RAIL_BREAKPOINT, SIDEBAR_DEFAULT } from "./workbench-layout"

function subscribeViewport(update: () => void) {
  window.addEventListener("resize", update)
  return () => window.removeEventListener("resize", update)
}
const readViewport = () => window.innerWidth
const serverViewport = () => 1440

function readOpen(key: string) {
  try { return localStorage.getItem(key) !== "false" } catch { return true }
}
function defaults(identity: string, key: string) {
  return { identity, desktopOpen: readOpen(key), mediumOpen: false, sidebar: SIDEBAR_DEFAULT, right: null as number | null }
}

// Width preferences are memory-only and scoped to the current authenticated session.
// Auto rail and drawer never mutate the user's account-scoped desktop preference.
export function useWorkbenchLayout() {
  const { currentUser, currentSessionId } = useAuthSession()
  const identity = `${currentUser?.id ?? ""}:${currentSessionId ?? ""}`
  const preferenceKey = `ineffable.ui.navigation.${currentUser?.id ?? "anonymous"}.open`
  const width = useSyncExternalStore(subscribeViewport, readViewport, serverViewport)
  const [stored, setStored] = useState(() => defaults(identity, preferenceKey))
  const preferences = stored.identity === identity ? stored : defaults(identity, preferenceKey)
  const [preview, setPreview] = useState<{ identity: string; sidebar?: number | null; right?: number | null }>({ identity })
  const updatePreview = useCallback((patch: { sidebar?: number | null; right?: number | null }) => {
    setPreview(current => ({ ...(current.identity === identity ? current : { identity }), ...patch }))
  }, [identity])
  const activePreview = preview.identity === identity ? preview : null
  const medium = width < AUTO_RAIL_BREAKPOINT
  const update = useCallback((patch: Partial<Omit<typeof stored, "identity">>) => {
    setStored(current => ({ ...(current.identity === identity ? current : defaults(identity, preferenceKey)), ...patch }))
  }, [identity, preferenceKey])
  const setOpen = useCallback((open: boolean) => {
    update(medium ? { mediumOpen: open } : { desktopOpen: open })
    if (!medium) {
      try { localStorage.setItem(preferenceKey, String(open)) } catch { /* Storage may be unavailable. */ }
    }
  }, [medium, preferenceKey, update])
  return { width, open: medium ? preferences.mediumOpen : preferences.desktopOpen, setOpen, sidebar: activePreview?.sidebar ?? preferences.sidebar, right: activePreview?.right ?? preferences.right, update, updatePreview }
}
