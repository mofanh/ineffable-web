import { createRoot } from "react-dom/client"
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom"
import { AppHeaderProvider, useAppHeader } from "../src/app/shell/app-header-context"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { WorkspaceObjectEditorPage } from "../src/pages/workspace-object-editor-page"
import { AppConfirmProvider } from "../src/lib/app/confirm"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
function Harness() {
  const { headerContent } = useAppHeader()
  const navigate = useNavigate()
  const location = useLocation()
  return <><output data-testid="route">{location.pathname}</output>
    <button onClick={() => navigate("/workspace/w/objects/b")}>Open B</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <header>{headerContent?.leading}{headerContent?.trailing}</header>
    <Routes><Route path="/workspace/:workspaceId/objects/:objectId?" element={<WorkspaceObjectEditorPage />} /></Routes>
  </>
}
await i18n.changeLanguage("en")
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/workspace/w/objects/b", "/workspace/w/objects/a"]}>
    <AppSessionProvider><AppHeaderProvider><AppConfirmProvider><Harness /></AppConfirmProvider></AppHeaderProvider></AppSessionProvider>
  </MemoryRouter>
)
