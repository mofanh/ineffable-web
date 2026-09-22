import * as React from "react"
import { createRoot } from "react-dom/client"
import { AppSessionProvider, useAppSession } from "../src/features/auth/app-session"
import * as client from "../src/lib/api/base-client"
function Fixture() {
  const session = useAppSession()
  Object.assign(window, { session, client })
  return <pre id="snapshot">{JSON.stringify({ status: session.status, user: session.currentUser?.id, conversations: session.conversations.map(c => c.id), bootstrapping: session.isBootstrapping })}</pre>
}
createRoot(document.getElementById("root")!).render(<AppSessionProvider><Fixture /></AppSessionProvider>)
