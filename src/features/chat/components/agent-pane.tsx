import * as React from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"
import MarkdownIt from "markdown-it"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FRONTEND_WEB_PLUGIN_ID,
} from "@/features/chat/web-node"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  type AgentPaneState,
  getPaneBlocks,
  type ThinkBlock,
  type ToolCallView,
} from "@/features/chat/chat-pane-state"
import type { SubagentView } from "@/features/chat/gateway-chat-types"
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
import { getToolCallPresentation } from "@/features/chat/model/tool-call-presentation"
import { parseLeadingJsonObject } from "@/features/chat/model/leading-json-object"
import { IncrementalMarkdownProjector } from "@/features/chat/runtime/incremental-markdown"
import {
  WORKSPACE_WEB_PLUGIN_ID,
  workspaceArtifactHref,
  type WorkspaceArtifactReference,
} from "@/features/chat/runtime/workspace-artifacts"
import {
  WebNodeProjectionCache,
  type ReasoningWebNodePayload,
  type SubagentWebNodePayload,
  type TextWebNodePayload,
  type ToolWebNodePayload,
  type UpdateWebNodePayload,
  type WorkspaceArtifactsWebNodePayload,
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
  FileIcon,
  Globe2Icon,
  TerminalIcon,
} from "lucide-react"

type FrontendNoticePayload = { title: string; body?: string }

function subagentSummary(subagent: SubagentView) {
  const lastBlock = getPaneBlocks(subagent).at(-1)
  if (!lastBlock) return ""
  if (lastBlock.type === "tool") return subagent.tools[lastBlock.toolId]?.name ?? ""
  if (lastBlock.type === "plugin") {
    return lastBlock.node.fallback.summary ?? lastBlock.node.fallback.title
  }
  return lastBlock.content.split("\n").filter(Boolean).at(-1)?.trim() ?? ""
}

