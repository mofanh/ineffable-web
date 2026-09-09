import * as React from "react"
import { createRoot } from "react-dom/client"
import { ChatComposer } from "../src/features/chat/components/chat-composer"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/lib/i18n/i18n"
import "../src/index.css"
import { useAgentDescriptors } from "../src/features/chat/model/use-agent-descriptors"
import { dispatchWorkspaceObjectsChanged } from "../src/lib/workspace-events"
const noop = () => {}
function Fixture() {
  const [composer, setComposer] = React.useState("")
  const [token, setToken] = React.useState("fixture-a")
  const descriptors = useAgentDescriptors(token, [{ id: "workspace-a", name: "A" }, { id: "workspace-b", name: "B" }])
  React.useEffect(() => { Object.assign(window, { efficiencyFixture: {
    setToken, change: () => dispatchWorkspaceObjectsChanged({ workspaceId: "workspace-a", action: "write_file" })
  } }) }, [])
  return <SidebarProvider><TooltipProvider><ChatComposer
    isFullScreen={false} composer={composer} error={null} isSending={false} isSubmittingInput={false}
    canPromoteToGuided={false} canResumePreInputQueue={false} blockedPreInputRunStatus={null}
    pendingQueueAction="idle" preInputQueue={[]} agentDescriptorOptions={descriptors.options}
    agentDescriptorsLoading={descriptors.loading} agentDescriptorsError={descriptors.error}
    onAgentMenuOpenChange={descriptors.setOpen} onAgentDescriptorsRetry={descriptors.refresh} modelOptions={[]}
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
