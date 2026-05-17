import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  SandboxExecutionSession,
  SandboxExecutionTimeline,
} from "@/lib/api/gateway-client"
import {
  BoxesIcon,
  Clock3Icon,
  FileArchiveIcon,
  FileClockIcon,
  HistoryIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"

type SandboxTimelineCardProps = {
  timeline: SandboxExecutionTimeline | null
  toolCallId: string
  toolCallSessions: SandboxExecutionSession[]
  isLoading?: boolean
  error?: string | null
  onToolCallIdChange: (value: string) => void
  onLookupToolCall: () => void
  onSelectSession: (session: SandboxExecutionSession) => void
  onRefresh: () => void
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

function formatMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || !Object.keys(metadata).length) {
    return null
  }
  return JSON.stringify(metadata, null, 2)
}

export function SandboxTimelineCard({
  timeline,
  toolCallId,
  toolCallSessions,
  isLoading,
  error,
  onToolCallIdChange,
  onLookupToolCall,
  onSelectSession,
  onRefresh,
}: SandboxTimelineCardProps) {
  const hasAuditTrail =
    Boolean(timeline?.logs.length) ||
    Boolean(timeline?.artifacts.length) ||
    Boolean(timeline?.checkpoints.length)

  return (
    <Card className="bg-muted/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="size-4" />
            Timeline
          </CardTitle>
          <CardDescription>
            tool call、execution session、日志、产物与 checkpoint 的统一视图。
          </CardDescription>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading || !timeline}>
          <RefreshCwIcon className={isLoading ? "animate-spin" : ""} />
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="sandbox-tool-call-id">Tool call ID</Label>
            <Input
              id="sandbox-tool-call-id"
              value={toolCallId}
              onChange={(event) => onToolCallIdChange(event.target.value)}
              placeholder="tool-call-id"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={onLookupToolCall}
              disabled={isLoading || !toolCallId.trim()}
            >
              <SearchIcon />
              查询
            </Button>
          </div>
        </div>

        {toolCallSessions.length ? (
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs">关联 execution sessions</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {toolCallSessions.map((item) => (
                <button
                  type="button"
                  key={item.execution_session_id}
                  className="rounded-md border bg-background/70 p-3 text-left transition hover:bg-background"
                  onClick={() => onSelectSession(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {shortId(item.execution_session_id)}
                    </span>
                    <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {item.environment_id}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!timeline ? (
          <p className="text-muted-foreground text-sm">选择或提交一次执行后显示 timeline。</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">Session</div>
                <div className="mt-1 truncate text-sm font-medium">
                  {shortId(timeline.session.execution_session_id)}
                </div>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">Status</div>
                <div className="mt-1">
                  <Badge variant={timeline.session.status === "failed" ? "destructive" : "secondary"}>
                    {timeline.session.status}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">Logs</div>
                <div className="mt-1 text-sm font-medium">{timeline.logs.length}</div>
              </div>
              <div className="rounded-md border bg-background/70 p-3">
                <div className="text-muted-foreground text-xs">Artifacts</div>
                <div className="mt-1 text-sm font-medium">{timeline.artifacts.length}</div>
              </div>
            </div>

            {timeline.session.failure_reason ? (
              <p className="text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                {timeline.session.failure_reason}
              </p>
            ) : null}

            {!hasAuditTrail ? (
              <p className="text-muted-foreground text-sm">当前 session 暂无审计日志、产物或 checkpoint。</p>
            ) : null}

            {timeline.logs.length ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Clock3Icon className="size-4" />
                  Logs
                </h3>
                <div className="space-y-2">
                  {timeline.logs.map((log) => (
                    <div key={log.log_id} className="rounded-md border bg-background/70 p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <Badge variant="outline">{log.stream}</Badge>
                        <span className="text-muted-foreground text-xs">{log.created_at}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{log.message}</p>
                      {formatMetadata(log.metadata_json) ? (
                        <pre className="bg-muted/70 mt-2 max-h-40 overflow-auto rounded-md p-2 text-xs">
                          {formatMetadata(log.metadata_json)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {timeline.artifacts.length ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <FileArchiveIcon className="size-4" />
                  Artifacts
                </h3>
                <div className="space-y-2">
                  {timeline.artifacts.map((artifact) => (
                    <div key={artifact.artifact_id} className="rounded-md border bg-background/70 p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="break-all text-sm font-medium">{artifact.name}</span>
                        <Badge variant="outline">{artifact.artifact_type}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-2 break-all text-xs">{artifact.uri}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {timeline.checkpoints.length ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <FileClockIcon className="size-4" />
                  Checkpoints
                </h3>
                <div className="space-y-2">
                  {timeline.checkpoints.map((checkpoint) => (
                    <div key={checkpoint.checkpoint_id} className="rounded-md border bg-background/70 p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="break-all text-sm font-medium">
                          {checkpoint.checkpoint_ref}
                        </span>
                        <span className="text-muted-foreground text-xs">{checkpoint.created_at}</span>
                      </div>
                      {formatMetadata(checkpoint.metadata_json) ? (
                        <pre className="bg-muted/70 mt-2 max-h-40 overflow-auto rounded-md p-2 text-xs">
                          {formatMetadata(checkpoint.metadata_json)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <BoxesIcon className="size-4" />
                Session metadata
              </h3>
              <pre className="bg-background/70 max-h-56 overflow-auto rounded-md border p-3 text-xs leading-5">
                {JSON.stringify(timeline.session.metadata_json ?? {}, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
