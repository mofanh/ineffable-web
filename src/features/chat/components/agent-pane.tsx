import * as React from "react"
import { useTranslation } from "react-i18next"
import MarkdownIt from "markdown-it"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  type AgentPaneState,
  type ThinkBlock,
  type ToolCallView,
} from "@/features/chat/chat-pane-state"
import {
  renderSpecializedTool,
  type AgentUserInputResponse,
} from "@/features/chat/components/agent-tool-renderers"
import { ToolCallShell } from "@/features/chat/components/tool-call-shell"
import {
  registerDefaultWebNodeRenderer,
  WebNodeRendererRegistry,
  WebNodeSeat,
  type WebNodeRenderer,
} from "@/features/chat/components/web-node-registry"
import { getToolCallTitle } from "@/features/chat/model/tool-call-presentation"
import {
  WebNodeProjectionCache,
  type ReasoningWebNodePayload,
  type TextWebNodePayload,
  type ToolWebNodePayload,
  type UpdateWebNodePayload,
} from "@/features/chat/runtime/web-node-projection"
import { cn } from "@/lib/utils"
import { getCurrentLocale, i18n } from "@/lib/i18n/i18n"
import {
  sandboxPreviewExposureIdFromUrl,
  sandboxPreviewLaunchPath,
} from "@/lib/app/sandbox-preview"
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Globe2Icon,
  TerminalIcon,
} from "lucide-react"

const markdownIt = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

markdownIt.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const href = tokens[index].attrGet("href")
  const exposureId = href ? sandboxPreviewExposureIdFromUrl(href) : null
  if (exposureId) {
    tokens[index].attrSet("href", sandboxPreviewLaunchPath(exposureId))
    tokens[index].attrSet("target", "_blank")
    tokens[index].attrSet("rel", "noopener noreferrer")
  }

  return self.renderToken(tokens, index, options)
}

const MARKDOWN_BASE_CLASS =
  "whitespace-normal wrap-anywhere [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_li]:leading-6 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/5 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-xs [&_pre]:leading-6 [&_code]:vertical-middle [&_code]:inline-block [&_code]:rounded-sm [&_code]:border [&_code]:border-black/12 [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:text-inherit [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/15 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 [&_a]:underline [&_a]:underline-offset-3"

const THINK_MARKDOWN_CLASS =
  "space-y-4 [&_li>ol]:mt-1 [&_li>ol]:gap-1 [&_li>ul]:mt-1 [&_li>ul]:gap-1 [&_ol]:ml-2 [&_ol]:gap-2 [&_ul]:ml-2 [&_ul]:gap-2"

function MarkdownContent({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const renderedHtml = React.useMemo(() => markdownIt.render(content), [content])

  return <div className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
}

const AgentTextBlock = React.memo(function AgentTextBlock({
  content,
}: {
  content: string
}) {
  return (
    <div className="text-[15px] leading-8 text-foreground">
      <MarkdownContent
        content={content}
        className={cn(MARKDOWN_BASE_CLASS, "text-[15px] leading-8")}
      />
    </div>
  )
})

type JsonObject = Record<string, unknown>

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function parseJsonObject(value: string) {
  if (!value.trim()) {
    return null
  }

  try {
    return objectValue(JSON.parse(value))
  } catch {
    return null
  }
}

function isTerminalToolName(name: string) {
  return (
    name === "exec_command" ||
    name === "terminal_read" ||
    name === "terminal_list" ||
    name === "terminal_stop" ||
    name === "write_stdin"
  )
}

function terminalStatusTone(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === "running") {
    return "border-sky-500/25 text-sky-700 dark:text-sky-400"
  }
  if (normalized === "exited" || normalized === "completed" || normalized === "succeeded") {
    return "border-emerald-500/25 text-emerald-700 dark:text-emerald-400"
  }
  if (normalized === "interrupted" || normalized === "cancelled" || normalized === "canceled") {
    return "border-amber-500/25 text-amber-700 dark:text-amber-400"
  }
  if (normalized === "failed" || normalized === "timed_out" || normalized === "error") {
    return "border-destructive/25 text-destructive"
  }
  return "border-border text-foreground/65"
}

function terminalStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "running":
      return i18n.t("chat.agent.terminalRunning")
    case "exited":
    case "completed":
    case "succeeded":
      return i18n.t("chat.agent.terminalCompleted")
    case "interrupted":
    case "cancelled":
    case "canceled":
      return i18n.t("chat.agent.terminalInterrupted")
    case "timed_out":
      return i18n.t("chat.agent.terminalTimedOut")
    case "failed":
    case "error":
      return i18n.t("chat.agent.failed")
    default:
      return status
  }
}

function TerminalMetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-wide text-foreground/45">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[11px] leading-5 text-foreground/72">
        {value}
      </p>
    </div>
  )
}

function TerminalOutputBlock({ label, content }: { label: string; content: string }) {
  if (!content.trim()) {
    return null
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium tracking-wide text-foreground/45">{label}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap wrap-anywhere rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground/75">
        {content}
      </pre>
    </div>
  )
}

function TerminalSessionResult({ result }: { result: JsonObject }) {
  const sessionId = stringValue(result.session_id)
  const command = stringValue(result.command)
  const cwd = stringValue(result.cwd)
  const status = stringValue(result.status)
  const tty = booleanValue(result.tty)
  const cursor = numberValue(result.next_cursor ?? result.cursor)
  const exitCode = numberValue(result.exit_code)
  const lineRange =
    numberValue(result.start_line) || numberValue(result.end_line)
      ? `${numberValue(result.start_line) ?? "?"}-${numberValue(result.end_line) ?? "?"} / ${
          numberValue(result.total_lines) ?? "?"
        }`
      : ""
  const stdout = stringValue(result.stdout)
  const stderr = stringValue(result.stderr)
  const outputTail = stringValue(result.output_tail)
  const failureReason = stringValue(result.failure_reason)
  const nextAction = stringValue(result.next_action)
  const output = stdout || outputTail

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-foreground/75">
          <TerminalIcon className="size-3.5 flex-none" />
          <span className="truncate">
            {command || sessionId || i18n.t("chat.agent.terminalSession")}
          </span>
        </span>
        {status ? (
          <Badge
            variant="outline"
            className={cn(
              "h-5 rounded-full bg-transparent px-1.5 text-[10px]",
              terminalStatusTone(status)
            )}
          >
            {terminalStatusLabel(status)}
          </Badge>
        ) : null}
        {tty ? (
          <Badge
            variant="outline"
            className="h-5 rounded-full border-border bg-transparent px-1.5 text-[10px] text-foreground/65"
          >
            TTY
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {sessionId ? <TerminalMetaItem label={i18n.t("chat.agent.session")} value={sessionId} /> : null}
        {cwd ? <TerminalMetaItem label={i18n.t("chat.agent.cwd")} value={cwd} /> : null}
        {cursor !== null ? <TerminalMetaItem label={i18n.t("chat.agent.cursor")} value={cursor} /> : null}
        {lineRange ? <TerminalMetaItem label={i18n.t("chat.agent.lineRange")} value={lineRange} /> : null}
        {exitCode !== null ? <TerminalMetaItem label={i18n.t("chat.agent.exitCode")} value={exitCode} /> : null}
      </div>

      <TerminalOutputBlock label={i18n.t("chat.agent.output")} content={output} />
      <TerminalOutputBlock label={i18n.t("chat.agent.stderr")} content={stderr} />
      <TerminalOutputBlock label={i18n.t("chat.agent.failureReason")} content={failureReason} />
      <TerminalOutputBlock label={i18n.t("chat.agent.nextAction")} content={nextAction} />
    </div>
  )
}

function TerminalListResult({ result }: { result: JsonObject }) {
  const sessions = Array.isArray(result.sessions)
    ? result.sessions.map(objectValue).filter((session): session is JsonObject => Boolean(session))
    : []

  if (!sessions.length) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-foreground/60">
        {i18n.t("chat.agent.noSessions")}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((session, index) => {
        const sessionId = stringValue(session.session_id) || `session-${index + 1}`
        const status = stringValue(session.status)
        return (
          <div
            key={`${sessionId}-${index}`}
            className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <TerminalIcon className="size-3.5 flex-none text-foreground/55" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/75">
                {stringValue(session.command) || sessionId}
              </span>
              {status ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 rounded-full bg-transparent px-1.5 text-[10px]",
                    terminalStatusTone(status)
                  )}
                >
                  {terminalStatusLabel(status)}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <TerminalMetaItem label={i18n.t("chat.agent.session")} value={sessionId} />
              <TerminalMetaItem label={i18n.t("chat.agent.cwd")} value={stringValue(session.cwd) || "-"} />
            </div>
            <TerminalOutputBlock
              label={i18n.t("chat.agent.recentOutput")}
              content={stringValue(session.last_output_tail)}
            />
          </div>
        )
      })}
    </div>
  )
}

