import * as React from "react"
import { useTranslation } from "react-i18next"
import { SlidersHorizontalIcon } from "lucide-react"

import { FormField, ToggleField } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CapabilityExposurePicker } from "./capability-exposure-picker"

type ComposerRunSettingsProps = React.ComponentProps<typeof CapabilityExposurePicker> & {
  agentIterationRequested: boolean
  agentIterationMode: "disabled" | "declarative_only" | "artifact_allowed" | "runtime_lab_allowed"
  isAgentIterationLoading: boolean
  agentIterationUnavailableReason?: string | null
  onAgentIterationChange: (requested: boolean) => void
}

export function ComposerRunSettings({
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
        <Button type="button" variant="ghost" size="sm" className="size-8 shrink-0 gap-1.5 rounded-full px-0 text-xs text-foreground @[480px]/chat-composer:w-auto @[480px]/chat-composer:px-2" aria-label={t("chat.composer.runSettings")} title={t("chat.composer.runSettings")}>
          <SlidersHorizontalIcon className="size-3.5" />
          <span className="hidden @[480px]/chat-composer:inline">{t("chat.composer.runSettings")}</span>
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
