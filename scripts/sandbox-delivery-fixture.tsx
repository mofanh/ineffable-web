import * as React from "react"
import { createRoot } from "react-dom/client"
import { ChatComposer } from "../src/features/chat/components/chat-composer"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import "../src/lib/i18n/i18n"
import "../src/index.css"
const noop = () => {}
function Fixture() {
  const [selected, select] = React.useState("a")
  const [pending, update] = React.useState(2)
  React.useEffect(() => { Object.assign(window, { deliveryFixture: { select, update } }) }, [])
  return <SidebarProvider><TooltipProvider><ChatComposer
    isFullScreen={false} composer="" error={null} isSending={true} isSubmittingInput={false}
    canPromoteToGuided={false} canResumePreInputQueue={false} blockedPreInputRunStatus={null}
    pendingQueueAction="idle" preInputQueue={[]} agentDescriptorOptions={[]} modelOptions={[]}
    isModelCatalogLoaded={true} selectedModelProfileId="" sandboxOptions={[
      {environmentId:"a",label:"Remote A",status:"ready",resultDelivery:{pending_results:pending,oldest_pending_seconds:90,inspection_failed:false}},
      {environmentId:"b",label:"Remote B",status:"ready"}
    ]} isRefreshingSandboxOptions={false} selectedSandboxEnvironmentId={selected}
    capabilityExposureSelection={null} capabilityExposurePolicy={null} capabilityExposureDraftStatus="idle"
    capabilityCatalog={[]} capabilityCatalogStatus="idle" onCapabilityCatalogRefresh={noop}
    agentIterationRequested={false} agentIterationMode="disabled" isAgentIterationLoading={false}
    onComposerChange={noop} onComposerKeyDown={noop} onModelProfileChange={noop}
    onSandboxEnvironmentChange={select} onSandboxOptionsRefresh={noop} onCapabilityExposureChange={noop}
    onCapabilityExposureDraftRefresh={noop} onAgentIterationChange={noop} onSend={noop} onStop={noop}
    onPromoteToGuided={noop} onDeleteFromQueue={noop} onResumePreInputQueue={noop} onClearPreInputQueue={noop}
  /></TooltipProvider></SidebarProvider>
}
createRoot(document.getElementById("root")!).render(<Fixture />)