function renderTerminalToolResult(tool: ToolCallView) {
  if (!isTerminalToolName(tool.name)) {
    return null
  }

  const result = parseJsonObject(tool.output)
  if (!result) {
    return null
  }

  if (Array.isArray(result.sessions)) {
    return <TerminalListResult result={result} />
  }

  if (stringValue(result.session_id) || stringValue(result.status)) {
    return <TerminalSessionResult result={result} />
  }

  return null
}

type SandboxPreviewResult = {
  exposureId: string
  previewUrl: string
  label: string
  port: number | null
  status: string
  expiresAt: string
}

function sandboxPreviewResult(tool: ToolCallView): SandboxPreviewResult | null {
  if (tool.name !== "expose_sandbox_port") {
    return null
  }

  const parsed = parseJsonObject(tool.output)
  if (!parsed) {
    return null
  }

  const result = objectValue(parsed.result) ?? parsed
  const exposureId = stringValue(result.exposure_id)
  const previewUrl = stringValue(result.preview_url)
  if (!exposureId || !previewUrl) {
    return null
  }

  return {
    exposureId,
    previewUrl,
    label: stringValue(result.label),
    port: numberValue(result.port),
    status: stringValue(result.status) || "active",
    expiresAt: stringValue(result.expires_at),
  }
}

function sandboxPreviewStatusLabel(status: string) {
  const key = status.toLowerCase()
  if (
    key === "active" ||
    key === "expired" ||
    key === "stopped" ||
    key === "tunnel_disconnected" ||
    key === "provider_unavailable"
  ) {
    return i18n.t(`sandboxPreview.card.status.${key}`)
  }

  return status
}

function sandboxPreviewStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "border-emerald-500/25 text-emerald-700 dark:text-emerald-400"
    case "expired":
    case "stopped":
      return "border-amber-500/25 text-amber-700 dark:text-amber-400"
    case "tunnel_disconnected":
    case "provider_unavailable":
      return "border-destructive/25 text-destructive"
    default:
      return "border-border text-foreground/65"
  }
}

function formatSandboxPreviewExpiry(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) {
    return ""
  }

  return new Intl.DateTimeFormat(getCurrentLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function SandboxPreviewResultCard({ result }: { result: SandboxPreviewResult }) {
  const expiresAt = formatSandboxPreviewExpiry(result.expiresAt)
  const isActive = result.status.toLowerCase() === "active"

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 text-foreground">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-sky-700 dark:text-sky-400">
          <Globe2Icon className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {result.label || i18n.t("sandboxPreview.card.title")}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "h-5 rounded-full bg-transparent px-1.5 text-[10px]",
                sandboxPreviewStatusTone(result.status)
              )}
            >
              {sandboxPreviewStatusLabel(result.status)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/58">
            {result.port ? (
              <span>{i18n.t("sandboxPreview.card.port", { port: result.port })}</span>
            ) : null}
            {expiresAt ? (
              <span>{i18n.t("sandboxPreview.card.expiresAt", { time: expiresAt })}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {isActive ? (
          <Button asChild size="sm">
            <a
              href={sandboxPreviewLaunchPath(result.exposureId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon />
              {i18n.t("sandboxPreview.card.open")}
            </a>
          </Button>
        ) : (
          <p className="text-xs text-foreground/58">
            {i18n.t("sandboxPreview.card.unavailable")}
          </p>
        )}
      </div>
    </div>
  )
}

const ThinkBlockView = React.memo(function ThinkBlockView({
  block,
}: {
  block: ThinkBlock
}) {
  const [open, setOpen] = React.useState(block.open)

  React.useEffect(() => {
    setOpen(block.open)
  }, [block.open])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (block.open && !nextOpen) {
        return
      }

      setOpen(nextOpen)
    },
    [block.open]
  )

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="flex flex-col">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-1 text-left text-[14px] text-foreground/60 select-none transition-colors hover:text-foreground/80"
        >
          <span className="inline-flex items-center gap-1.5">
            <BrainCircuitIcon className="size-3.5" />
            <span>{i18n.t("chat.agent.thinking")}</span>
          </span>
          <ChevronDownIcon className="size-3.5 flex-none -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="animated-collapsible-content relative ml-[6.5px] border-l-[0.5px] border-border/50 pt-2 pl-3.5 text-xs text-foreground/65 [&_code]:text-xs">
        <MarkdownContent
          content={block.content}
          className={cn(MARKDOWN_BASE_CLASS, THINK_MARKDOWN_CLASS)}
        />
      </CollapsibleContent>
    </Collapsible>
  )
})

