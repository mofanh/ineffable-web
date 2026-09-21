import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import "./index.css"
import "@/lib/i18n/i18n"
import { AppToaster } from "@/components/app/app-toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { AppSessionProvider } from "@/features/auth/app-session"
import { installChunkLoadRecovery } from "@/lib/app/chunk-load-recovery"
import { router } from "@/routes/router"

installChunkLoadRecovery()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AppSessionProvider>
        <RouterProvider router={router} />
        <AppToaster />
      </AppSessionProvider>
    </ThemeProvider>
  </StrictMode>
)

// Optional observers load only when enabled. No SDK or network activity when off.
if (import.meta.env.VITE_TELEMETRY_ENABLED === "true") {
  let disposed = false
  let cleanup: (() => void) | undefined
  import.meta.hot?.dispose(() => { disposed = true; cleanup?.() })
  void import("@/lib/telemetry/browser").then(({ startBrowserTelemetry }) => {
    if (disposed) return
    const telemetry = startBrowserTelemetry(import.meta.env)
    if (!telemetry) return
    const unsubscribe = router.subscribe(state => telemetry.route(state.location.pathname))
    cleanup = () => { unsubscribe(); telemetry.stop() }
  }).catch(() => { /* Optional analytics must not affect application startup. */ })
}
