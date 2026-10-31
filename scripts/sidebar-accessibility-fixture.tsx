import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Sidebar, SidebarInset, SidebarMenuButton, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import "@/index.css"

const collapsible = new URLSearchParams(window.location.search).get("variant") === "none" ? "none" : "icon"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider><SidebarProvider defaultOpen={false} persistCookie={false} keyboardShortcut={false}>
      <Sidebar collapsible={collapsible}>
        <SidebarMenuButton aria-label="Visible sidebar control" tooltip="Visible sidebar tooltip">V</SidebarMenuButton>
      </Sidebar>
      <SidebarInset><button type="button">Outside control</button></SidebarInset>
    </SidebarProvider></TooltipProvider>
  </StrictMode>
)
