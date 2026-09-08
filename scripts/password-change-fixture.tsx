import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppHeaderProvider } from "../src/app/shell/app-header-context"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { AccountPage } from "../src/pages/account-pages"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

await i18n.changeLanguage("en")
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><AppSessionProvider><AppHeaderProvider><AccountPage /></AppHeaderProvider></AppSessionProvider></MemoryRouter>
)
