import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppSessionProvider, RequireAuth, useAppSession } from "../src/features/auth/app-session"
import { GatewayChatSidebar } from "../src/features/chat/gateway-chat-sidebar"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { AppToaster } from "../src/components/app/app-toaster"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
function Fixture() {
  const session = useAppSession()
  return <><div><output data-session>{session.currentSessionId ?? "none"}</output><output data-selection>{session.currentConversationId ?? "new"}</output><output data-selection-version>{session.getConversationSelectionIdentity().version}</output>
    <button onClick={() => void session.selectWorkspace(session.currentWorkspace!.id)}>Reselect workspace</button>
    <button onClick={() => void session.refreshAppData()}>Refresh account</button>
    <button onClick={() => void session.logout()}>Logout</button>
    <button onClick={() => session.selectConversation("other")}>Select other</button>
    <button onClick={() => session.selectConversation("first")}>Select first</button>
    <button onClick={() => void session.createConversation("helper")}>Create through session</button>
  </div><RequireAuth><SidebarProvider><TooltipProvider><GatewayChatSidebar isFullScreen onFullScreenChange={() => {}} /></TooltipProvider></SidebarProvider></RequireAuth><AppToaster /></>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><AppSessionProvider><Fixture /></AppSessionProvider></MemoryRouter>)
