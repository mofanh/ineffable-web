import * as React from "react"
import { createRoot } from "react-dom/client"
import { AutomationRuntimeFields } from "../src/pages/agent-products/automation-runtime-fields"
import { updateAutomation, type AutomationRuntimeConfig } from "../src/lib/api/api-client"
import { i18n } from "../src/lib/i18n/i18n"
import "../src/index.css"

await i18n.changeLanguage("en")
function Fixture() {
  const [value, setValue] = React.useState<AutomationRuntimeConfig>({
    model_profile_id: "model-a", workspace_id: "workspace-a", sandbox: { environment_id: "sandbox-a" },
    capability_exposure: { mode: "custom", custom: { families: [], capabilities: Array.from({ length: 20 }, (_, i) => ({ provider_id: "backend", capability_id: `tool-${i}` })), discovery_scope: { kind: "disabled" } } },
  })
  return <main><AutomationRuntimeFields accessToken="test-token" conversationId="conversation-a" value={value} onChange={setValue} /><pre data-config>{JSON.stringify(value)}</pre><button onClick={() => void updateAutomation("test-token", "automation-a", { runtime_config: value })}>Save fixture</button></main>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