const SubagentNodeRenderer: WebNodeRenderer<SubagentWebNodePayload> = ({
  node,
  context,
}) => {
  const { subagent } = node.payload
  const [open, setOpen] = React.useState(false)
  const summary = subagentSummary(subagent)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-7 w-full min-w-0 items-center gap-2 rounded-md text-left text-xs text-foreground/62 hover:text-foreground/85 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="shrink-0 font-medium">
            {i18n.t("chat.messages.subtask", { name: subagent.name })}
          </span>
          {!open && summary ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/42">{summary}</span>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px]">
            {subagent.status === "streaming"
              ? i18n.t("chat.messages.running")
              : i18n.t("chat.messages.completed")}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="animated-collapsible-content mt-2 border-l border-sidebar-border/70 pl-3">
        <WebNodeList
          pane={subagent}
          isStreaming={subagent.status === "streaming"}
          prefersReducedMotion={context.prefersReducedMotion}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function formatArtifactSize(sizeBytes: number | null) {
  if (sizeBytes === null) return null
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

const WorkspaceArtifactCard = React.memo(function WorkspaceArtifactCard({
  artifact,
}: {
  artifact: WorkspaceArtifactReference
}) {
  const title = artifact.path.split("/").filter(Boolean).at(-1) ?? artifact.path
  const size = formatArtifactSize(artifact.sizeBytes)
  return (
    <Link
      to={workspaceArtifactHref(artifact)}
      className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-border/65 bg-muted/20 px-2.5 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileIcon className="size-4 flex-none text-foreground/45" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground/80">{title}</span>
        <span className="block truncate text-[10px] text-foreground/45">
          {artifact.mimeType}
          {size ? ` · ${size}` : ""}
          {artifact.versionId
            ? ` · ${artifact.versionId.slice(0, 8)}`
            : ` · ${i18n.t("chat.agent.currentVersion")}`}
        </span>
      </span>
      <ExternalLinkIcon className="size-3.5 flex-none text-foreground/35 group-hover:text-foreground/60" />
    </Link>
  )
})

const WorkspaceArtifactOverflow = React.memo(function WorkspaceArtifactOverflow({
  artifacts,
}: {
  artifacts: WorkspaceArtifactReference[]
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <details
      className="rounded-lg border border-border/50 px-2.5 py-1.5 text-xs text-foreground/55"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {i18n.t("chat.agent.moreArtifacts", { count: artifacts.length })}
      </summary>
      {open ? (
        <div className="mt-2 grid min-w-0 gap-1.5 sm:grid-cols-2">
          {artifacts.map((artifact) => (
            <WorkspaceArtifactCard key={artifact.artifactId} artifact={artifact} />
          ))}
        </div>
      ) : null}
    </details>
  )
})

const WorkspaceArtifactsRenderer: WebNodeRenderer<WorkspaceArtifactsWebNodePayload> = ({
  node,
}) => {
  const visible = node.payload.artifacts.slice(0, 4)
  const overflow = node.payload.artifacts.slice(4)
  return (
    <section className="space-y-1.5" aria-label={node.fallback.title}>
      <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
        {visible.map((artifact) => (
          <WorkspaceArtifactCard key={artifact.artifactId} artifact={artifact} />
        ))}
      </div>
      {overflow.length ? (
        <WorkspaceArtifactOverflow artifacts={overflow} />
      ) : null}
    </section>
  )
}

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

markdownIt.renderer.rules.image = (tokens, index, options, _env, self) => {
  tokens[index].attrSet("loading", "lazy")
  tokens[index].attrSet("decoding", "async")
  return self.renderToken(tokens, index, options)
}

function codeBlockShell(content: string, language: string) {
  const escapedLanguage = markdownIt.utils.escapeHtml(language || "text")
  const copyLabel = markdownIt.utils.escapeHtml(i18n.t("chat.agent.copyCode"))
  return `<div class="chat-code-block"><div class="chat-code-header"><span>${escapedLanguage}</span><button type="button" data-copy-code aria-label="${copyLabel}" title="${copyLabel}">⧉</button></div>${content}</div>`
}

const defaultFenceRenderer = markdownIt.renderer.rules.fence?.bind(
  markdownIt.renderer.rules
)
markdownIt.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || "text"
  const rendered = defaultFenceRenderer
    ? defaultFenceRenderer(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
  return codeBlockShell(rendered, language)
}

const MARKDOWN_BASE_CLASS = "whitespace-normal wrap-anywhere"

const THINK_MARKDOWN_CLASS =
  "space-y-4 [&_li>ol]:mt-1 [&_li>ol]:gap-1 [&_li>ul]:mt-1 [&_li>ul]:gap-1 [&_ol]:ml-2 [&_ol]:gap-2 [&_ul]:ml-2 [&_ul]:gap-2"

async function renderSettledMarkdown(content: string) {
  const { highlightSettledCode } = await import(
    "@/features/chat/runtime/chat-syntax-highlighter"
  )
  const tokens = markdownIt.parse(content, {})

  await Promise.all(
    tokens.map(async (token) => {
      if (token.type !== "fence") return
      const language = token.info.trim().split(/\s+/)[0] || "text"
      try {
        const highlighted = await highlightSettledCode(token.content, language)
        if (!highlighted) return
        token.type = "html_block"
        token.tag = ""
        token.nesting = 0
        token.content = codeBlockShell(highlighted, language)
      } catch {
        // Unknown languages remain escaped markdown-it code blocks.
      }
    })
  )

  return markdownIt.renderer.render(tokens, markdownIt.options, {})
}

const MarkdownFragment = React.memo(function MarkdownFragment({
  content,
  settled,
}: {
  content: string
  settled: boolean
}) {
  const plainHtml = React.useMemo(() => markdownIt.render(content), [content])
  const [highlightedHtml, setHighlightedHtml] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!settled || !content.includes("```")) {
      setHighlightedHtml(null)
      return
    }

    let cancelled = false
    void renderSettledMarkdown(content).then((html) => {
      if (!cancelled) setHighlightedHtml(html)
    })
    return () => {
      cancelled = true
    }
  }, [content, settled])

  return <div dangerouslySetInnerHTML={{ __html: highlightedHtml ?? plainHtml }} />
})

const MAX_INLINE_MARKDOWN_CHARS = 256 * 1024
const OVERSIZED_MARKDOWN_PREVIEW_CHARS = 16 * 1024

function ProjectedMarkdownContent({
  content,
  streaming = false,
  className,
}: {
  content: string
  streaming?: boolean
  className?: string
}) {
  const [projector] = React.useState(() => new IncrementalMarkdownProjector())
  const segments = React.useMemo(
    () => projector.project(content, !streaming),
    [content, projector, streaming]
  )
  const handleCodeCopy = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLButtonElement>("[data-copy-code]")
      if (!button) return
      const code = button.closest(".chat-code-block")?.querySelector("code")
      if (!code?.textContent || !navigator.clipboard) return
      void navigator.clipboard.writeText(code.textContent)
    },
    []
  )

  return (
    <div
      className={cn("chat-markdown", className)}
      data-streaming={streaming || undefined}
      onClick={handleCodeCopy}
    >
      {segments.map((segment) => (
        <MarkdownFragment
          key={segment.id}
          content={segment.content}
          settled={!streaming && segment.stable}
        />
      ))}
    </div>
  )
}

