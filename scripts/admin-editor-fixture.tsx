import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppHeaderProvider } from "../src/app/shell/app-header-context"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { SystemPlanManagementPage } from "../src/pages/system-management/plans-page"
import { SystemUserManagementPage } from "../src/pages/system-management/users-page"
import { AppConfirmProvider } from "../src/lib/app/confirm"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
const users = new URLSearchParams(location.search).get("page") === "users"
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><AppSessionProvider><AppHeaderProvider><AppConfirmProvider>
    {users ? <SystemUserManagementPage /> : <SystemPlanManagementPage />}
  </AppConfirmProvider></AppHeaderProvider></AppSessionProvider></MemoryRouter>
)
