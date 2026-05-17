import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  SandboxEnvironmentSelection,
  SandboxProjectEnvironmentSummary,
} from "@/lib/api/gateway-client"
import { cn } from "@/lib/utils"
import { MonitorCogIcon, RefreshCwIcon } from "lucide-react"

type SandboxRuntimeStripProps = {
  projectId: string
  summary: SandboxProjectEnvironmentSummary | null
  selection: SandboxEnvironmentSelection | null
  isLoading?: boolean
  onRefresh: () => void
}

export function SandboxRuntimeStrip({
  projectId,
  summary,
  selection,
  isLoading,
  onRefresh,
}: SandboxRuntimeStripProps) {
  const selectedEnvironment = selection?.environment ?? summary?.recommended.environment ?? null
  const selectedProvider = selection?.provider ?? summary?.recommended.provider ?? null
  const selected = Boolean(selection?.selected || summary?.recommended.selected)
  const runtimeKind = selectedProvider?.runtime_kind ?? "none"
  const providerStatus = selectedProvider?.status ?? "unavailable"
  const environmentStatus = selectedEnvironment?.status ?? "unavailable"
  const reason = selection?.reason ?? summary?.recommended.reason ?? "No sandbox environment selected"

  return (
    <div className="rounded-lg border bg-background px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <MonitorCogIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate text-sm font-medium">
              {selectedProvider?.display_name ?? "Sandbox runtime"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selected ? "secondary" : "outline"}>
              {runtimeKind}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                providerStatus === "online" && "border-emerald-500/40 text-emerald-700",
                providerStatus === "offline" && "border-amber-500/40 text-amber-700",
                providerStatus === "revoked" && "border-destructive/40 text-destructive"
              )}
            >
              provider {providerStatus}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                environmentStatus === "ready" && "border-emerald-500/40 text-emerald-700",
                environmentStatus === "offline" && "border-amber-500/40 text-amber-700",
                environmentStatus === "revoked" && "border-destructive/40 text-destructive"
              )}
            >
              environment {environmentStatus}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-muted-foreground min-w-0 text-xs">
            <span className="font-medium text-foreground">Project</span>{" "}
            <span className="break-all">{projectId || "unset"}</span>
            <span className="mx-2">·</span>
            <span className="break-words">{reason}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCwIcon className={cn(isLoading && "animate-spin")} />
            刷新
          </Button>
        </div>
      </div>
    </div>
  )
}
