import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"

import "./index.css"
import { AppToaster } from "@/components/app"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import { AppSessionProvider } from "@/features/auth/app-session"
import { AppConfirmProvider } from "@/lib/app/confirm"
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
        <AppConfirmProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
            <AppToaster />
          </TooltipProvider>
        </AppConfirmProvider>
      </AppSessionProvider>
    </ThemeProvider>
  </StrictMode>
)
