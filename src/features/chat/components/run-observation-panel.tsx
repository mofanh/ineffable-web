import { RunObservationDetail } from "./run-observation-detail"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeftIcon, ChevronRightIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataState } from "@/components/app/data-state"
import { Notice } from "@/components/app/notice"
import { getRunObservations, type RunObservation } from "@/features/chat/api/chat-api"
import { normalizeAppError, type AppError } from "@/lib/app/api-errors"
import { useApiResource } from "@/lib/app/use-api-resource"

type Props = { accessToken: string; conversationId: string; runId: string; onClose: () => void }

function RecordDetails({ record, accessToken, conversationId, runId, onAccessDenied }: { record: RunObservation; accessToken: string; conversationId: string; runId: string; onAccessDenied: (error: AppError) => void }) {
  const [showContent,setShowContent] = React.useState(false)
  const { t } = useTranslation()
  const data = record.data
  const result = data.record
  const diff = data.diff
  return <details className="group rounded-xl border p-3 sm:p-4" data-observation-seq={record.seq}>
    <summary className="flex cursor-pointer list-none items-start gap-3">
      <ChevronRightIcon className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t(`trajectory.${record.stage}`)}</span>
          {record.attempt > 0 && <Badge variant="secondary">{t("trajectory.attempt")} {record.attempt}</Badge>}
          {result && <Badge variant="outline">{t(`trajectory.statuses.${result.status}`, { defaultValue: result.status })}</Badge>}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={record.request_id}>{record.request_id}</div>
      </div>
    </summary>
    <div className="mt-4 space-y-4 text-sm">
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">{t("trajectory.request")}</dt><dd className="break-all">{record.request_id}</dd>
        <dt className="text-muted-foreground">{t("trajectory.epoch")}</dt><dd>{record.execution_epoch}</dd>
        {data.turn != null && <><dt className="text-muted-foreground">{t("trajectory.turn")}</dt><dd>{data.turn}</dd></>}
        {result && <>
          <dt className="text-muted-foreground">{t("trajectory.model")}</dt><dd className="break-all">{result.model ?? t("trajectory.unknown")}</dd>
          <dt className="text-muted-foreground">{t("trajectory.duration")}</dt><dd>{result.latency_ms} ms</dd>
          <dt className="text-muted-foreground">{t("trajectory.measurement")}</dt><dd className="break-all">{t(`trajectory.sources.${result.usage_source}`, { defaultValue: result.usage_source })}</dd>
          <dt className="text-muted-foreground">{t("trajectory.inputTokens")}</dt><dd>{result.usage_source === "unavailable" ? t("trajectory.unknown") : result.usage.prompt_tokens.toLocaleString()}</dd>
          <dt className="text-muted-foreground">{t("trajectory.outputTokens")}</dt><dd>{result.usage_source === "unavailable" ? t("trajectory.unknown") : result.usage.completion_tokens.toLocaleString()}</dd>
          {result.error_code && <><dt className="text-muted-foreground">{t("trajectory.status")}</dt><dd className="break-all">{result.error_code}</dd></>}
        </>}
      </dl>
      {record.stage === "dispatch" && <>
        <p className="text-muted-foreground">{t("trajectory.dispatchHint")}</p>
        <div className="space-y-2"><h3 className="font-medium">{t("trajectory.wire")}</h3>
          <p>{data.wire_bytes?.toLocaleString()} {t("trajectory.bytes")}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{data.wire_hash}</p>
        </div>
        <div className="space-y-2"><h3 className="font-medium">{t("trajectory.tools")} · {data.total_tools}</h3>
          <p className="text-xs text-muted-foreground">{t("trajectory.wireToolHint")}</p>
          <div className="flex flex-wrap gap-1">{data.tools?.map((name, i) => <Badge className="max-w-full break-all whitespace-normal" variant="outline" title={data.tool_schema_hashes?.[i]} key={i}>{name}</Badge>)}</div>
          {(data.total_tools ?? 0) > (data.tools?.length ?? 0) && <p>{t("trajectory.truncated")}</p>}
        </div>
      </>}
      {diff && <div className="space-y-2">
        <h3 className="font-medium">{t("trajectory.diff")}</h3>
        {diff.available ? <><div className="flex flex-wrap gap-2">{(["added", "removed", "changed", "unchanged"] as const).map(kind => <Badge key={kind} variant="outline">{t(`trajectory.${kind}`)} {diff[kind]}</Badge>)}</div><p className="text-xs text-muted-foreground">{t("trajectory.diffHint")}</p></> : <p className="text-xs text-muted-foreground">{t("trajectory.diffUnavailable")}</p>}
      </div>}
      {data.items && <div className="space-y-2">
        <h3 className="font-medium">{t("trajectory.context")} · {data.total_items} {t("trajectory.items")}</h3>
        <p className="text-xs text-muted-foreground">{t("trajectory.lazyBodyHint")}</p>
        {data.truncated && <p className="text-xs text-muted-foreground">{t("trajectory.truncated")}</p>}
        {data.items.map((item, index) => <details key={index} className="rounded-lg bg-muted/40 p-3">
          <summary className="cursor-pointer break-all">{index + 1}. {t(`trajectory.kinds.${item.kind}`, { defaultValue: item.kind })} · {item.bytes.toLocaleString()} {t("trajectory.bytes")}</summary>
          <div className="mt-2 space-y-1 break-all text-xs text-muted-foreground">
            <p>{item.id}</p><p>{t("trajectory.scope")}: {t(`trajectory.scopes.${item.scope}`, { defaultValue: item.scope })}</p><p>{item.content_hash}</p>
          </div>
        </details>)}
      </div>}
      {record.stage!=="settled" && <Button size="sm" variant="outline" onClick={()=>setShowContent(value=>!value)}>{t(showContent?"trajectory.hideContent":"trajectory.showContent")}</Button>}
      {showContent && <RunObservationDetail accessToken={accessToken} conversationId={conversationId} runId={runId} requestId={record.request_id} epoch={record.execution_epoch} attempt={record.stage==="dispatch"?record.attempt:0} onAccessDenied={onAccessDenied}/>}
    </div>
  </details>
}

