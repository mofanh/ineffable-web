import { createRoot } from "react-dom/client"
import { GatewayChatSidebar } from "../src/features/chat/gateway-chat-sidebar"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/lib/i18n/i18n"
import "../src/index.css"
createRoot(document.getElementById("root")!).render(
  <SidebarProvider><TooltipProvider><GatewayChatSidebar isFullScreen={true} onFullScreenChange={() => {}} /></TooltipProvider></SidebarProvider>
)
