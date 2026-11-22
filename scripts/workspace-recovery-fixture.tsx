import { createRoot } from "react-dom/client"
import { createMemoryRouter, RouterProvider, Routes, Route, useNavigate } from "react-router-dom"
import { AppSessionProvider, useAppSession } from "../src/features/auth/app-session"
import { SettingsOverlayProvider } from "../src/app/shell/settings-overlay-context"
import { AppSidebar } from "../src/features/workspace/app-sidebar"
import { WorkspaceFilesNavigator } from "../src/features/workspace/components/workspace-files-navigator"
import { useWorkspaceAccess } from "../src/features/workspace/hooks/use-workspace-access"
import { WorkspaceObjectEditorPage } from "../src/pages/workspace-object-editor-page"
import { GatewayChatSidebar } from "../src/features/chat/gateway-chat-sidebar"
import { AppHeaderProvider, useAppHeader } from "../src/app/shell/app-header-context"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { AppConfirmProvider } from "../src/lib/app/confirm"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

await i18n.changeLanguage("en")
function Harness() {
  const session = useAppSession()
  const navigate = useNavigate()
  const { headerContent } = useAppHeader()
  const { access } = useWorkspaceAccess("00000000-0000-0000-0000-000000000001")
  return <><div style={{ position: "fixed", top: 0, right: 0, zIndex: 100 }}><button onClick={() => session.selectConversation("first")}>Select first</button>
    <button onClick={() => session.selectConversation("other")}>Select other</button>
    <button onClick={() => navigate("/workspace/00000000-0000-0000-0000-000000000001/objects/second")}>Open second file</button>
    <button onClick={() => void session.logout()}>Log out</button></div>
    <SidebarProvider><TooltipProvider><AppSidebar />
      {/* The unified sidebar owns roots, not the full tree. Keep one real,
          authorized resource tree beside the editor to exercise both observers. */}
      <aside style={{ width: 280 }}>{access && <WorkspaceFilesNavigator workspace={access.workspace} canWrite={access.can_write} />}</aside>
      <main style={{ width: 500 }}><header>{headerContent?.leading}{headerContent?.trailing}</header>
        <Routes><Route path="/workspace/:workspaceId/objects/:objectId" element={<WorkspaceObjectEditorPage />} /></Routes>
      </main><div style={{ width: 550 }}><GatewayChatSidebar isFullScreen onFullScreenChange={() => {}} /></div>
    </TooltipProvider></SidebarProvider></>
}
const router = createMemoryRouter([{ path: "*", element:
  <AppSessionProvider><AppHeaderProvider><AppConfirmProvider><SettingsOverlayProvider><Harness /></SettingsOverlayProvider></AppConfirmProvider></AppHeaderProvider></AppSessionProvider>
}], { initialEntries: ["/workspace/00000000-0000-0000-0000-000000000001/objects/file"] })
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />)