const ToolCallCard = React.memo(function ToolCallCard({
  tool,
  canRespondToUserInput,
  onSubmitUserInput,
}: {
  tool: ToolCallView
  canRespondToUserInput: boolean
  onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
}) {
  if (tool.name === "update_plan") {
    return null
  }

  const specialized = renderSpecializedTool({
    tool,
    canRespondToUserInput,
    onSubmitUserInput,
  })
  if (specialized) {
    return specialized
  }

  const terminalResult = renderTerminalToolResult(tool)
  const previewResult = sandboxPreviewResult(tool)

  if (previewResult) {
    return <SandboxPreviewResultCard result={previewResult} />
  }

  return (
    <ToolCallShell
      tool={tool}
      title={getToolCallTitle(tool) ?? undefined}
      lockOpen={tool.status === "running"}
    >
      {tool.input.trim() ? (
        <div className="space-y-1">
          <p className="text-[10px] font-medium tracking-wide opacity-55">
            {i18n.t("chat.agent.input")}
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5">
            {tool.input}
          </pre>
        </div>
      ) : null}

      {tool.output.trim() ? (
        <div className={cn("space-y-1", tool.input.trim() ? "mt-2" : "")}>
          <p className="text-[10px] font-medium tracking-wide opacity-55">
            {i18n.t("chat.agent.output")}
          </p>
          {terminalResult || (
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5">
              {tool.output}
            </pre>
          )}
        </div>
      ) : null}
    </ToolCallShell>
  )
})

const TextNodeRenderer: WebNodeRenderer<TextWebNodePayload> = ({ node }) => (
  <AgentTextBlock content={node.payload.content} />
)

const ReasoningNodeRenderer: WebNodeRenderer<ReasoningWebNodePayload> = ({
  node,
}) => <ThinkBlockView block={node.payload.block} />

const UpdateNodeRenderer: WebNodeRenderer<UpdateWebNodePayload> = ({ node }) => (
  <p className="text-sm leading-7 text-foreground/72">{node.payload.content}</p>
)

const ToolNodeRenderer: WebNodeRenderer<ToolWebNodePayload | null> = ({
  node,
  context,
}) =>
  node.payload ? (
    <ToolCallCard
      tool={node.payload.tool}
      canRespondToUserInput={node.payload.canRespondToUserInput}
      onSubmitUserInput={context.onSubmitUserInput}
    />
  ) : null

const FallbackNodeRenderer: WebNodeRenderer = ({ node }) => (
  <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs text-foreground/65">
    <p className="font-medium text-foreground/80">{node.fallback.title}</p>
    {node.fallback.summary ? (
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere leading-5">
        {node.fallback.summary}
      </p>
    ) : null}
  </div>
)

const DEFAULT_WEB_NODE_REGISTRY = new WebNodeRendererRegistry()
registerDefaultWebNodeRenderer(DEFAULT_WEB_NODE_REGISTRY, "text", TextNodeRenderer)
registerDefaultWebNodeRenderer(
  DEFAULT_WEB_NODE_REGISTRY,
  "reasoning",
  ReasoningNodeRenderer
)
registerDefaultWebNodeRenderer(DEFAULT_WEB_NODE_REGISTRY, "update", UpdateNodeRenderer)
registerDefaultWebNodeRenderer(DEFAULT_WEB_NODE_REGISTRY, "tool", ToolNodeRenderer)

export const WebNodeList = React.memo(function WebNodeList({
  pane,
  isStreaming = false,
  prefersReducedMotion = false,
  canRespondToUserInput = false,
  onSubmitUserInput,
}: {
  pane: AgentPaneState
  isStreaming?: boolean
  prefersReducedMotion?: boolean
  canRespondToUserInput?: boolean
  onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
}) {
  useTranslation()
  const [projectionCache] = React.useState(() => new WebNodeProjectionCache())
  const nodes = React.useMemo(
    () =>
      projectionCache.project(pane, {
        streaming: isStreaming,
        canRespondToUserInput,
      }),
    [canRespondToUserInput, isStreaming, pane, projectionCache]
  )
  const context = React.useMemo(
    () => ({ prefersReducedMotion, onSubmitUserInput }),
    [onSubmitUserInput, prefersReducedMotion]
  )

  return (
    <div className="space-y-3 text-sm">
      {nodes.map((node) => (
        <WebNodeSeat
          key={node.nodeId}
          node={node}
          registry={DEFAULT_WEB_NODE_REGISTRY}
          context={context}
          fallbackRenderer={FallbackNodeRenderer}
        />
      ))}
    </div>
  )
})
