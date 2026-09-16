import * as React from "react"
import { Moon, FileText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { getConversation, type Conversation } from "@/lib/api/api-client"

export function DailyHandoffNotice({accessToken,conversationId,onOpenConversation,refreshKey}: {refreshKey:number;accessToken:string;conversationId:string;onOpenConversation:(id:string)=>void}) {
  const {t}=useTranslation()
  const [record,setRecord]=React.useState<Conversation|null>(null)
  React.useEffect(()=>{
    let active=true
    let timer:ReturnType<typeof setTimeout>|undefined
    let failures=0
    async function refresh(){
      try{
        const conversation=await getConversation(accessToken,conversationId)
        if(!active)return
        failures=0;setRecord(conversation)
        // The server owns release. Poll only while this selected root is waiting,
        // and stop on unmount; a stale response cannot update the next selection.
        if(conversation.daily_handoff?.waiting) timer=setTimeout(()=>void refresh(),3000)
      }catch{
        if(active && ++failures<=3)timer=setTimeout(()=>void refresh(),5000)
      }
    }
    void refresh()
    return()=>{active=false;if(timer)clearTimeout(timer)}
  },[accessToken,conversationId,refreshKey])
  const handoff=record?.daily_handoff
  const summary=record?.daily_summary
  if(!handoff && !summary)return null
  return <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground" role="status">
    {handoff?.waiting ? <><Moon className="size-3.5 shrink-0" /><span>{t("automation.daily.waiting")}</span><Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={()=>onOpenConversation(handoff.conversation_id)}>{t("automation.daily.view")}</Button></>:null}
    {handoff && !handoff.waiting ? <><Moon className="size-3.5 shrink-0" /><span>{t(["completed","failed","cancelled","skipped"].includes(handoff.status ?? "") ? `automation.status.${handoff.status}` : "automation.daily.released")}</span><Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={()=>onOpenConversation(handoff.conversation_id)}>{t("automation.daily.view")}</Button></>:null}
    {summary ? <Link className="inline-flex items-center gap-1 hover:underline" to={`/workspace/${encodeURIComponent(summary.workspace_id)}/objects/${encodeURIComponent(summary.object_id)}`}><FileText className="size-3.5" />{t("automation.daily.summary")}</Link>:null}
  </div>
}
