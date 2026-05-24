import * as React from "react"
import MarkdownIt from "markdown-it"

import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  getPaneBlocks,
  type AgentPaneState,
  type ThinkBlock,
  type ToolCallStatus,
  type ToolCallView,
} from "@/features/chat/chat-pane-state"
import { cn } from "@/lib/utils"
import { BrainCircuitIcon, ChevronDownIcon, WrenchIcon } from "lucide-react"

const markdownIt = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

const MARKDOWN_BASE_CLASS =
  "whitespace-normal wrap-anywhere [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1 [&_li]:leading-6 [&_pre]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/5 [&_pre]:px-3 [&_pre]:py-2 [&_pre]:text-xs [&_pre]:leading-6 [&_code]:vertical-middle [&_code]:inline-block [&_code]:rounded-sm [&_code]:border [&_code]:border-black/12 [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:text-inherit [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/15 [&_blockquote]:pl-3 [&_blockquote]:opacity-80 [&_a]:underline [&_a]:underline-offset-3"

const THINK_MARKDOWN_CLASS =
  "space-y-4 [&_li>ol]:mt-1 [&_li>ol]:gap-1 [&_li>ul]:mt-1 [&_li>ul]:gap-1 [&_ol]:ml-2 [&_ol]:gap-2 [&_ul]:ml-2 [&_ul]:gap-2"

function toolStatusLabel(status: ToolCallStatus) {
  switch (status) {
    case "pending":
      return "等待中"
    case "running":
      return "执行中"
    case "completed":
      return "已完成"
    default:
      return status
  }
}

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

function ThinkBlockView({ block }: { block: ThinkBlock }) {
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
            <span>Thinking</span>
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
}

function ToolCallCard({ tool }: { tool: ToolCallView }) {
  const isRunning = tool.status === "running"
  const [open, setOpen] = React.useState(isRunning)
  const prevStatusRef = React.useRef<ToolCallStatus>(tool.status)

  React.useEffect(() => {
    const prevStatus = prevStatusRef.current

    if (isRunning) {
      setOpen(true)
    } else if (prevStatus === "running" && tool.status === "completed") {
      setOpen(false)
    }

    prevStatusRef.current = tool.status
  }, [isRunning, tool.status])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (isRunning && !nextOpen) {
        return
      }

      setOpen(nextOpen)
    },
    [isRunning]
  )

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className="flex flex-col">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 text-left text-[13px] text-foreground/62 select-none transition-colors hover:text-foreground/80"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <WrenchIcon className="size-3.5 flex-none" />
            <span className="truncate">{tool.name}</span>
          </span>

          <span className="ml-auto inline-flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="h-5 shrink-0 rounded-full border-black/10 bg-transparent px-1.5 text-[10px] text-foreground/65"
            >
              {toolStatusLabel(tool.status)}
            </Badge>
            <ChevronDownIcon className="size-3.5 flex-none -rotate-90 transition-transform group-data-[state=open]:rotate-0" />
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="animated-collapsible-content relative ml-[6.5px] border-l-[0.5px] border-border/50 pt-2 pl-3.5 text-xs text-foreground/65">
        {tool.input.trim() ? (
          <div className="space-y-1">
            <p className="text-[10px] font-medium tracking-wide opacity-55">Input</p>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5">
              {tool.input}
            </pre>
          </div>
        ) : null}

        {tool.output.trim() ? (
          <div className={cn("space-y-1", tool.input.trim() ? "mt-2" : "")}>
            <p className="text-[10px] font-medium tracking-wide opacity-55">Output</p>
            <pre className="overflow-x-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5">
              {tool.output}
            </pre>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function AgentPane({ pane }: { pane: AgentPaneState }) {
  const blocks = getPaneBlocks(pane)

  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block) => {
        if (block.type === "text") {
          return (
            <div key={block.id} className="text-[15px] leading-8 text-foreground">
              <MarkdownContent
                content={block.content}
                className={cn(MARKDOWN_BASE_CLASS, "text-[15px] leading-8")}
              />
            </div>
          )
        }

        if (block.type === "think") {
          return <ThinkBlockView key={block.id} block={block} />
        }

        if (block.type === "update") {
          return (
            <p key={block.id} className="text-sm leading-7 text-foreground/72">
              {block.content}
            </p>
          )
        }

        const tool = pane.tools[block.toolId]
        if (!tool) {
          return null
        }

        return <ToolCallCard key={block.id} tool={tool} />
      })}
    </div>
  )
}
