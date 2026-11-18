import { ChevronRightIcon, MessageSquareReplyIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AgentReport } from "../model/input-progress"

export function AgentReportStep({ report }: { report: AgentReport }) {
  const { t } = useTranslation()
  return <details className="group min-w-0" data-agent-report={report.task_id}>
    <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <MessageSquareReplyIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate font-medium">{t("chat.messages.agentReport", { name: report.name })}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 group-open:rotate-90" aria-hidden="true" />
    </summary>
    <p className="mt-1 pl-5 text-sm leading-6 whitespace-pre-wrap wrap-anywhere">{report.content}</p>
  </details>
}
