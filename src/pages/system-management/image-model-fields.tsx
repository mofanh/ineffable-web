import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { AppDisclosureSection, AppFieldGrid, FormField, ToggleField } from "@/components/app";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { AdminModelProfilePayload } from "@/lib/api/api-client";

type Props = { model: AdminModelProfilePayload; onChange: Dispatch<SetStateAction<AdminModelProfilePayload | null>> };
export function ImageModelFields({ model, onChange }: Props) {
  const { t } = useTranslation();
  const generation = model.endpoint_kind === "openai_images";
  if (!generation && !model.supports_vision) return null;
  const sectionKey = generation ? "image_generation" : "image_analysis";
  const raw = model.metadata_json?.[sectionKey];
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const set = (key: string, value: unknown) => onChange(current => {
    if (!current) return current;
    const previous = current.metadata_json?.[sectionKey];
    const image = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
    return { ...current, metadata_json: { ...current.metadata_json, [sectionKey]: { ...image, [key]: value } } };
  });
  return <AppDisclosureSection title={t(generation ? "images.modelSettings" : "images.analysisSettings")} description={t(generation ? "images.modelSettingsHint" : "images.analysisSettingsHint")}>
    <AppFieldGrid>
      <ToggleField label={t(generation ? "images.generationEnabled" : "images.analysisEnabled")} checked={config.enabled === true} onCheckedChange={value => set("enabled", value)} />
      {generation ? <ToggleField label={t("images.referenceEditing")} checked={config.editing === true} onCheckedChange={value => set("editing", value)} /> : null}
      <FormField label={t("images.runBudget")}><Input type="number" min={1} max={3} step={1} value={Number(config.max_calls_per_run ?? 3)} onChange={event => set("max_calls_per_run", Number(event.target.value))} /></FormField>
      <FormField label={t("images.reserveCredits")}><Input type="number" min={0.001} step="any" value={Number(config.reservation_credits ?? 0)} onChange={event => set("reservation_credits", Number(event.target.value))} /></FormField>
      {generation ? <FormField label={t("images.quality")}><Select value={String(config.quality ?? "medium")} onValueChange={value => set("quality", value)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="low">{t("images.low")}</SelectItem><SelectItem value="medium">{t("images.medium")}</SelectItem><SelectItem value="high">{t("images.high")}</SelectItem>
        </SelectContent>
      </Select></FormField> : null}
    </AppFieldGrid>
  </AppDisclosureSection>;
}
