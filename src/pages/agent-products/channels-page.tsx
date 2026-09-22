import * as React from "react"
import { ChannelDeliverySummary } from "@/features/channels/delivery-summary"
import { useTranslation } from "react-i18next"
import { Plus, RefreshCw } from "lucide-react"
import { AppPage, AppDialog, AppDialogFooter, FormField, ToggleField, Notice, ErrorState, EmptyState, StatusBadge } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAuthSession, useConversationSession } from "@/features/auth/app-session"
import { RuntimeConfigurationFields } from "@/features/chat/components/runtime-configuration-fields"
import { listConnections, createConnection, updateConnection, rotateConnection, deleteConnection, connectionDetails, webhookUrl, type ChannelConnection, type ConnectionDraft, type IssuedConnection, type ConnectionDetails } from "@/features/channels/api"
import { getConversationPreferences, type AutomationRuntimeConfig } from "@/lib/api/api-client"
import { useApiResource } from "@/lib/app/use-api-resource"
import type { AppError } from "@/lib/app/api-errors"
import { normalizeChannelError, channelSaveOutcomeUncertain } from "@/features/channels/errors"
import { confirm } from "@/lib/app/confirm"

export function ChannelsPage() {
  const { accessToken, currentSessionId } = useAuthSession()
  return accessToken && currentSessionId ? <Connections key={currentSessionId} token={accessToken} session={currentSessionId} /> : null
}
function Connections({ token, session }: { token: string; session: string }) {
  const { t } = useTranslation()
  const { selectConversation, refreshConversations, getConversationSelectionIdentity } = useConversationSession()
  const mounted = React.useRef(true)
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const resource = useApiResource({
    cacheKey: ["owned-channels", session],
    load: React.useCallback(() => listConnections(token, session), [token, session]),
    errorMessage: t("channels.error"),
  })
  const [draft, setDraft] = React.useState<ConnectionDraft | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [issued, setIssued] = React.useState<IssuedConnection | null>(null)
  const [detail, setDetail] = React.useState<{ connection: ChannelConnection; value: ConnectionDetails } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [uncertain, setUncertain] = React.useState(false)
  const [error, setError] = React.useState<AppError | null>(null)
  const generation = React.useRef(0)
  async function startCreate() {
    const request = ++generation.current
    setBusy(true); setError(null); setUncertain(false)
    try {
      const { defaults_json: defaults } = await getConversationPreferences(token)
      if (!mounted.current || request !== generation.current) return
      const runtime: AutomationRuntimeConfig = {
        model_profile_id: defaults.model_profile_id ?? "",
        workspace_id: defaults.workspace_id ?? null,
        sandbox: defaults.sandbox ?? null,
        capability_exposure: defaults.capability_exposure ?? { mode: "smart" },
      }
      setEditing(null)
      setDraft({ client_secret: "", display_name: "", account_id: "", allowed_private_ids: [], allowed_group_ids: [], enabled: false, runtime_config: runtime })
    } catch (e) {
      if (mounted.current && request === generation.current) setError(normalizeChannelError(e))
    } finally { if (mounted.current && request === generation.current) setBusy(false) }
  }
  function edit(connection: ChannelConnection) {
    generation.current += 1; setError(null); setUncertain(false); setEditing(connection.id)
    setDraft({ display_name: connection.display_name, account_id: connection.account_id, enabled: connection.enabled, allowed_private_ids: connection.allowed_private_ids, allowed_group_ids: connection.allowed_group_ids, runtime_config: connection.runtime_config_json })
  }
  async function save() {
    if (!draft || busy || uncertain) return
    const request = generation.current
    setBusy(true); setError(null)
    try {
      const payload = { ...draft, client_secret: draft.client_secret || undefined, allowed_private_ids: draft.allowed_private_ids.filter(Boolean), allowed_group_ids: draft.allowed_group_ids.filter(Boolean) }
      if (editing) await updateConnection(token, session, editing, payload)
      else {
        const result = await createConnection(token, session, payload)
        if (mounted.current && request === generation.current) setIssued(result)
      }
      if (!mounted.current || request !== generation.current) return
      setDraft(null); void resource.reload()
    } catch (e) {
      if (!mounted.current || request !== generation.current) return
      // An unacknowledged create or update must be inspected before resubmission.
      const failure = normalizeChannelError(e)
      setUncertain(channelSaveOutcomeUncertain(failure.status)); setError(failure)
    } finally { if (mounted.current && request === generation.current) setBusy(false) }
  }
  async function action(connection: ChannelConnection, kind: "rotate" | "delete" | "details") {
    if (busy) return
    const request = ++generation.current
    setBusy(true); setError(null)
    try {
      if (kind !== "details") {
        const accepted = await confirm({ title: t(`channels.${kind}`), description: t(`channels.${kind}Hint`), confirmLabel: t(`channels.${kind}`), variant: "destructive" })
        if (!accepted || !mounted.current || request !== generation.current) return
      }
      if (kind === "rotate") {
        const result = await rotateConnection(token, session, connection.id)
        if (mounted.current && request === generation.current) setIssued(result)
      } else if (kind === "delete") await deleteConnection(token, session, connection.id)
      else {
        const value = await connectionDetails(token, session, connection.id)
        if (mounted.current && request === generation.current) setDetail({ connection, value })
      }
      if (mounted.current && kind !== "details") void resource.reload()
    } catch (e) {
      if (mounted.current && request === generation.current) setError(normalizeChannelError(e))
    } finally { if (mounted.current && request === generation.current) setBusy(false) }
  }
  async function openConversation(id: string) {
    const request = ++generation.current
    const selection = getConversationSelectionIdentity()
    const ownsSelection = () => {
      const current = getConversationSelectionIdentity()
      return mounted.current && request === generation.current && current.sessionId === selection.sessionId && current.version === selection.version
    }
    try { await refreshConversations() } catch (e) {
      if (ownsSelection()) setError(normalizeChannelError(e))
      return
    }
    if (!ownsSelection()) return
    selectConversation(id)
    window.dispatchEvent(new Event("ineffable:right-sidebar:open"))
    setDetail(null)
  }
  return <AppPage title={t("channels.title")} description={t("channels.description")} actions={<div className="flex gap-2">
    <Button variant="outline" disabled={busy} onClick={() => void resource.reload()} aria-label={t("channels.refresh")}><RefreshCw className="size-4" /></Button>
    <Button disabled={busy} onClick={() => void startCreate()}><Plus className="size-4" />{t("channels.create")}</Button>
  </div>}>
    {resource.error ? <ErrorState error={resource.error.message} onRetry={resource.reload} /> : null}
    {error && !draft ? <ErrorState error={error} /> : null}
    {!resource.data ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : resource.data.filter(c => c.protocol === "qqbot").length === 0 ? <EmptyState title={t("channels.empty")} description={t("channels.description")} /> : <div className="space-y-3">{resource.data.filter(c => c.protocol === "qqbot").map(connection => <div key={connection.id} className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="font-medium break-words">{connection.display_name}</p><p className="text-sm text-muted-foreground">AppID · {connection.account_id}</p></div>
        <StatusBadge status={connection.enabled ? "active" : "disabled"} label={t(connection.enabled ? "channels.enabled" : "channels.disabled")} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{t(connection.webhook_verified_at ? "channels.verified" : "channels.unverified")}</span><span>{t("channels.lastReceived", { time: connection.last_received_at ? new Date(connection.last_received_at).toLocaleString() : t("channels.neverReceived") })}</span></div>
      <p className="text-xs text-muted-foreground">{t("channels.scope", { private: connection.allowed_private_ids.length, groups: connection.allowed_group_ids.length })}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => edit(connection)}>{t("channels.edit")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(connection, "details")}>{t("channels.details")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(connection, "delete")}>{t("channels.delete")}</Button></div>
    </div>)}</div>}
    <AppDialog open={draft !== null} title={t(editing ? "channels.edit" : "channels.create")} description={t("channels.configHint")} onOpenChange={open => { if (!open && !busy) { generation.current += 1; setDraft(null); setError(null) } }} footer={<AppDialogFooter><Button disabled={busy || uncertain || !draft?.runtime_config.model_profile_id || !draft?.account_id || !draft?.display_name || (!editing && !draft?.client_secret)} onClick={() => void save()}>{t("channels.save")}</Button></AppDialogFooter>}>
      {draft ? <div className="space-y-5"><fieldset disabled={busy || uncertain} className="space-y-4">
        <FormField label={t("channels.name")}><Input value={draft.display_name} maxLength={80} onChange={e => setDraft({ ...draft, display_name: e.target.value })} /></FormField>
        <FormField label={t("channels.account")}><Input inputMode="numeric" value={draft.account_id} disabled={!!editing} onChange={e => setDraft({ ...draft, account_id: e.target.value })} /></FormField>
        <FormField label={t("channels.secret")}><Input type="password" autoComplete="new-password" value={draft.client_secret ?? ""} placeholder={editing ? t("channels.secretKeep") : ""} onChange={e => setDraft({ ...draft, client_secret: e.target.value })} /></FormField>
        <Notice>{t("channels.contactsHint")}</Notice>
        <FormField label={t("channels.private")}><Textarea value={draft.allowed_private_ids.join("\n")} onChange={e => setDraft({ ...draft, allowed_private_ids: e.target.value.split(/[,，\s]+/) })} /></FormField>
        <FormField label={t("channels.groups")}><Textarea value={draft.allowed_group_ids.join("\n")} onChange={e => setDraft({ ...draft, allowed_group_ids: e.target.value.split(/[,，\s]+/) })} /></FormField>
        <RuntimeConfigurationFields accessToken={token} conversationId="" value={draft.runtime_config} onChange={runtime_config => setDraft({ ...draft, runtime_config })} title={t("channels.runtime")} description={t("channels.configHint")} />
        {editing ? <ToggleField label={t("channels.enable")} checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /> : <Notice>{t("channels.disabledHint")}</Notice>}
      </fieldset>{error ? <ErrorState error={error} /> : null}{uncertain ? <Notice tone="warning">{t("channels.uncertain")}</Notice> : null}</div> : null}
    </AppDialog>
    <AppDialog open={issued !== null} title={t("channels.credentials")} description={t("channels.tokenHint")} onOpenChange={open => { if (!open) setIssued(null) }}>
      {issued ? <div className="space-y-4"><FormField label={t("channels.endpoint")}><Textarea readOnly value={webhookUrl(issued.connection.id)} /></FormField><Notice>{t("channels.protocolHint")}</Notice></div> : null}
    </AppDialog>
    <AppDialog open={detail !== null} title={detail?.connection.display_name ?? t("channels.details")} description={t("channels.deliveryHint")} onOpenChange={open => { if (!open) { generation.current += 1; setDetail(null) } }}>
      {detail ? <div className="space-y-4"><Notice>{t("channels.contactsHint")}</Notice>{detail.value.contacts?.map(contact => <div key={`${contact.chat_type}:${contact.external_chat_id}`} className="rounded-lg border p-3 space-y-2"><p className="text-xs break-all">{t(contact.chat_type === "group" ? "channels.groupChat" : "channels.privateChat")} · {contact.external_chat_id}</p><Button size="sm" variant="outline" disabled={busy} onClick={() => { const c=detail.connection; edit(c); setDraft(d => d ? { ...d, [contact.chat_type === "group" ? "allowed_group_ids" : "allowed_private_ids"]: [...new Set([...(contact.chat_type === "group" ? c.allowed_group_ids : c.allowed_private_ids),contact.external_chat_id])] } : d); setDetail(null) }}>{t("channels.allowContact")}</Button></div>)}<FormField label={t("channels.endpoint")}><Textarea readOnly value={webhookUrl(detail.connection.id)} /></FormField><ChannelDeliverySummary deliveries={detail.value.deliveries} />{detail.value.chats.length === 0 ? <EmptyState title={t("channels.noChats")} /> : detail.value.chats.map(chat => <Button key={chat.conversation_id} variant="outline" className="w-full justify-start" onClick={() => void openConversation(chat.conversation_id).catch(e => { if (mounted.current) setError(normalizeChannelError(e)) })}>{t(chat.chat_type === "group" ? "channels.groupChat" : "channels.privateChat")} · {chat.external_chat_id}</Button>)}</div> : null}
    </AppDialog>
  </AppPage>
}