const OversizedMarkdownContent = React.memo(function OversizedMarkdownContent({
  content,
  streaming,
  className,
}: {
  content: string
  streaming: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const preview = React.useMemo(
    () => content.slice(0, OVERSIZED_MARKDOWN_PREVIEW_CHARS),
    [content]
  )
  return (
    <details
      data-oversized-markdown
      className={cn("rounded-lg border border-border/55 bg-muted/15 px-3 py-2", className)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-xs text-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {i18n.t("chat.agent.output")} · {formatArtifactSize(content.length * 2)}
      </summary>
      {open ? (
        <ProjectedMarkdownContent
          content={content}
          streaming={streaming}
          className="mt-2"
        />
      ) : (
        <pre className="mt-2 max-h-48 overflow-hidden whitespace-pre-wrap wrap-anywhere text-xs leading-5 text-foreground/55">
          {preview}
          {"\n…"}
        </pre>
      )}
    </details>
  )
})

function MarkdownContent({
  content,
  streaming = false,
  className,
}: {
  content: string
  streaming?: boolean
  className?: string
}) {
  if (content.length > MAX_INLINE_MARKDOWN_CHARS) {
    return (
      <OversizedMarkdownContent
        content={content}
        streaming={streaming}
        className={className}
      />
    )
  }
  return (
    <ProjectedMarkdownContent
      content={content}
      streaming={streaming}
      className={className}
    />
  )
}

const AgentTextBlock = React.memo(function AgentTextBlock({
  content,
  streaming,
}: {
  content: string
  streaming: boolean
}) {
  return (
    <div className="text-[15px] leading-8 text-foreground">
      <MarkdownContent
        content={content}
        streaming={streaming}
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

  const result = parseLeadingJsonObject(tool.output)
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

  const parsed = parseLeadingJsonObject(tool.output)
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
  streaming,
}: {
  block: ThinkBlock
  streaming: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const latestLine = React.useMemo(
    () =>
      block.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1) ?? "",
    [block.content]
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-6 min-w-0 items-center gap-2 text-left text-[12px] text-foreground/60 select-none transition-colors hover:text-foreground/85 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="inline-flex items-center gap-1.5">
            <BrainCircuitIcon className="size-3.5" />
            <span>{i18n.t("chat.agent.thinking")}</span>
          </span>
          {!open && latestLine ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/45">
              {latestLine}
            </span>
          ) : null}
          <ChevronDownIcon className="ml-auto size-3.5 flex-none -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="animated-collapsible-content relative ml-[6.5px] border-l-[0.5px] border-border/50 pt-2 pl-3.5 text-xs text-foreground/65 [&_code]:text-xs">
        <MarkdownContent
          content={block.content}
          streaming={streaming}
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
  const presentation = getToolCallPresentation(tool)

  if (previewResult) {
    return <SandboxPreviewResultCard result={previewResult} />
  }

  return (
    <ToolCallShell
      tool={tool}
      title={presentation.title}
      summary={presentation.summary}
      autoOpenActive={false}
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
  <AgentTextBlock
    content={node.payload.content}
    streaming={node.payload.streaming}
  />
)

const ReasoningNodeRenderer: WebNodeRenderer<ReasoningWebNodePayload> = ({
  node,
}) => (
  <ThinkBlockView
    block={node.payload.block}
    streaming={node.payload.streaming}
  />
)

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
    <p className="font-medium text-foreground/80">
      {node.fallback.localizationKey
        ? i18n.t(`chat.agent.${node.fallback.localizationKey}`)
        : node.fallback.title}
    </p>
    {node.fallback.summary ? (
      <p className="mt-1 whitespace-pre-wrap wrap-anywhere leading-5">
        {node.fallback.summary}
      </p>
    ) : null}
  </div>
)

const FrontendNoticeRenderer: WebNodeRenderer<FrontendNoticePayload> = ({
  node,
}) => (
  <aside className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
    <p className="text-xs font-medium text-foreground/85">{node.payload.title}</p>
    {node.payload.body ? (
      <p className="mt-1 text-xs leading-5 text-foreground/60">{node.payload.body}</p>
    ) : null}
  </aside>
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
registerDefaultWebNodeRenderer(
  DEFAULT_WEB_NODE_REGISTRY,
  "subagent",
  SubagentNodeRenderer
)
DEFAULT_WEB_NODE_REGISTRY.register<FrontendNoticePayload>(
  FRONTEND_WEB_PLUGIN_ID,
  "notice",
  FrontendNoticeRenderer,
  (payload): payload is FrontendNoticePayload => {
    const value = objectValue(payload)
    return Boolean(
      value &&
        typeof value.title === "string" &&
        value.title.trim() &&
        value.title.length <= 160 &&
        (value.body === undefined ||
          (typeof value.body === "string" && value.body.length <= 2000))
    )
  }
)
DEFAULT_WEB_NODE_REGISTRY.register<WorkspaceArtifactsWebNodePayload>(
  WORKSPACE_WEB_PLUGIN_ID,
  "artifact-stack",
  WorkspaceArtifactsRenderer,
  (payload): payload is WorkspaceArtifactsWebNodePayload => {
    const value = objectValue(payload)
    return Boolean(
      value &&
        Array.isArray(value.artifacts) &&
        value.artifacts.every((item) => {
          const artifact = objectValue(item)
          return Boolean(
            artifact &&
              typeof artifact.artifactId === "string" &&
              typeof artifact.workspaceId === "string" &&
              typeof artifact.objectId === "string" &&
              typeof artifact.path === "string" &&
              typeof artifact.mimeType === "string" &&
              typeof artifact.source === "string" &&
              (artifact.versionId === null ||
                typeof artifact.versionId === "string") &&
              (artifact.sizeBytes === null ||
                typeof artifact.sizeBytes === "number")
          )
        })
    )
  }
)

const WEB_NODE_VIRTUALIZATION_THRESHOLD = 60
const WEB_NODE_VIRTUAL_OVERSCAN = 8
const WEB_NODE_ESTIMATED_HEIGHT = 96

const WebNodeItem = React.memo(function WebNodeItem({
  node,
  context,
}: {
  node: ReturnType<WebNodeProjectionCache["project"]>[number]
  context: {
    prefersReducedMotion: boolean
    onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
  }
}) {
  return (
    <div data-chat-row-key={node.nodeId}>
      <WebNodeSeat
        node={node}
        registry={DEFAULT_WEB_NODE_REGISTRY}
        context={context}
        fallbackRenderer={FallbackNodeRenderer}
      />
    </div>
  )
})

export const WebNodeList = React.memo(function WebNodeList({
  pane,
  isStreaming = false,
  prefersReducedMotion = false,
  canRespondToUserInput = false,
  onSubmitUserInput,
  subagentOrder = [],
  subagents = {},
  layoutEpoch,
}: {
  pane: AgentPaneState
  isStreaming?: boolean
  prefersReducedMotion?: boolean
  canRespondToUserInput?: boolean
  onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
  subagentOrder?: string[]
  subagents?: Record<string, SubagentView>
  layoutEpoch?: string
}) {
  useTranslation()
  const [projectionCache] = React.useState(() => new WebNodeProjectionCache())
  const nodes = React.useMemo(
    () =>
      projectionCache.project(
        pane,
        { streaming: isStreaming, canRespondToUserInput },
        { order: subagentOrder, records: subagents }
      ),
    [canRespondToUserInput, isStreaming, pane, projectionCache, subagentOrder, subagents]
  )
  const context = React.useMemo(
    () => ({ prefersReducedMotion, onSubmitUserInput }),
    [onSubmitUserInput, prefersReducedMotion]
  )
  const virtualizationEnabled = nodes.length > WEB_NODE_VIRTUALIZATION_THRESHOLD
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = React.useState(0)
  React.useLayoutEffect(() => {
    if (!virtualizationEnabled) return
    const root = rootRef.current
    const scroller = root?.closest<HTMLElement>("[data-chat-scroll-region]") ?? null
    setScrollElement(scroller)
    if (!root || !scroller) return

    const measureMargin = () => {
      const next =
        root.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop
      setScrollMargin((current) => Math.abs(current - next) < 0.5 ? current : next)
    }
    measureMargin()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measureMargin)
    observer.observe(scroller)
    const scrollContent = scroller.querySelector<HTMLElement>(
      "[data-chat-scroll-content]"
    )
    if (scrollContent) observer.observe(scrollContent)
    return () => observer.disconnect()
  }, [layoutEpoch, virtualizationEnabled])
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer owns an external measurement store by design
  const rowVirtualizer = useVirtualizer({
    count: virtualizationEnabled ? nodes.length : 0,
    enabled: virtualizationEnabled,
    estimateSize: () => WEB_NODE_ESTIMATED_HEIGHT,
    getItemKey: (index) => nodes[index]?.nodeId ?? index,
    getScrollElement: () => scrollElement,
    initialRect: { width: 0, height: 600 },
    overscan: WEB_NODE_VIRTUAL_OVERSCAN,
    scrollMargin,
  })

  if (virtualizationEnabled) {
    return (
      <div ref={rootRef} className="relative text-sm" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((item) => {
          const node = nodes[item.index]
          if (!node) return null
          return (
            <div
              key={item.key}
              ref={rowVirtualizer.measureElement}
              data-index={item.index}
              data-chat-row-key={node.nodeId}
              className="absolute top-0 left-0 w-full pb-3"
              style={{
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <WebNodeItem node={node} context={context} />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="space-y-3 text-sm">
      {nodes.map((node) => (
        <WebNodeItem key={node.nodeId} node={node} context={context} />
      ))}
    </div>
  )
})
