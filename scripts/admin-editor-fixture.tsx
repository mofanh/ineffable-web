import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppHeaderProvider } from "../src/app/shell/app-header-context"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { SystemPlanManagementPage } from "../src/pages/system-management/plans-page"
import { SystemUserManagementPage } from "../src/pages/system-management/users-page"
import { SystemModelManagementPage } from "../src/pages/system-management/models-page"
import { SystemSecretManagementPage } from "../src/pages/system-management/secrets-page"
import { AppConfirmProvider } from "../src/lib/app/confirm"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage(new URLSearchParams(location.search).get("language") ?? "en")
const page = new URLSearchParams(location.search).get("page")
const Page = page === "users" ? SystemUserManagementPage : page === "models" ? SystemModelManagementPage : page === "secrets" ? SystemSecretManagementPage : SystemPlanManagementPage
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><AppSessionProvider><AppHeaderProvider><AppConfirmProvider>
    <div className="p-4 sm:p-6"><Page /></div>
  </AppConfirmProvider></AppHeaderProvider></AppSessionProvider></MemoryRouter>
)
