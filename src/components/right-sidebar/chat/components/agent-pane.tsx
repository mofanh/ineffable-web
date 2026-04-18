import * as React from "react"

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
} from "@/components/right-sidebar/chat/chat-pane-state"
import { cn } from "@/lib/utils"
import { BrainCircuitIcon, ChevronDownIcon, WrenchIcon } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="leading-6 not-first:mt-2">{children}</p>,
        ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ className, children }) => {
          if (!className) {
            return <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{children}</code>
          }

          return (
            <code className="block overflow-x-auto rounded-md bg-black/5 px-3 py-2 text-xs leading-6">
              {children}
            </code>
          )
        },
        pre: ({ children }) => <pre className="mt-2">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="mt-2 border-l-2 border-current/15 pl-3 opacity-80">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function ThinkBlockView({ block }: { block: ThinkBlock }) {
  const [open, setOpen] = React.useState(block.open)

  React.useEffect(() => {
    setOpen(block.open)
  }, [block.open])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-black/10 bg-black/2.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
              <BrainCircuitIcon className="size-3.5 opacity-55" />
              {block.open ? "Thinking" : "Thought process"}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 opacity-45 transition-transform",
                open ? "rotate-180" : ""
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-black/10 px-3 py-2.5 text-xs leading-6 whitespace-pre-wrap wrap-break-word text-foreground/75">
            {block.content}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function ToolCallCard({ tool }: { tool: ToolCallView }) {
  return (
    <Collapsible>
      <div className="rounded-xl border border-black/10 bg-black/2.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-black/10 bg-background/60">
                <WrenchIcon className="size-3 opacity-60" />
              </div>
              <p className="truncate text-xs font-medium text-foreground/75">{tool.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="h-5 shrink-0 rounded-full border-black/10 bg-transparent px-1.5 text-[10px] text-foreground/65"
              >
                {toolStatusLabel(tool.status)}
              </Badge>
              <ChevronDownIcon className="size-3.5 opacity-45" />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-black/10 px-3 py-2">
            {tool.input.trim() ? (
              <div className="space-y-1">
                <p className="text-[10px] font-medium tracking-wide opacity-45">Input</p>
                <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5 text-foreground/75">
                  {tool.input}
                </pre>
              </div>
            ) : null}

            {tool.output.trim() ? (
              <div className={cn("space-y-1", tool.input.trim() ? "mt-2" : "")}>
                <p className="text-[10px] font-medium tracking-wide opacity-45">Output</p>
                <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-background/50 px-2.5 py-1.5 text-[11px] leading-5 text-foreground/75">
                  {tool.output}
                </pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function AgentPane({ pane }: { pane: AgentPaneState }) {
  const blocks = getPaneBlocks(pane)

  return (
    <div className="space-y-3 text-sm wrap-break-word">
      {blocks.map((block) => {
        if (block.type === "text") {
          return (
            <div key={block.id} className="text-[15px] leading-8 text-foreground">
              <MarkdownContent content={block.content} />
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
