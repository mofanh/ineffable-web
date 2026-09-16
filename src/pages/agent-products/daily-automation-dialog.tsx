import * as React from "react"
import { useTranslation } from "react-i18next"
import { AppDialog, AppDialogFooter, AsyncButton, ErrorState, FormField, Notice } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { RuntimeConfigurationFields } from "@/features/chat/components/runtime-configuration-fields"
import { getConversationPreferences, saveDailyAutomation, type Automation, type AutomationRuntimeConfig, type ConversationPreferences } from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"

export function DailyAutomationDialog({accessToken, automation, onClose, onSaved}: {accessToken:string; automation:Automation|null; onClose:()=>void; onSaved:()=>unknown}) {
  const {t}=useTranslation()
  const [runtime,setRuntime]=React.useState<AutomationRuntimeConfig>(automation?.runtime_config ?? {model_profile_id:"",workspace_id:null,sandbox:null,capability_exposure:{mode:"smart",custom:null}})
  const [config,setConfig]=React.useState(automation?.purpose_config ?? {directory:"我的经历",wait_enabled:true,wait_seconds:120,max_turns:32,token_budget:32000})
  const [enabled,setEnabled]=React.useState(automation?.status === "active")
  const [preferences,setPreferences]=React.useState<ConversationPreferences|null>(null)
  const [busy,setBusy]=React.useState(false)
  const [error,setError]=React.useState<string|null>(null)
  const mounted=React.useRef(false)
  React.useEffect(()=>{mounted.current=true;let active=true;void getConversationPreferences(accessToken).then((value)=>{
    if(!active)return
    setPreferences(value)
    if(!automation) setRuntime((current)=>({...current,...value.defaults_json}))
  }).catch((error)=>{if(active)setError(normalizeAppError(error).message)})
    return()=>{active=false;mounted.current=false}
  },[accessToken,automation])
  const time=preferences ? `${String(Math.floor(preferences.day_start_minutes/60)).padStart(2,"0")}:${String(preferences.day_start_minutes%60).padStart(2,"0")}` : "—"
  async function save(event:React.FormEvent) {
    event.preventDefault()
    if(!runtime.model_profile_id || !runtime.workspace_id || !config.directory.trim()){setError(t("automation.daily.invalid"));return}
    setBusy(true);setError(null)
    try {
      await saveDailyAutomation(accessToken,{runtime_config:runtime,config,enabled,expected_updated_at:automation?.updated_at ?? null})
      if(!mounted.current)return
      onSaved();onClose()
    }catch(error){if(mounted.current)setError(normalizeAppError(error).message)}finally{if(mounted.current)setBusy(false)}
  }
  return <AppDialog open title={t("automation.daily.title")} description={t("automation.daily.description")} onOpenChange={(open)=>{if(!open)onClose()}} footer={<AppDialogFooter><Button variant="outline" onClick={onClose}>{t("automation.form.cancel")}</Button><AsyncButton type="submit" form="daily-automation-form" isLoading={busy} disabled={!preferences}>{t("automation.form.save")}</AsyncButton></AppDialogFooter>}>
    <form id="daily-automation-form" className="space-y-5" onSubmit={save}>
      <ErrorState error={error} />
      <Notice title={t("automation.daily.schedule",{time,timezone:preferences?.timezone ?? "—"})}>{t("automation.daily.scheduleHint")}</Notice>
      <label className="flex items-center justify-between gap-3 text-sm">{t("automation.daily.enabled")}<Switch checked={enabled} onCheckedChange={setEnabled} /></label>
      <RuntimeConfigurationFields accessToken={accessToken} conversationId={automation?.conversation_id ?? ""} value={runtime} onChange={setRuntime} />
      <FormField label={t("automation.daily.directory")} htmlFor="daily-directory"><Input id="daily-directory" value={config.directory} required onChange={(event)=>setConfig({...config,directory:event.target.value})} /></FormField>
      <div className="grid grid-cols-2 gap-3"><FormField label={t("automation.daily.turns")} htmlFor="daily-turns"><Input id="daily-turns" type="number" min={4} max={64} value={config.max_turns ?? 32} required onChange={(event)=>setConfig({...config,max_turns:Number(event.target.value)})} /></FormField><FormField label={t("automation.daily.tokens")} htmlFor="daily-tokens"><Input id="daily-tokens" type="number" min={4000} max={128000} value={config.token_budget ?? 32000} required onChange={(event)=>setConfig({...config,token_budget:Number(event.target.value)})} /></FormField></div>
      <label className="flex items-center justify-between gap-3 text-sm">{t("automation.daily.wait")}<Switch checked={config.wait_enabled} onCheckedChange={(wait_enabled)=>setConfig({...config,wait_enabled})} /></label>
      {config.wait_enabled ? <FormField label={t("automation.daily.seconds")} htmlFor="daily-wait"><Input id="daily-wait" type="number" min={10} max={600} required value={config.wait_seconds} onChange={(event)=>setConfig({...config,wait_seconds:Number(event.target.value)})} /></FormField>:null}
    </form>
  </AppDialog>
}
