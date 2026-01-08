/**
 * TerminalPanel - 终端管理面板
 * 
 * 显示所有后台运行的终端，支持：
 * - 查看终端列表
 * - 查看终端输出
 * - 向终端发送输入
 * - 关闭终端
 */

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Terminal, X, RefreshCw, Square, ChevronDown, ChevronRight, Send } from 'lucide-react'
import { cn } from '../utils/cn'
import { listPtySessions, deletePtySession, connectPtyWebSocket, resizePtySession } from '../api/services'
import type { PtySession } from '../types'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface TerminalPanelProps {
  serviceUrl: string
  className?: string
  onClose?: () => void
}

export interface TerminalPanelHandle {
  refresh: () => void
  expandLatest: () => void
}

interface TerminalOutput {
  id: string
  ws?: WebSocket
  term?: XTerm
  fit?: FitAddon
}

export const TerminalPanel = forwardRef<TerminalPanelHandle, TerminalPanelProps>(
  function TerminalPanel({ serviceUrl, className, onClose }, ref) {
  const [sessions, setSessions] = useState<PtySession[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedTerminal, setExpandedTerminal] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<Record<string, TerminalOutput>>({})
  const [inputValue, setInputValue] = useState('')
  const terminalsRef = useRef<Record<string, HTMLDivElement | null>>({})

  // 加载终端列表
  const loadSessions = useCallback(async () => {
    if (!serviceUrl) return
    setLoading(true)
    try {
      const data = await listPtySessions(serviceUrl)
      setSessions(data)
      // 自动展开最新的终端
      if (data.length > 0 && !expandedTerminal) {
        setExpandedTerminal(data[0].id)
      }
    } catch (err) {
      console.error('Failed to load PTY sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [serviceUrl, expandedTerminal])
  
  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    refresh: () => {
      loadSessions()
    },
    expandLatest: () => {
      if (sessions.length > 0) {
        setExpandedTerminal(sessions[0].id)
      }
    }
  }), [loadSessions, sessions])

  // 初始加载
  useEffect(() => {
    loadSessions()
    // 定时刷新
    const interval = setInterval(loadSessions, 5000)
    return () => clearInterval(interval)
  }, [loadSessions])

  // 展开终端时连接 WebSocket
  useEffect(() => {
    if (!expandedTerminal || !serviceUrl) return

    // 如果已经有连接，不重复创建
    if (outputs[expandedTerminal]?.ws) return

    const container = terminalsRef.current[expandedTerminal]
    if (!container) return

    const term = new XTerm({
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      cursorBlink: true,
      scrollback: 2000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    // 初次 fit 后同步后端 resize
    const initialCols = term.cols
    const initialRows = term.rows
    resizePtySession(serviceUrl, expandedTerminal, { cols: initialCols, rows: initialRows }).catch(() => {})

    const ws = connectPtyWebSocket(
      serviceUrl,
      expandedTerminal,
      (data) => {
        term.write(data)
      },
      () => {
        setOutputs(prev => {
          const current = prev[expandedTerminal]
          if (current) {
            return {
              ...prev,
              [expandedTerminal]: { ...current, ws: undefined }
            }
          }
          return prev
        })
        try {
          term.writeln('\r\n[disconnected]')
        } catch {}
      }
    )

    // 将 xterm 键盘输入直接转发到后端
    const dataDisposable = term.onData((chunk) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: chunk }))
      }
    })

    // Resize 观察：容器尺寸变化时自动 fit + 通知后端
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        resizePtySession(serviceUrl, expandedTerminal, { cols: term.cols, rows: term.rows }).catch(() => {})
      } catch {}
    })
    ro.observe(container)

    setOutputs(prev => ({
      ...prev,
      [expandedTerminal]: {
        id: expandedTerminal,
        ws,
        term,
        fit,
      }
    }))

    return () => {
      ro.disconnect()
      dataDisposable.dispose()
      ws.close()
      term.dispose()
    }
  }, [expandedTerminal, serviceUrl])

  // 删除终端
  const handleDelete = async (ptyId: string) => {
    if (!confirm('确定要关闭这个终端吗？')) return
    try {
      await deletePtySession(serviceUrl, ptyId)
      // 关闭 WebSocket
      outputs[ptyId]?.ws?.close()
      outputs[ptyId]?.term?.dispose()
      setOutputs(prev => {
        const { [ptyId]: _, ...rest } = prev
        return rest
      })
      if (expandedTerminal === ptyId) {
        setExpandedTerminal(null)
      }
      loadSessions()
    } catch (err) {
      console.error('Failed to delete PTY session:', err)
      alert(`删除失败: ${(err as Error).message}`)
    }
  }

  // 发送输入到终端
  const handleSendInput = () => {
    if (!expandedTerminal || !inputValue) return
    const ws = outputs[expandedTerminal]?.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: inputValue + '\n' }))
      setInputValue('')
    }
  }

  // 发送 Ctrl+C
  const handleSendCtrlC = () => {
    if (!expandedTerminal) return
    const ws = outputs[expandedTerminal]?.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: '\x03' })) // Ctrl+C
    }
  }

  return (
    <div className={cn("flex flex-col h-full bg-background border-l border-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-primary" />
          <span className="font-semibold">终端</span>
          <span className="text-xs text-muted-foreground">({sessions.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSessions}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            disabled={loading}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              title="折叠终端"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            暂无运行中的终端
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map(session => (
              <div key={session.id}>
                {/* Terminal Item Header */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedTerminal(expandedTerminal === session.id ? null : session.id)}
                >
                  {expandedTerminal === session.id ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{session.command}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        session.status === 'Running' ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        {session.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PID: {session.pid || '-'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(session.id) }}
                    className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Terminal Output (Expanded) */}
                {expandedTerminal === session.id && (
                  <div className="border-t border-border bg-black/90">
                    {/* Output */}
                    <div className="h-64 overflow-hidden p-2">
                      <div
                        ref={(el) => {
                          terminalsRef.current[session.id] = el
                        }}
                        className="h-full w-full"
                      />
                    </div>

                    {/* Input */}
                    <div className="flex items-center gap-2 p-2 border-t border-border/50 bg-black/50">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendInput()}
                        placeholder="输入命令..."
                        className="flex-1 bg-transparent border border-border/50 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-primary"
                      />
                      <button
                        onClick={handleSendInput}
                        className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Send className="size-4" />
                      </button>
                      <button
                        onClick={handleSendCtrlC}
                        className="p-1.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                        title="发送 Ctrl+C"
                      >
                        <Square className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
