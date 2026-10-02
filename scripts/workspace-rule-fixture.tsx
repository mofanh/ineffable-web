import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppSessionProvider, useAuthSession } from "../src/features/auth/app-session"
import { ConversationPreferencesForm } from "../src/features/chat/components/conversation-preferences-form"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
function Fixture() {
  const { accessToken } = useAuthSession()
  return accessToken ? <ConversationPreferencesForm key={accessToken} accessToken={accessToken} /> : null
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><AppSessionProvider><Fixture /></AppSessionProvider></MemoryRouter>)
