import * as React from "react"
import { useTranslation } from "react-i18next"
import { BoxIcon, SlidersHorizontalIcon } from "lucide-react"

import { FormField, ToggleField } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CapabilityExposurePicker } from "./capability-exposure-picker"
import { ComposerSingleSelect, type ComposerSingleSelectOption } from "./composer-single-select"

type ComposerRunSettingsProps = React.ComponentProps<typeof CapabilityExposurePicker> & {
  sandboxOptions: ComposerSingleSelectOption[]
  selectedSandboxEnvironmentId: string
  isRefreshingSandboxOptions: boolean
  sandboxCatalogError: string | null
  onSandboxOptionsRefresh: () => void
  onSandboxEnvironmentChange: (value: string) => void
  agentIterationRequested: boolean
  agentIterationMode: "disabled" | "declarative_only" | "artifact_allowed" | "runtime_lab_allowed"
  isAgentIterationLoading: boolean
  agentIterationUnavailableReason?: string | null
  onAgentIterationChange: (requested: boolean) => void
}

export function ComposerRunSettings({
  sandboxOptions,
  selectedSandboxEnvironmentId,
  isRefreshingSandboxOptions,
  sandboxCatalogError,
  onSandboxOptionsRefresh,
  onSandboxEnvironmentChange,
  agentIterationRequested,
  agentIterationMode,
  isAgentIterationLoading,
  agentIterationUnavailableReason,
  onAgentIterationChange,
  ...capabilityProps
}: ComposerRunSettingsProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 rounded-full px-2 text-xs text-foreground" aria-label={t("chat.composer.runSettings")}>
          <SlidersHorizontalIcon className="size-3.5" />
          {t("chat.composer.runSettings")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-label={t("chat.composer.runSettings")}
        className="max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1.5rem)] space-y-4 overflow-y-auto rounded-xl p-4"
      >
        <FormField label={t("chat.composer.sandbox")}>
          <ComposerSingleSelect
            value={selectedSandboxEnvironmentId || "__disabled__"}
            options={sandboxOptions}
            icon={<BoxIcon className="size-4 shrink-0" />}
            label={t("chat.composer.sandboxPickerLabel")}
            placeholder={t("chat.composer.sandbox")}
            emptyLabel={t("chat.composer.noMatchingSandboxes")}
            searchPlaceholder={t("chat.composer.sandboxSearch")}
            loading={isRefreshingSandboxOptions}
            loadingLabel={t("chat.composer.sandboxSyncing")}
            error={sandboxCatalogError}
            onRetry={onSandboxOptionsRefresh}
            retryLabel={t("common.retry")}
            className="h-auto min-h-10 rounded-lg border border-input px-3 text-sm"
            wrapLabel
            onOpenChange={nextOpen => { if (nextOpen) onSandboxOptionsRefresh() }}
            onValueChange={value => onSandboxEnvironmentChange(value === "__disabled__" ? "" : value)}
          />
        </FormField>
        <FormField label={t("chat.composer.capabilityModeLabel")}>
          <CapabilityExposurePicker {...capabilityProps} className="h-auto min-h-10 w-full max-w-none justify-start rounded-lg border border-input px-3 text-sm text-foreground" />
        </FormField>
        <div className="space-y-1.5">
          <ToggleField
            label={`${t("chat.composer.nodeIteration")} · ${t(`chat.composer.iterationMode.${agentIterationMode}`)}`}
            checked={agentIterationRequested}
            disabled={isAgentIterationLoading}
            onCheckedChange={onAgentIterationChange}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {agentIterationUnavailableReason ?? t("chat.composer.nodeIterationHint")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
