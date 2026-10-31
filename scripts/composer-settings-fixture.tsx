import * as React from "react"
import { createRoot } from "react-dom/client"
import { useTranslation } from "react-i18next"
import { ChatComposer } from "../src/features/chat/components/chat-composer"
import { ImageAttachmentActions } from "../src/features/chat/components/image-attachment-actions"
import { InputGroup, InputGroupInput } from "../src/components/ui/input-group"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { i18n } from "../src/lib/i18n/i18n"
import type { CapabilityExposureSelection } from "../src/lib/api/api-client"
import "../src/index.css"

const params = new URLSearchParams(location.search)
const width = Number(params.get("width") || "390")
await i18n.changeLanguage(params.get("lang") || "en-US")
document.documentElement.classList.toggle("dark", params.get("theme") === "dark")
const longModelName = "Research model with a deliberately long display name / 带完整名称的长模型 · 128K"
const noop = () => {}

function Fixture() {
  const { t } = useTranslation()
  const [composer, setComposer] = React.useState("")
  const [scope, setScope] = React.useState("conversation-a")
  const [model, setModel] = React.useState("long")
  const [sandbox, setSandbox] = React.useState("a")
  const [selection, setSelection] = React.useState<CapabilityExposureSelection>({ mode: "smart" })
  const [iteration, setIteration] = React.useState(false)
  const [live, setLive] = React.useState(false)
  const [sandboxError, setSandboxError] = React.useState<string | null>(null)
  const [sandboxLoading, setSandboxLoading] = React.useState(false)
  const calls = React.useRef<{ action: string; value?: unknown }[]>([])
  const record = (action: string, value?: unknown) => calls.current.push({ action, value })
  React.useEffect(() => {
    Object.assign(window, { composerSettingsFixture: {
      setScope, setLive, setSandboxError, setSandboxLoading,
      snapshot: () => ({ composer, scope, model, sandbox, selection, iteration, calls: calls.current }),
    } })
  }, [composer, scope, model, sandbox, selection, iteration])

  return <SidebarProvider><TooltipProvider>
    <InputGroup className="m-3 max-w-48" data-disabled-control-fixture>
      <InputGroupInput disabled aria-label="Disabled control fixture" />
    </InputGroup>
    <div className="fixed bottom-0 left-0 max-w-full bg-background" style={{ width }} data-composer-fixture>
      <ChatComposer
        isFullScreen={false} composer={composer} isSending={live} canStop={live} isSubmittingInput={false}
        canPromoteToGuided={false} canResumePreInputQueue={false} blockedPreInputRunStatus={null}
        pendingQueueAction="idle" preInputQueue={[]} fileReferenceScope={scope}
        modelOptions={[{ id: "long", displayName: longModelName, supportsReasoning: true, supportsToolCalls: true }, { id: "short", displayName: "Short model", supportsReasoning: false, supportsToolCalls: true }]}
        isModelCatalogLoaded isModelCatalogLoading={false} modelCatalogError={null} onModelCatalogRefresh={() => record("models-refresh")}
        selectedModelProfileId={model} isSandboxCatalogLoaded sandboxCatalogError={sandboxError}
        sandboxOptions={[{ environmentId: "a", label: "Remote A", status: "ready" }, { environmentId: "b", label: "Remote B", status: "ready" }]}
        isRefreshingSandboxOptions={sandboxLoading} selectedSandboxEnvironmentId={sandbox}
        onSandboxOptionsRefresh={() => record("sandbox-refresh")}
        capabilityExposureSelection={selection}
        capabilityExposurePolicy={{ allowed_modes: ["smart", "clean", "full", "custom"], exposure_budget: { max_count: 12 } }}
        capabilityExposureDraftStatus="ready" capabilityCatalog={[]} capabilityCatalogStatus="ready"
        onCapabilityCatalogRefresh={() => record("capability-refresh")}
        agentIterationRequested={iteration} agentIterationMode="declarative_only" isAgentIterationLoading={false}
        onComposerChange={setComposer} onComposerKeyDown={noop}
        onModelProfileChange={value => { record("model", value); setModel(value) }}
        onSandboxEnvironmentChange={value => { record("sandbox", value); setSandbox(value) }}
        onCapabilityExposureChange={value => { record("capability", value); setSelection(value) }}
        onCapabilityExposureDraftRefresh={() => record("capability-retry")}
        onAgentIterationChange={value => { record("iteration", value); setIteration(value) }}
        onSend={() => record("send", { composer, model, sandbox, selection, iteration })}
        onStop={() => { record("stop"); setLive(false) }}
        onPromoteToGuided={noop} onDeleteFromQueue={noop} onResumePreInputQueue={noop} onClearPreInputQueue={noop}
        imageActions={<ImageAttachmentActions disabled={false} onFiles={files => record("files", files.length)} />}
      />
      <output className="sr-only" data-attachment-label>{t("images.add")}</output>
    </div>
  </TooltipProvider></SidebarProvider>
}

createRoot(document.getElementById("root")!).render(<Fixture />)
