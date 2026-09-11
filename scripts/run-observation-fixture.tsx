import * as React from "react"
import { createRoot } from "react-dom/client"
import { RunObservationPanel } from "../src/features/chat/components/run-observation-panel"
import { Button } from "../src/components/ui/button"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"
await i18n.changeLanguage(new URLSearchParams(location.search).get("language") ?? "zh-CN")
function Fixture() {
  const [run, setRun] = React.useState<string | null>("run-a")
  React.useEffect(() => {
    Object.assign(window, { observationFixture: { select: setRun } })
  }, [])
  return <><Button onClick={() => setRun("run-a")}>Open</Button>
    {run && <RunObservationPanel key={run} accessToken="test-token" conversationId={run === "run-b" ? "conversation-b" : "conversation-a"} runId={run} onClose={() => setRun(null)} />}
  </>
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>)
