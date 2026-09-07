import * as React from "react"
import { useTranslation } from "react-i18next"
import { Bot, Box, Folder } from "lucide-react"
import { FormField, FormSection, ErrorState } from "@/components/app"
import { ComposerSingleSelect } from "@/features/chat/components/composer-single-select"
import { CapabilityExposurePicker } from "@/features/chat/components/capability-exposure-picker"
import { useApiResource } from "@/lib/app/use-api-resource"
import { getCapabilityExposureDraft, listConversationCapabilityCatalog, listModelProfiles, listSandboxWorkspaceEnvironments, listWorkspaces, type AutomationRuntimeConfig } from "@/lib/api/api-client"

export function AutomationRuntimeFields({ accessToken, conversationId, value, onChange }: {
  accessToken: string
  conversationId: string
  value: AutomationRuntimeConfig
  onChange: (value: AutomationRuntimeConfig) => void
}) {
  const { t } = useTranslation()
  const choices = useApiResource({
    cacheKey: ["automation-runtime-choices", accessToken],
    load: React.useCallback(async () => {
      const [models, workspaces, policy] = await Promise.all([
        listModelProfiles(accessToken), listWorkspaces(accessToken), getCapabilityExposureDraft(accessToken),
      ])
      return { models: models.profiles, workspaces: workspaces.workspaces, policy: policy.capability_exposure_policy.policy }
    }, [accessToken]),
    errorMessage: t("automation.runtime.loadFailed"),
  })
  const environments = useApiResource({
    cacheKey: ["automation-environments", accessToken, value.workspace_id],
    load: React.useCallback(() => listSandboxWorkspaceEnvironments(accessToken, value.workspace_id), [accessToken, value.workspace_id]),
    errorMessage: t("automation.runtime.loadFailed"),
  })
  const catalog = useApiResource({
    enabled: value.capability_exposure.mode === "custom",
    cacheKey: ["automation-capabilities", accessToken, conversationId, value.workspace_id, value.sandbox?.environment_id],
    load: React.useCallback(() => listConversationCapabilityCatalog(accessToken, conversationId, value.sandbox?.environment_id, value.workspace_id), [accessToken, conversationId, value.sandbox?.environment_id, value.workspace_id]),
    errorMessage: t("automation.runtime.loadFailed"),
  })
  const selectedModel = value.model_profile_id
  const modelOptions = choices.data?.models.map((m) => ({ value: m.id, label: m.display_name })) ?? []
  if (selectedModel && !modelOptions.some((m) => m.value === selectedModel)) {
    modelOptions.push({ value: selectedModel, label: t("automation.runtime.unavailable", { name: selectedModel }) })
  }
  const workspaceOptions = [{ value: "__none__", label: t("automation.runtime.none") }, ...(choices.data?.workspaces.map((w) => ({ value: w.id, label: w.name })) ?? [])]
  if (value.workspace_id && !workspaceOptions.some((w) => w.value === value.workspace_id)) {
    workspaceOptions.push({ value: value.workspace_id, label: t("automation.runtime.unavailable", { name: value.workspace_id }) })
  }
  const sandboxOptions = [{ value: "__none__", label: t("automation.runtime.none") }, ...(environments.data?.environments.map((env) => ({
    value: env.environment_id,
    label: environments.data?.providers.find((p) => p.provider_id === env.provider_id)?.display_name || env.environment_id,
  })) ?? [])]
  if (value.sandbox && !sandboxOptions.some((env) => env.value === value.sandbox?.environment_id)) {
    sandboxOptions.push({ value: value.sandbox.environment_id, label: t("automation.runtime.unavailable", { name: value.sandbox.environment_id }) })
  }
  return <FormSection title={t("automation.runtime.title")} description={t("automation.runtime.description")}>
    {choices.error ? <ErrorState error={choices.error.message} onRetry={choices.reload} /> : null}
    {environments.error ? <ErrorState error={environments.error.message} onRetry={environments.reload} /> : null}
    <FormField label={t("chat.composer.modelPickerLabel")}>
      <ComposerSingleSelect value={selectedModel} options={modelOptions} icon={<Bot className="size-4" />} label={t("chat.composer.modelPickerLabel")} placeholder={t("chat.composer.noModelSelected")} emptyLabel={t("chat.composer.noMatchingModels")} searchPlaceholder={t("chat.composer.modelSearch")} onValueChange={(model_profile_id) => onChange({ ...value, model_profile_id })} />
    </FormField>
    <FormField label={t("automation.runtime.workspace")}>
      <ComposerSingleSelect value={value.workspace_id ?? "__none__"} options={workspaceOptions} icon={<Folder className="size-4" />} label={t("automation.runtime.workspace")} placeholder={t("automation.runtime.none")} emptyLabel={t("automation.runtime.none")} onValueChange={(workspace) => onChange({ ...value, workspace_id: workspace === "__none__" ? null : workspace, sandbox: null })} />
    </FormField>
    <FormField label={t("chat.composer.sandboxPickerLabel")}>
      <ComposerSingleSelect value={value.sandbox?.environment_id ?? "__none__"} options={sandboxOptions} icon={<Box className="size-4" />} label={t("chat.composer.sandboxPickerLabel")} placeholder={t("automation.runtime.none")} emptyLabel={t("chat.composer.noMatchingSandboxes")} searchPlaceholder={t("chat.composer.sandboxSearch")} onValueChange={(environment_id) => onChange({ ...value, sandbox: environment_id === "__none__" ? null : { environment_id } })} />
    </FormField>
    <FormField label={t("chat.composer.capabilityModeLabel")}>
      <CapabilityExposurePicker capabilityExposureSelection={value.capability_exposure} capabilityExposurePolicy={choices.data?.policy ?? null} capabilityExposureDraftStatus={choices.state === "error" ? "error" : choices.data ? "ready" : "loading"} capabilityCatalog={catalog.data?.items ?? []} capabilityCatalogStatus={catalog.state === "error" ? "error" : catalog.data ? "ready" : "loading"} onCapabilityCatalogRefresh={catalog.reload} onCapabilityExposureDraftRefresh={choices.reload} onCapabilityExposureChange={(capability_exposure) => onChange({ ...value, capability_exposure })} />
    </FormField>
  </FormSection>
}
