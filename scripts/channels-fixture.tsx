import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import { AppSessionProvider, useConversationSession } from "../src/features/auth/app-session"
import { AppHeaderProvider } from "../src/app/shell/app-header-context"
import { ChannelsPage } from "../src/pages/agent-products/channels-page"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage("en")
function SelectionProbe() {
 const { currentConversationId, selectConversation } = useConversationSession()
 return <><button onClick={() => selectConversation("other")}>Select other fixture</button><output data-selection>{currentConversationId}</output></>
}
createRoot(document.getElementById("root")!).render(<MemoryRouter><AppSessionProvider><AppHeaderProvider><ChannelsPage /><SelectionProbe /></AppHeaderProvider></AppSessionProvider></MemoryRouter>)
