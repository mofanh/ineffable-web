import { GlobeIcon } from "lucide-react"
import type { ToolCallView } from "@/features/chat/chat-pane-state"
import type { WebToolResult } from "@/features/chat/model/web-tool-result"
import { ToolCallShell } from "@/features/chat/components/tool-call-shell"
import { i18n } from "@/lib/i18n/i18n"

function errorHint(code: string, fallback: string) {
  switch (code) {
    case "rate_limited": return i18n.t("chat.agent.web.rateLimited")
    case "captcha": return i18n.t("chat.agent.web.captcha")
    case "timeout": return i18n.t("chat.agent.web.timeout")
    case "busy": return i18n.t("chat.agent.web.busy")
    default: return fallback
  }
}

export function WebToolCard({ tool, result }: { tool: ToolCallView; result: WebToolResult }) {
  const title = i18n.t(result.kind === "web_search" ? "chat.agent.web.search" : "chat.agent.web.fetch")
  const partial = !("error" in result) && result.kind === "web_search" && result.partial
  const error = "error" in result ? errorHint(result.code ?? "", result.error ?? "") : null
  const warnings = ("warnings" in result ? result.warnings : null) ?? []
  return (
    <ToolCallShell tool={tool} title={title} icon={<GlobeIcon className="size-3.5 flex-none" />}
      statusLabel={partial && tool.status === "succeeded" ? i18n.t("chat.agent.web.partial") : undefined}
      summary={"error" in result ? error : result.kind === "web_search" ? i18n.t("chat.agent.web.sources", { count: result.results.length }) : result.title || result.url}
    >
      <div className="space-y-2">
        {"error" in result ? <>
          <p className="text-destructive">{error}</p>
          {result.retryAfter ? <p>{i18n.t("chat.agent.web.retryAfter", { seconds: result.retryAfter })}</p> : null}
        </> : <>
          {partial ? <p className="text-amber-700 dark:text-amber-400">{i18n.t("chat.agent.web.partialHint")}</p> : null}
          {result.kind === "web_search" ? result.results.length ? <ul className="space-y-3">
            {result.results.map((source, index) => <li key={`${source.url}:${index}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 wrap-anywhere">{source.title || source.url}</a>
              <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{source.snippet}</p>
            </li>)}
          </ul> : <p>{i18n.t("chat.agent.web.empty")}</p> : <>
            {result.url ? <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 wrap-anywhere">{result.title || result.url}</a> : null}
            <p className="max-h-80 overflow-y-auto whitespace-pre-wrap wrap-anywhere">{result.content}</p>
            {result.hasMore ? <p className="text-muted-foreground">{i18n.t("chat.agent.web.window")}</p> : null}
          </>}
          {result.truncated ? <p className="text-muted-foreground">{i18n.t("chat.agent.web.truncated")}</p> : null}
        </>}
        {warnings.length ? <ul className="text-muted-foreground space-y-1">
          {warnings.map((warning, index) => <li key={`${warning.source}:${index}`}>
            {warning.source}: {errorHint(warning.code, i18n.t("chat.agent.web.sourceUnavailable"))}
          </li>)}
        </ul> : null}
      </div>
    </ToolCallShell>
  )
}