function RunObservationContent({ accessToken, conversationId, runId }: Props) {
  const { t } = useTranslation()
  const [cursors, setCursors] = React.useState<(string | undefined)[]>([undefined])
  const cursor = cursors[cursors.length - 1]
  const load = React.useCallback(() => getRunObservations(accessToken, conversationId, runId, cursor), [accessToken, conversationId, runId, cursor])
  const [accessError, setAccessError] = React.useState<AppError | null>(null)
  const resource = useApiResource({ load, enabled: !accessError, errorMessage: t("trajectory.unavailable") })
  const [newRecords, setNewRecords] = React.useState(false)
  const page = resource.data
  React.useEffect(() => {
    if (accessError) return
    let cancelled = false
    let inFlight = false
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || inFlight) return
      inFlight = true
      void getRunObservations(accessToken, conversationId, runId, undefined, true)
        .then(summary => {
          if (cancelled) return
          setNewRecords((summary.watermark ?? 0) > (page?.watermark ?? 0) || (summary.detail_watermark ?? 0) > (page?.detail_watermark ?? 0) || summary.status !== page?.status)
        })
        .catch(error => {
          if (cancelled) return
          const normalized = normalizeAppError(error)
          if (normalized.status === 403 || normalized.status === 404) setAccessError(normalized)
        })
        .finally(() => { inFlight = false })
    }, 10_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [accessToken, conversationId, runId, accessError, page?.watermark, page?.detail_watermark, page?.status])
  const retry = () => { if (accessError) setAccessError(null); else void resource.reload() }
  const busy = resource.state === "loading" || resource.state === "refreshing"
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6" data-run-observation-panel data-run-id={runId}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Badge variant="outline">{t("trajectory.notEvaluated")}</Badge>
      <Button size="sm" variant="ghost" onClick={() => { setNewRecords(false); setAccessError(null); if (cursors.length > 1) setCursors([undefined]); else retry() }} disabled={busy}><RefreshCwIcon className="size-4" />{t("trajectory.refresh")}</Button>
    </div>
    <p className="mb-5 text-sm text-muted-foreground">{t("trajectory.notEvaluatedHint")}</p>
    {newRecords && <p className="mb-4 text-sm text-muted-foreground" role="status">{t("trajectory.newRecords")}</p>}
    <DataState state={accessError || resource.error ? "error" : resource.state} error={accessError || resource.error} onRetry={retry}>
      {page && <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3">
          {[[t("trajectory.modelAttempts"), page.model_attempt_count], [t("trajectory.toolCount"), page.tool_count], [t("trajectory.duration"), page.wall_time_ms == null ? null : `${(page.wall_time_ms / 1000).toFixed(1)} s`]].map(([label, value]) => <div className="min-w-0" key={String(label)}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-base font-medium">{value ?? t("trajectory.unknown")}</p></div>)}
        </div>
        <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{t("trajectory.status")}</span><Badge variant="secondary">{t(`trajectory.statuses.${page.status}`, { defaultValue: page.status })}</Badge></div>
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t("trajectory.identity")}</summary>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("trajectory.run")}</dt><dd className="break-all font-mono text-xs">{page.run_id}</dd>
          <dt className="text-muted-foreground">{t("trajectory.fingerprint")}</dt><dd className="break-all font-mono text-xs">{page.definition_fingerprint ?? t("trajectory.unknown")}</dd>
        </dl></details>
        <Notice title={t(`trajectory.${page.coverage}`)}>{t("trajectory.partialHint")}</Notice>
        <div className="space-y-3">{page.records.map(record => <RecordDetails key={record.seq} record={record} accessToken={accessToken} conversationId={conversationId} runId={runId} onAccessDenied={setAccessError} />)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={busy || cursors.length === 1} onClick={() => setCursors(current => current.slice(0, -1))}>{t("trajectory.previous")}</Button>
          <span className="text-xs text-muted-foreground">{t("trajectory.page", { page: cursors.length })}</span>
          <Button variant="outline" size="sm" disabled={busy || !page.next_cursor} onClick={() => setCursors(current => [...current, page.next_cursor!])}>{t("trajectory.next")}</Button>
        </div>
      </div>}
    </DataState>
  </div>
}

export function RunObservationPanel(props: Props) {
  const { t } = useTranslation()
  return <Sheet open onOpenChange={open => { if (!open) props.onClose() }}>
    <SheetContent showCloseButton={false} className="gap-4 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
      <SheetHeader className="border-b px-4 pr-14 sm:px-6">
        <SheetTitle>{t("trajectory.title")}</SheetTitle>
        <SheetDescription>{t("trajectory.description")}</SheetDescription>
      </SheetHeader>
      <SheetClose asChild><Button className="absolute top-3 right-3" variant="ghost" size="icon-sm" aria-label={t("common.close")}><ArrowLeftIcon className="size-4 sm:hidden" /><XIcon className="hidden size-4 sm:block" /></Button></SheetClose>
      <RunObservationContent key={`${props.accessToken}:${props.conversationId}:${props.runId}`} {...props} />
    </SheetContent>
  </Sheet>
}
