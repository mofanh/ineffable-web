import * as React from "react"
import { createRoot } from "react-dom/client"
import { ChatComposer } from "../src/features/chat/components/chat-composer"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/lib/i18n/i18n"
import "../src/index.css"
import { dispatchWorkspaceObjectsChanged } from "../src/lib/workspace-events"
const noop = () => {}
function Fixture() {
  const [composer, setComposer] = React.useState("")
  const [scope, setScope] = React.useState("chat-a")
  const [token, setToken] = React.useState("fixture-a")
  React.useEffect(() => { Object.assign(window, { efficiencyFixture: {
    setToken, setScope, setComposer, getComposer: () => composer, change: () => dispatchWorkspaceObjectsChanged({ workspaceId: "11111111-1111-1111-1111-111111111111", action: "write_file" })
  } }) }, [composer])
  return <SidebarProvider><TooltipProvider><ChatComposer
    isFullScreen={false} composer={composer} error={null} isSending={false} isSubmittingInput={false}
    canPromoteToGuided={false} canResumePreInputQueue={false} blockedPreInputRunStatus={null}
    pendingQueueAction="idle" preInputQueue={[]} accessToken={token} fileReferenceScope={scope} workspaces={[{ id: "11111111-1111-1111-1111-111111111111", name: "A" }, { id: "22222222-2222-2222-2222-222222222222", name: "B" }]}
    modelOptions={[]}
    isModelCatalogLoaded={true} selectedModelProfileId="" sandboxOptions={[]} isRefreshingSandboxOptions={false} selectedSandboxEnvironmentId=""
    capabilityExposureSelection={null} capabilityExposurePolicy={null} capabilityExposureDraftStatus="idle"
    capabilityCatalog={[]} capabilityCatalogStatus="idle" onCapabilityCatalogRefresh={noop}
    agentIterationRequested={false} agentIterationMode="disabled" isAgentIterationLoading={false}
    onComposerChange={setComposer} onComposerKeyDown={noop} onModelProfileChange={noop}
    onSandboxEnvironmentChange={noop} onSandboxOptionsRefresh={noop} onCapabilityExposureChange={noop}
    onCapabilityExposureDraftRefresh={noop} onAgentIterationChange={noop} onSend={noop} onStop={noop}
    onPromoteToGuided={noop} onDeleteFromQueue={noop} onResumePreInputQueue={noop} onClearPreInputQueue={noop}
  /></TooltipProvider></SidebarProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
