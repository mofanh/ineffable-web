import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Sidebar, SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import "@/index.css"

const collapsible = new URLSearchParams(window.location.search).get("variant") === "none" ? "none" : "icon"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidebarProvider defaultOpen={false} persistCookie={false} keyboardShortcut={false}>
      <Sidebar collapsible={collapsible}>
        <button type="button" aria-label="Visible sidebar control">V</button>
      </Sidebar>
      <SidebarInset><button type="button">Outside control</button></SidebarInset>
    </SidebarProvider>
  </StrictMode>
)
