import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppSessionProvider } from "../src/features/auth/app-session"
import { AppHeaderProvider } from "../src/app/shell/app-header-context"
import { ChannelsPage } from "../src/pages/agent-products/channels-page"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
createRoot(document.getElementById("root")!).render(<MemoryRouter><AppSessionProvider><AppHeaderProvider><ChannelsPage /></AppHeaderProvider></AppSessionProvider></MemoryRouter>)
