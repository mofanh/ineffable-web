import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, Bot, AlertCircle, RefreshCw, StopCircle, Wrench, Paperclip, Mic, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Server, Service, Session, SessionDetail as SessionDetailType, SSEEvent, MessageInfo } from '../types'
import { getSessionDetail, createSession, executeStream, cancelTask, listSessions } from '../api/services'
import MarkdownRenderer from './MarkdownRenderer'
import '../styles/markdown.css'

interface ToolCall {
  id: string
  name: string
  status: 'running' | 'done'
  output?: string
  logs?: string[]  // 实时输出日志
  progress?: number
  total?: number
}

// 内容片段：可以是文本或工具调用
interface ContentSegment {
  type: 'text' | 'tool'
  content?: string
  tool?: ToolCall
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string  // 保留用于兼容
  timestamp: number
  status?: 'streaming' | 'completed' | 'error'
  segments: ContentSegment[]  // 按顺序的内容片段
  pendingToolCalls: Map<string, ToolCall>  // 正在等待的工具调用
}

interface Props {
  server: Server | null
  service: Service | null
  session: Session | null
  serviceUrl: string
  onSessionChange?: (session: Session) => void
  onSessionsRefresh?: () => void
}

// 工具调用块组件（可折叠，支持实时日志）
function ToolCallBlock({ tool }: { tool: ToolCall }) {
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
  
  const hasContent = (tool.logs && tool.logs.length > 0) || tool.output
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
          <span className="text-[10px] text-primary">
            {Math.round((tool.progress! / tool.total!) * 100)}%
          </span>
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
      
      {/* 实时日志和最终输出 */}
      {expanded && hasContent && (
        <div className="px-3 py-2 text-xs font-mono bg-background/50 border-t border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
          {/* 实时日志 */}
          {tool.logs && tool.logs.length > 0 && (
            <div className={tool.output ? 'mb-2 pb-2 border-b border-border/30' : ''}>
              {tool.logs.map((log, idx) => (
                <div key={idx} className="text-green-400/80">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
          {/* 最终输出 */}
          {tool.output && (
            <div>{tool.output}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChatPanel({ server, service, session, serviceUrl, onSessionChange, onSessionsRefresh }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  // 当 session 改变时加载历史消息
  useEffect(() => {
    if (!session || !serviceUrl) {
      setMessages([])
      return
    }

    async function loadMessages() {
      setLoading(true)
      try {
        const detail = await getSessionDetail(serviceUrl, session!.id)
        const historicalMessages: Message[] = detail.messages.map((msg, idx) => ({
          id: `hist-${idx}`,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
          status: 'completed',
          segments: [{ type: 'text', content: msg.content }],
          pendingToolCalls: new Map(),
        }))
        setMessages(historicalMessages)
      } catch (e) {
        console.warn('Failed to load session messages:', e)
        setMessages([])
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [session?.id, serviceUrl])

  // 取消正在进行的请求（当 session 改变或组件卸载时）
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [session?.id])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 刷新会话列表（用于获取自动生成的标题）
  const refreshSessions = useCallback(async () => {
    onSessionsRefresh?.()
  }, [onSessionsRefresh])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    console.log('SSE event:', event)
    
    setMessages(prev => {
      const newMessages = [...prev]
      const lastMsg = newMessages[newMessages.length - 1]
      
      if (!lastMsg || lastMsg.role !== 'assistant') return prev

      const updatedMsg = { 
        ...lastMsg, 
        segments: [...lastMsg.segments],
        pendingToolCalls: new Map(lastMsg.pendingToolCalls)
      }
      
      switch (event.type) {
        case 'delta':
        case 'assistant_message_delta': {
          const delta = event.content || event.delta || ''
          updatedMsg.content += delta
          
          // 更新最后一个文本片段，或添加新的文本片段
          const lastSegment = updatedMsg.segments[updatedMsg.segments.length - 1]
          if (lastSegment && lastSegment.type === 'text') {
            lastSegment.content = (lastSegment.content || '') + delta
          } else {
            updatedMsg.segments.push({ type: 'text', content: delta })
          }
          break
        }

        case 'task_completed':
        case 'assistant_message_completed':
          if (event.content) updatedMsg.content = event.content
          updatedMsg.status = 'completed'
          setSending(false)
          currentTaskIdRef.current = null
          // 延迟刷新会话列表，等待后端异步生成标题
          setTimeout(() => refreshSessions(), 1500)
          break

        case 'task_failed':
        case 'task_aborted':
          updatedMsg.status = 'error'
          updatedMsg.content += `\n\n[${event.error || event.reason || '任务失败'}]`
          // 添加错误信息到最后一个文本片段
          const lastSeg = updatedMsg.segments[updatedMsg.segments.length - 1]
          if (lastSeg && lastSeg.type === 'text') {
            lastSeg.content = (lastSeg.content || '') + `\n\n[${event.error || event.reason || '任务失败'}]`
          } else {
            updatedMsg.segments.push({ type: 'text', content: `\n\n[${event.error || event.reason || '任务失败'}]` })
          }
          setSending(false)
          currentTaskIdRef.current = null
          break

        case 'tool_start':
          if (event.call_id && event.tool) {
            const toolCall: ToolCall = { 
              id: event.call_id, 
              name: event.tool, 
              status: 'running' 
            }
            // 添加工具调用片段到内容中
            updatedMsg.segments.push({ type: 'tool', tool: toolCall })
            updatedMsg.pendingToolCalls.set(event.call_id, toolCall)
          }
          break

        case 'tool_complete':
          if (event.call_id) {
            const tool = updatedMsg.pendingToolCalls.get(event.call_id)
            if (tool) {
              const completedTool = { 
                ...tool, 
                status: 'done' as const, 
                output: event.output 
              }
              // 更新 segments 中对应的工具调用
              for (const segment of updatedMsg.segments) {
                if (segment.type === 'tool' && segment.tool?.id === event.call_id) {
                  segment.tool = completedTool
                  break
                }
              }
              updatedMsg.pendingToolCalls.delete(event.call_id)
            }
          }
          break

        case 'tool_call_progress':
          // 处理工具调用的实时进度/日志
          if (event.call_id) {
            const tool = updatedMsg.pendingToolCalls.get(event.call_id)
            if (tool) {
              const updatedTool = { ...tool }
              
              if (event.progress_type === 'log' || event.progress_type === 'output') {
                // 添加日志
                if (event.message) {
                  updatedTool.logs = [...(tool.logs || []), event.message]
                }
              } else if (event.progress_type === 'progress') {
                // 更新进度
                updatedTool.progress = event.progress
                updatedTool.total = event.total
              }
              
              // 更新 pendingToolCalls
              updatedMsg.pendingToolCalls.set(event.call_id, updatedTool)
              
              // 更新 segments 中对应的工具调用
              for (const segment of updatedMsg.segments) {
                if (segment.type === 'tool' && segment.tool?.id === event.call_id) {
                  segment.tool = updatedTool
                  break
                }
              }
            }
          }
          break
          
        case 'warning':
          console.warn('Server warning:', event.message)
          break
      }
      
      newMessages[newMessages.length - 1] = updatedMsg
      return newMessages
    })
  }, [refreshSessions])

  async function handleCreateSession() {
    if (!serviceUrl) return

    try {
      const newSession = await createSession(serviceUrl)
      setMessages([])
      onSessionChange?.(newSession)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !session || !serviceUrl || sending) return

    const currentPrompt = input
    setInput('')
    setSending(true)

    // 创建 AbortController 用于取消
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now(),
      segments: [{ type: 'text', content: currentPrompt }],
      pendingToolCalls: new Map(),
    }

    // 添加助手消息占位
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      segments: [],
      pendingToolCalls: new Map(),
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])

    try {
      // 使用流式执行
      await executeStream(
        serviceUrl,
        { prompt: currentPrompt },
        handleSSEEvent,
        abortController.signal
      )
    } catch (err) {
      // 检查是否是用户主动取消
      if ((err as Error).name === 'AbortError') {
        console.log('Request cancelled by user')
        return
      }
      
      console.error('Execute error:', err)
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === 'assistant') {
          last.status = 'error'
          last.content = `发送失败: ${(err as Error).message}`
        }
        return newMessages
      })
    } finally {
      setSending(false)
      abortControllerRef.current = null
      currentTaskIdRef.current = null
    }
  }

  async function handleCancel() {
    // 取消当前请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // 同时调用服务端取消 API
    if (serviceUrl) {
      try {
        await cancelTask(serviceUrl)
      } catch (e) {
        console.warn('Failed to cancel task on server:', e)
      }
    }
    
    setSending(false)
    setMessages(prev => {
      const newMessages = [...prev]
      const last = newMessages[newMessages.length - 1]
      if (last && last.role === 'assistant') {
        last.status = 'error'
        last.content += '\n\n[已取消]'
      }
      return newMessages
    })
  }

  // 未选择服务或会话时的空状态
  if (!server || !service) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-background">
        <div className="bg-muted/30 p-6 rounded-full mb-4">
          <MessageSquare className="size-12 opacity-50" />
        </div>
        <h2 className="text-lg font-medium text-foreground/70 mb-2">开始对话</h2>
        <p className="text-sm text-center max-w-xs">
          从左侧选择一个服务和会话，或创建新会话开始对话
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 flex items-center justify-center z-10">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-medium text-base text-foreground">
            {session?.name || (session ? `会话 ${session.id.slice(0, 8)}` : service.name)}
          </h1>
          <span className="text-xs text-muted-foreground">
            {service.name} • {server.name}
          </span>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {!session ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <Bot className="size-8" />
            </div>
            <p className="text-sm mb-4">请先创建一个会话</p>
            <button
              onClick={handleCreateSession}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" />
              创建会话
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <Bot className="size-8" />
            </div>
            <p className="text-sm">开始与 {service.name} 对话</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 max-w-3xl mx-auto", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "flex-1 max-w-[85%]",
                msg.role === 'user' ? "flex justify-end" : ""
              )}>
                <div className={cn(
                  "px-0 py-2 text-sm leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-primary/10 text-foreground px-4 py-3 rounded-2xl rounded-tr-sm" 
                    : msg.role === 'system'
                    ? "bg-destructive/10 text-destructive px-4 py-3 rounded-2xl"
                    : "text-foreground"
                )}>
                  {/* 按顺序渲染内容片段 */}
                  {msg.role === 'user' ? (
                    // 用户消息：简单文本
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                  ) : msg.segments.length === 0 && msg.status === 'streaming' ? (
                    // 正在等待响应
                    <span className="animate-pulse text-muted-foreground">思考中...</span>
                  ) : (
                    // 助手消息：按片段渲染
                    msg.segments.map((segment, idx) => (
                      segment.type === 'text' ? (
                        // 文本片段：使用 Markdown 渲染
                        <MarkdownRenderer 
                          key={`text-${idx}`} 
                          content={segment.content || ''} 
                        />
                      ) : segment.type === 'tool' && segment.tool ? (
                        // 工具调用片段
                        <ToolCallBlock key={`tool-${segment.tool.id}`} tool={segment.tool} />
                      ) : null
                    ))
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      {session && (
        <footer className="flex-none p-4 bg-background">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative bg-background rounded-3xl border border-primary/20 shadow-sm transition-all duration-200">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="开始吧..."
                className="w-full min-h-13 max-h-50 bg-transparent border-none px-5 py-4 text-sm resize-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/40"
                rows={1}
                disabled={sending}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <button type="button" className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-full transition-colors">
                    <Paperclip className="size-5" />
                  </button>
                  <button type="button" className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-full transition-colors">
                    <Mic className="size-5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {sending && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                      title="取消"
                    >
                      <StopCircle className="size-5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className={cn(
                      "p-2 rounded-full transition-all duration-200",
                      input.trim() && !sending
                        ? "bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90"
                        : "bg-transparent text-muted-foreground/30 cursor-not-allowed"
                    )}
                  >
                    <Send className="size-5" />
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-3">
              <p className="text-[11px] text-muted-foreground/40">
                Ineffable © 2024. Built with lazy by LBJ.
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
