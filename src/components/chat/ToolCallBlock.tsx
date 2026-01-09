import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Wrench } from 'lucide-react'
import type { ToolCall } from './types'

// MCP 工具调用块组件（可折叠，支持实时日志 / 最终输出）
export default function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(tool.status === 'running')
  const logsEndRef = useRef<HTMLDivElement>(null)

  // 当有新日志时自动滚动到底部
  useEffect(() => {
    if (expanded && tool.status === 'running' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [tool.logs, expanded, tool.status])

  // 当运行时自动展开
  useEffect(() => {
    if (tool.status === 'running' && tool.logs && tool.logs.length > 0) {
      setExpanded(true)
    }
  }, [tool.status, tool.logs])

  const hasArgs = Boolean(tool.arguments && Object.keys(tool.arguments).length > 0)
  const hasContent = (tool.logs && tool.logs.length > 0) || tool.output || hasArgs
  const showProgress = tool.status === 'running' && tool.progress !== undefined && tool.total !== undefined

  return (
    <div className="my-2 bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {tool.status === 'running' ? (
          <RefreshCw className="size-3 animate-spin text-primary" />
        ) : expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Wrench className="size-3" />
        <span className="flex-1 text-left">
          {tool.status === 'running' ? '正在调用' : '已调用'}: <span className="text-foreground">{tool.name}</span>
        </span>
        {showProgress && (
          <span className="text-[10px] text-primary">{Math.round((tool.progress! / tool.total!) * 100)}%</span>
        )}
        {tool.status === 'done' && hasContent && (
          <span className="text-[10px] text-muted-foreground/60">点击{expanded ? '折叠' : '展开'}</span>
        )}
      </button>

      {/* 进度条 */}
      {showProgress && (
        <div className="px-3 pb-2">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(tool.progress! / tool.total!) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 实时日志 / 参数 / 最终输出 */}
      {expanded && hasContent && (
        <div className="px-3 py-2 text-xs font-mono bg-background/50 border-t border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
          {/* arguments */}
          {hasArgs && (
            <div className={(tool.logs && tool.logs.length > 0) || tool.output ? 'mb-2 pb-2 border-b border-border/30' : ''}>
              <div className="text-muted-foreground/70 mb-1">arguments:</div>
              <pre className="whitespace-pre-wrap wrap-break-word text-muted-foreground">{JSON.stringify(tool.arguments, null, 2)}</pre>
            </div>
          )}
          {/* 实时日志 */}
          {tool.logs && tool.logs.length > 0 && (
            <div className={tool.output ? 'mb-2 pb-2 border-b border-border/30' : ''}>
              {tool.logs.map((log, idx) => (
                <div key={idx} className="text-green-400/80">
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
          {/* 最终输出 */}
          {tool.output && <div>{tool.output}</div>}
        </div>
      )}
    </div>
  )
}
