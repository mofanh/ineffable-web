import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import "./index.css"
import { AppToaster } from "@/components/app/app-toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { AppSessionProvider } from "@/features/auth/app-session"
import { router } from "@/routes/router"

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
