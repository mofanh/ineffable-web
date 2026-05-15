import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type SandboxEnvironmentSelection,
  type SandboxPreferenceMode,
  type SandboxProjectEnvironmentSummary,
} from "@/lib/api/gateway-client"
import { cn } from "@/lib/utils"
import { MonitorCogIcon, RefreshCwIcon, SaveIcon } from "lucide-react"

type SandboxStatusCardProps = {
  preferenceMode: SandboxPreferenceMode
  environmentId: string
  projectId: string
  summary: SandboxProjectEnvironmentSummary | null
  selection: SandboxEnvironmentSelection | null
  isLoading?: boolean
  isSaving?: boolean
  error?: string | null
  onPreferenceModeChange: (mode: SandboxPreferenceMode) => void
  onEnvironmentIdChange: (value: string) => void
  onProjectIdChange: (value: string) => void
  onRefresh: () => void
  onSavePreference: () => void
}

function environmentLabel(
  environmentId: string,
  summary: SandboxProjectEnvironmentSummary | null
) {
  const environment = summary?.environments.find(
    (item) => item.environment_id === environmentId
  )
  const provider = summary?.providers.find(
    (item) => item.provider_id === environment?.provider_id
  )

  if (!environment) {
    return environmentId
  }

  return [
    provider?.display_name ?? environment.environment_type,
    environment.environment_type,
    environment.status,
  ].join(" / ")
}

export function SandboxStatusCard({
  preferenceMode,
  environmentId,
  projectId,
  summary,
  selection,
  isLoading,
  isSaving,
  error,
  onPreferenceModeChange,
  onEnvironmentIdChange,
  onProjectIdChange,
  onRefresh,
  onSavePreference,
}: SandboxStatusCardProps) {
  const selectedEnvironment = selection?.environment ?? summary?.recommended.environment ?? null
  const selectedProvider = selection?.provider ?? summary?.recommended.provider ?? null
  const isReady = Boolean(selection?.selected || summary?.recommended.selected)
  const environments = summary?.environments ?? []

  return (
    <Card className="bg-muted/40">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorCogIcon className="size-4" />
              Sandbox Console
            </CardTitle>
            <CardDescription>
              管理当前项目的执行环境、授权、审批和执行会话。
            </CardDescription>
          </div>
          <Badge
            variant={isReady ? "secondary" : "outline"}
            className={cn("h-6", isReady && "bg-emerald-500/10 text-emerald-700")}
          >
            {isReady ? "Environment selected" : "Environment unavailable"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto_auto]">
          <div className="space-y-2">
            <Label htmlFor="sandbox-project-id">Project ID</Label>
            <Input
              id="sandbox-project-id"
              value={projectId}
              onChange={(event) => onProjectIdChange(event.target.value)}
              placeholder="project_id"
            />
          </div>

          <div className="space-y-2">
            <Label>Preference</Label>
            <Select
              value={preferenceMode}
              onValueChange={(value) =>
                onPreferenceModeChange(value as SandboxPreferenceMode)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="local_daemon">Local daemon</SelectItem>
                <SelectItem value="cloud_runtime">Cloud runtime</SelectItem>
                <SelectItem value="specified_environment">Pinned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Environment</Label>
            <Select
              value={environmentId || "__none__"}
              onValueChange={(value) =>
                onEnvironmentIdChange(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Auto recommendation</SelectItem>
                {environments.map((environment) => (
                  <SelectItem
                    key={environment.environment_id}
                    value={environment.environment_id}
                  >
                    {environmentLabel(environment.environment_id, summary)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full lg:w-auto"
              onClick={onRefresh}
              disabled={isLoading || !projectId.trim()}
            >
              <RefreshCwIcon className={cn(isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              className="w-full lg:w-auto"
              onClick={onSavePreference}
              disabled={isSaving || !projectId.trim()}
            >
              <SaveIcon className={cn(isSaving && "animate-pulse")} />
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border bg-background/70 p-3">
            <div className="text-muted-foreground">Selected runtime</div>
            <div className="mt-1 font-medium">
              {selectedProvider?.runtime_kind ?? "None"}
            </div>
          </div>
          <div className="rounded-md border bg-background/70 p-3">
            <div className="text-muted-foreground">Provider</div>
            <div className="mt-1 truncate font-medium">
              {selectedProvider
                ? `${selectedProvider.display_name} / ${selectedProvider.status}`
                : "None"}
            </div>
          </div>
          <div className="rounded-md border bg-background/70 p-3">
            <div className="text-muted-foreground">Environment</div>
            <div className="mt-1 truncate font-medium">
              {selectedEnvironment
                ? `${selectedEnvironment.environment_type} / ${selectedEnvironment.status}`
                : "None"}
            </div>
          </div>
        </div>

        {(selection?.reason || summary?.recommended.reason || error) && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              error
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "bg-background/70 text-muted-foreground"
            )}
          >
            {error ?? selection?.reason ?? summary?.recommended.reason}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
