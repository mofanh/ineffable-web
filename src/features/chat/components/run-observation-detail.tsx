import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataState } from "@/components/app/data-state"
import { Notice } from "@/components/app/notice"
import { getRunObservationDetail, type RunObservationDetailItem } from "@/features/chat/api/chat-api"
import { useApiResource } from "@/lib/app/use-api-resource"
import type { AppError } from "@/lib/app/api-errors"

type Props = {accessToken:string; conversationId:string; runId:string; requestId:string; epoch:number; attempt:number; onAccessDenied:(error:AppError)=>void}
function Body({item}:{item:RunObservationDetailItem}) {
  const {t}=useTranslation()
  if (item.restricted) return <p className="text-xs text-muted-foreground">{t("trajectory.restrictedBody")}</p>
  return <div className="min-w-0 space-y-2">
    {(item.truncated || item.redacted) && <div className="flex flex-wrap gap-1">{item.truncated && <Badge variant="outline">{t("trajectory.bodyTruncated")}</Badge>}{item.redacted && <Badge variant="outline">{t("trajectory.redacted")}</Badge>}</div>}
    <pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-mono text-xs [overflow-wrap:anywhere]">{item.body || t("trajectory.emptyBody")}</pre>
  </div>
}
function DetailPage(props:Props & {section:string; offset:number; onOffset:(offset:number)=>void}) {
  const {t}=useTranslation()
  const {accessToken,conversationId,runId,requestId,epoch,attempt,section,offset,onAccessDenied}=props
  const load=React.useCallback(()=>getRunObservationDetail(accessToken,conversationId,runId,{request_id:requestId,execution_epoch:epoch,section,attempt:section==="wire"?attempt:0,item_offset:offset}),[accessToken,conversationId,runId,requestId,epoch,section,attempt,offset])
  const resource=useApiResource({load,errorMessage:t("trajectory.unavailable")})
  React.useEffect(()=>{if(resource.error?.status===403 || resource.error?.status===404) onAccessDenied(resource.error)},[resource.error,onAccessDenied])
  const page=resource.data
  const busy=resource.isLoading || resource.isRefreshing
  return <div className="space-y-3" data-observation-detail={section}>
    <DataState state={resource.error?"error":resource.state} error={resource.error} onRetry={()=>void resource.reload()}>
      {page && <div className="space-y-4">
        {page.coverage!=="partial" ? <Notice title={t(`trajectory.${page.coverage}`)}>{t(page.coverage==="expired"?"trajectory.expiredBodyHint":"trajectory.oldBodyHint")}</Notice> : <>
          <p className="text-xs text-muted-foreground">{t("trajectory.snapshotHint")}</p>
          {page.partial && <Notice title={t("trajectory.partialOutput")}>{t("trajectory.partialOutputHint")}</Notice>}
          {page.truncated && <p className="text-xs text-muted-foreground">{t("trajectory.detailTruncated")}</p>}
          {section==="output" && <dl className="grid grid-cols-2 gap-2 text-xs"><dt>{t("trajectory.firstContent")}</dt><dd>{page.first_content_ms==null?t("trajectory.unknown"):`${page.first_content_ms} ms`}</dd><dt>{t("trajectory.duration")}</dt><dd>{page.duration_ms==null?t("trajectory.unknown"):`${page.duration_ms} ms`}</dd><dd className="col-span-2 text-muted-foreground">{t("trajectory.firstContentHint")}</dd></dl>}
          {section==="compaction" && <p className="text-xs text-muted-foreground">{t("trajectory.compactionSourceHint")}</p>}
          {page.items.map(item=>{
            const before=page.previous?.items.find(previous=>previous.id===item.id)
            const changed=before?.content_hash!==item.content_hash
            return <section key={item.id} className="min-w-0 space-y-2 rounded-lg border p-3" data-detail-item={item.id}>
              <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-medium">{t(`trajectory.kinds.${item.kind}`,{defaultValue:item.kind})}</h4>{item.status && <Badge variant="outline">{t(`trajectory.statuses.${item.status}`,{defaultValue:item.status})}</Badge>}{item.duration_ms!=null && <span className="text-xs text-muted-foreground">{item.duration_ms} ms</span>}</div>
              <p className="break-all text-xs text-muted-foreground">{item.source}</p>
              <Body item={item}/>
              {section==="input" && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{t("trajectory.compareContent")}</summary>
                {item.restricted || before?.restricted ? <p className="mt-2 text-muted-foreground">{t("trajectory.restrictedBody")}</p> : !item.comparable || !page.previous ? <p className="mt-2 text-muted-foreground">{t("trajectory.diffUnavailable")}</p> : !before ? <p className="mt-2 text-muted-foreground">{t((page.previous.truncated || page.previous.comparison_incomplete)?"trajectory.diffUnavailable":"trajectory.addedContent")}</p> : !changed ? <p className="mt-2 text-muted-foreground">{t("trajectory.sameContent")}</p> : <div className="mt-3 space-y-2"><p className="break-all text-muted-foreground">{t("trajectory.previousContent")} · {page.previous.request_id}</p><Body item={before}/><p className="text-muted-foreground">{t("trajectory.diffHint")}</p></div>}
              </details>}
            </section>
          })}
          {page.items.length===0 && <p className="text-sm text-muted-foreground">{t("trajectory.noDetailItems")}</p>}
          <div className="flex flex-wrap justify-between gap-2"><Button size="sm" variant="outline" disabled={busy || offset===0} onClick={()=>props.onOffset(Math.max(0,offset-2))}>{t("trajectory.previous")}</Button><Button size="sm" variant="outline" disabled={busy || page.next_item_offset==null} onClick={()=>props.onOffset(page.next_item_offset!)}>{t("trajectory.next")}</Button></div>
        </>}
      </div>}
    </DataState>
  </div>
}
export function RunObservationDetail(props:Props) {
  const {t}=useTranslation()
  const [section,setSection]=React.useState(props.attempt>0?"wire":"input")
  const [offset,setOffset]=React.useState(0)
  const sections=props.attempt>0?["wire"]:["input","output","tools","compaction"]
  return <div className="space-y-4 border-t pt-4">
    <div className="flex flex-wrap gap-1" aria-label={t("trajectory.contentSections")}>{sections.map(value=><Button key={value} size="sm" variant={value===section?"secondary":"ghost"} aria-pressed={value===section} onClick={()=>{setSection(value);setOffset(0)}}>{t(`trajectory.sections.${value}`)}</Button>)}</div>
    <DetailPage key={`${section}:${offset}`} {...props} section={section} offset={offset} onOffset={setOffset}/>
  </div>
}
