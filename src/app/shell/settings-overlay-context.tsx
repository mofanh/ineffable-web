import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { SettingsOverlay } from "./settings-overlay"
import { defaultPath } from "@/routes/navigation"

const SettingsContext = createContext<{ openSettings: (trigger?: HTMLElement) => void; isSettingsOpen: boolean } | null>(null)

// One Shell-owned presentation layer. Opening it never changes the route or
// touches conversation/run ownership; actual business navigation still blocks.
export function SettingsOverlayProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [origin, setOrigin] = useState<{ key: string } | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const dismissed = useRef(false)
  const deepLink = location.pathname === "/settings"
  if (origin && origin.key !== location.key) setOrigin(null)
  const openSettings = useCallback((element?: HTMLElement) => {
    trigger.current = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    dismissed.current = false
    setOrigin({ key: location.key })
  }, [location.key])
  const isSettingsOpen = deepLink || origin?.key === location.key
  return <SettingsContext.Provider value={{ openSettings, isSettingsOpen }}>
    {children}
    <SettingsOverlay open={isSettingsOpen} onClose={() => {
      dismissed.current = true
      setOrigin(null)
      if (deepLink) navigate(defaultPath, { replace: true })
    }} onCloseAutoFocus={event => {
      event.preventDefault()
      // A committed business navigation owns its own focus, not the old trigger.
      if (!dismissed.current) return
      dismissed.current = false
      const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>('[data-sidebar="trigger"]')
      target?.focus({ preventScroll: true })
    }} />
  </SettingsContext.Provider>
}

export function useSettingsOverlay() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error("SettingsOverlayProvider is required")
  return context
}
