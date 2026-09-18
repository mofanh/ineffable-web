import * as React from "react"
import { useTranslation } from "react-i18next"
import { AsyncButton, FormField, ErrorState } from "@/components/app"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useApiResource } from "@/lib/app/use-api-resource"
import { notify } from "@/lib/app/notifications"
import { normalizeAppError } from "@/lib/app/api-errors"
import { getConversationPreferences, saveConversationPreferences, type ConversationPreferences } from "@/lib/api/api-client"
import { useConversationSession } from "@/features/auth/app-session"
import { RuntimeConfigurationFields as AutomationRuntimeFields } from "./runtime-configuration-fields"

export function ConversationPreferencesForm({ accessToken }: { accessToken: string }) {
  const { t } = useTranslation()
  const resource = useApiResource({ cacheKey: ["conversation-preferences", accessToken], load: React.useCallback(() => getConversationPreferences(accessToken), [accessToken]), errorMessage: t("chat.header.settingsFailed") })
  return <Card className="gap-0 py-0">
    <CardHeader className="border-b p-5"><CardTitle className="text-base">{t("chat.header.preferences")}</CardTitle><CardDescription>{t("chat.header.preferencesDescription")}</CardDescription></CardHeader>
    <CardContent className="p-5">
      {resource.error && <ErrorState error={resource.error.message} onRetry={resource.reload} />}
      {resource.data && <PreferencesEditor key={`${accessToken}:${resource.data.version}`} accessToken={accessToken} initial={resource.data} onSaved={resource.reload} />}
    </CardContent>
  </Card>
}

function PreferencesEditor({ accessToken, initial, onSaved }: { accessToken: string; initial: ConversationPreferences; onSaved: () => unknown }) {
  const { t } = useTranslation()
  const { currentConversationId } = useConversationSession()
  const [value, setValue] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const mounted = React.useRef(true)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const defaults = { model_profile_id: "", workspace_id: null, sandbox: null, capability_exposure: { mode: "smart" as const }, ...value.defaults_json }
  async function save() {
    setSaving(true)
    try {
      await saveConversationPreferences(accessToken, { ...value, defaults_json: { ...value.defaults_json, model_profile_id: value.defaults_json.model_profile_id || undefined } })
      if (!mounted.current) return
      notify.success({ title: t("chat.header.saved") })
      onSaved()
    } catch (error) {
      if (mounted.current) notify.error({ title: t("chat.header.settingsFailed"), description: normalizeAppError(error).message })
    } finally { if (mounted.current) setSaving(false) }
  }
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={t("chat.header.timezone")}><Input value={value.timezone} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={(e) => setValue({ ...value, timezone: e.target.value })} /></FormField>
    </div>
    <AutomationRuntimeFields accessToken={accessToken} conversationId={currentConversationId ?? ""} value={defaults} onChange={(defaults_json) => setValue({ ...value, defaults_json })} title={t("chat.header.defaults")} description={t("chat.header.defaultsDescription")} />
    <AsyncButton isLoading={saving} onClick={() => void save()}>{t("chat.header.savePreferences")}</AsyncButton>
  </div>
}
