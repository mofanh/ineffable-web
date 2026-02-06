import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Wrench } from 'lucide-react'
import type { ToolCall } from './types'

// MCP 工具调用块组件（可折叠，支持实时日志 / 最终输出）
export default function ToolCallBlock({
  tool,
  onApprove,
  onDeny,
}: {
  tool: ToolCall
  onApprove?: (callId: string, remember?: 'session' | 'always' | null) => void
  onDeny?: (callId: string) => void
}) {
  const [expanded, setExpanded] = useState(tool.status === 'running' || tool.status === 'awaiting')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // 懒加载：默认只渲染一部分 tool.output，滚动到底部再追加
  const OUTPUT_CHUNK_SIZE = 4000
  const OUTPUT_MAX_INITIAL = 4000
  const [outputLimit, setOutputLimit] = useState(OUTPUT_MAX_INITIAL)

  // 当有新日志时自动滚动到底部
  useEffect(() => {
    if (expanded && tool.status === 'running' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [tool.logs, expanded, tool.status])

  // 当运行时自动展开
  useEffect(() => {
    if ((tool.status === 'running' || tool.status === 'awaiting') && tool.logs && tool.logs.length > 0) {
      setExpanded(true)
    }
  }, [tool.status, tool.logs])

  // tool 切换/输出变化时重置懒加载窗口
  useEffect(() => {
    setOutputLimit(OUTPUT_MAX_INITIAL)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.id])

  const fullOutput = tool.output || ''
  const isOutputTruncated = fullOutput.length > outputLimit
  const renderedOutput = useMemo(() => {
    if (!fullOutput) return ''
    return fullOutput.slice(0, Math.min(outputLimit, fullOutput.length))
  }, [fullOutput, outputLimit])

  const maybeLoadMore = useCallback(() => {
    if (!isOutputTruncated) return
    const el = scrollAreaRef.current
    if (!el) return

    // 当接近底部时加载更多（阈值 24px）
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
    if (!nearBottom) return

    setOutputLimit(prev => prev + OUTPUT_CHUNK_SIZE)
  }, [isOutputTruncated])

  const onScrollArea = useCallback(() => {
    // 仅在展开并且有截断时检查
    if (!expanded) return
    maybeLoadMore()
  }, [expanded, maybeLoadMore])

  const hasArgs = Boolean(tool.arguments && Object.keys(tool.arguments).length > 0)
  const hasContent = (tool.logs && tool.logs.length > 0) || tool.output || hasArgs
  const showProgress = tool.status === 'running' && tool.progress !== undefined && tool.total !== undefined
  const isCompleted = tool.status === 'completed' || tool.status === 'done'
  const isDenied = tool.status === 'denied'
  const isFailed = tool.status === 'failed'

  const statusText =
    tool.status === 'awaiting'
      ? '等待审批'
      : tool.status === 'pending'
        ? '等待执行'
        : tool.status === 'running'
          ? '正在调用'
          : isDenied
            ? '已拒绝'
            : isFailed
              ? '执行失败'
              : '已调用'

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
          {statusText}: <span className="text-foreground">{tool.displayName || tool.name}</span>
        </span>
        {showProgress && (
          <span className="text-[10px] text-primary">{Math.round((tool.progress! / tool.total!) * 100)}%</span>
        )}
        {isCompleted && hasContent && (
          <span className="text-[10px] text-muted-foreground/60">点击{expanded ? '折叠' : '展开'}</span>
        )}
      </button>

      {tool.status === 'awaiting' && (
        <div className="px-3 pb-3 text-xs text-muted-foreground">
          <div className="mt-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-foreground">需要审批</span>
              {tool.riskLevel && (
                <span
                  className={
                    tool.riskLevel === 'high'
                      ? 'text-destructive'
                      : tool.riskLevel === 'medium'
                        ? 'text-yellow-500'
                        : 'text-green-600'
                  }
                >
                  {tool.riskLevel.toUpperCase()}
                </span>
              )}
            </div>
            {tool.description && <div className="mt-1 text-muted-foreground/80">{tool.description}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-[11px]"
                onClick={() => onApprove?.(tool.id)}
              >
                允许一次
              </button>
              <button
                className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px]"
                onClick={() => onApprove?.(tool.id, 'session')}
              >
                本会话允许
              </button>
              <button
                className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[11px]"
                onClick={() => onApprove?.(tool.id, 'always')}
              >
                总是允许
              </button>
              <button
                className="px-2 py-1 rounded-md bg-destructive/10 text-destructive text-[11px]"
                onClick={() => onDeny?.(tool.id)}
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div
          ref={scrollAreaRef}
          onScroll={onScrollArea}
          className="px-3 py-2 text-xs font-mono bg-background/50 border-t border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground"
        >
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
          {tool.output && (
            <div>
              <pre className="whitespace-pre-wrap wrap-break-word text-muted-foreground">{renderedOutput}</pre>
              {isOutputTruncated && (
                <div className="mt-2 text-[10px] text-muted-foreground/70">
                  输出较长，继续下滑加载更多…
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
