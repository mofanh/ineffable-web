import { AppSidebar } from "../src/features/workspace/app-sidebar"
import { createRoot } from "react-dom/client"
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom"
import { AppHeaderProvider, useAppHeader } from "../src/app/shell/app-header-context"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { WorkspaceObjectEditorPage } from "../src/pages/workspace-object-editor-page"
import { GatewayChatSidebar } from "../src/features/chat/gateway-chat-sidebar"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { AppConfirmProvider } from "../src/lib/app/confirm"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
const workspace = "00000000-0000-0000-0000-000000000001"
function Harness() {
  const { headerContent } = useAppHeader()
  const navigate = useNavigate()
  if (new URLSearchParams(location.search).has("tree")) return <SidebarProvider><TooltipProvider><AppSidebar /></TooltipProvider></SidebarProvider>
  return <><button onClick={() => navigate(`/workspace/${workspace}/objects/text`)}>Open text</button>
    <button onClick={() => navigate(`/workspace/${workspace}/objects/image`)}>Open image</button>
    <div className="grid grid-cols-2"><main><header>{headerContent?.leading}{headerContent?.trailing}</header>
      <Routes><Route path="/workspace/:workspaceId/objects/:objectId" element={<WorkspaceObjectEditorPage />} /></Routes>
    </main><SidebarProvider><TooltipProvider><GatewayChatSidebar isFullScreen onFullScreenChange={() => {}} /></TooltipProvider></SidebarProvider></div></>
}
await i18n.changeLanguage(new URLSearchParams(location.search).get("lang") || "en")
createRoot(document.getElementById("root")!).render(<MemoryRouter initialEntries={[`/workspace/${workspace}/objects/image`]}>
  <AppSessionProvider><AppHeaderProvider><AppConfirmProvider><Harness /></AppConfirmProvider></AppHeaderProvider></AppSessionProvider>
</MemoryRouter>)
