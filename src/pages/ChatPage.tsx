import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Plus, Bot, User, AlertCircle, Settings, RefreshCw, StopCircle, Wrench, Paperclip, Mic } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Server, Service, Session, SessionDetail, SSEEvent, MessageInfo } from '../types'
import { getServers } from '../api/servers'
import { getService, buildServiceUrl, listSessions, getSessionDetail, createSession, execute, subscribeToStream } from '../api/services'

interface ToolCall {
  id: string
  name: string
  status: 'running' | 'done'
  output?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  status?: 'streaming' | 'completed' | 'error'
  toolCalls?: Map<string, ToolCall>
}

export default function ChatPage() {
  const { serverId, serviceId } = useParams<{ serverId: string; serviceId: string }>()
  const navigate = useNavigate()
  
  const [server, setServer] = useState<Server | null>(null)
  const [service, setService] = useState<Service | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSessionSelector, setShowSessionSelector] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const serviceUrlRef = useRef<string>('')
  const currentTaskIdRef = useRef<string | null>(null)

  // 初始化
  useEffect(() => {
    async function init() {
      if (!serverId || !serviceId) {
        setError('参数错误')
        setLoading(false)
        return
      }

      try {
        // 获取 Server 信息
        const servers = getServers()
        const srv = servers.find(s => s.id === serverId)
        if (!srv) {
          setError('服务器不存在')
          setLoading(false)
          return
        }
        setServer(srv)

        // 获取 Service 信息
        const svc = await getService(srv.url, serviceId)
        setService(svc)

        if (svc.status !== 'running') {
          setError('服务未运行')
          setLoading(false)
          return
        }

        // 构建 Service URL
        const svcUrl = buildServiceUrl(srv.url, svc.port)
        serviceUrlRef.current = svcUrl

        // 获取 Sessions
        const { currentSessionId, sessions: sessionList } = await listSessions(svcUrl)
        setSessions(sessionList)

        // 找到当前活跃会话或使用第一个
        const activeSession = sessionList.find(s => s.isActive) || sessionList.find(s => s.id === currentSessionId) || sessionList[0]
        
        if (activeSession) {
          setSession(activeSession)
          
          // 加载会话的历史消息
          try {
            const detail = await getSessionDetail(svcUrl, activeSession.id)
            const historicalMessages: Message[] = detail.messages.map((msg, idx) => ({
              id: `hist-${idx}`,
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
              timestamp: msg.timestamp || Date.now(),
              status: 'completed',
            }))
            setMessages(historicalMessages)
          } catch (e) {
            console.warn('Failed to load session messages:', e)
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Init error:', err)
        setError((err as Error).message)
        setLoading(false)
      }
    }

    init()
  }, [serverId, serviceId])

  // 订阅 SSE
  useEffect(() => {
    if (!session || !serviceUrlRef.current) return

    // 先取消之前的订阅
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
    }

    const unsubscribe = subscribeToStream(
      serviceUrlRef.current,
      session.id,
      handleSSEEvent,
      (err) => console.error('SSE error:', err)
    )
    
    unsubscribeRef.current = unsubscribe

    return () => {
      unsubscribe()
    }
  }, [session])

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    console.log('SSE event:', event)
    
    setMessages(prev => {
      const newMessages = [...prev]
      const lastMsg = newMessages[newMessages.length - 1]
      
      if (!lastMsg || lastMsg.role !== 'assistant') return prev

      const updatedMsg = { ...lastMsg, toolCalls: new Map(lastMsg.toolCalls || []) }
      
      switch (event.type) {
        case 'delta':
        case 'assistant_message_delta':
          updatedMsg.content += (event.content || event.delta || '')
          break

        case 'task_completed':
        case 'assistant_message_completed':
          if (event.content) updatedMsg.content = event.content
          updatedMsg.status = 'completed'
          setSending(false)
          currentTaskIdRef.current = null
          break

        case 'task_failed':
        case 'task_aborted':
          updatedMsg.status = 'error'
          updatedMsg.content += `\n\n[${event.error || '任务失败'}]`
          setSending(false)
          currentTaskIdRef.current = null
          break

        case 'tool_start':
          if (event.call_id && event.tool) {
            updatedMsg.toolCalls.set(event.call_id, { 
              id: event.call_id, 
              name: event.tool, 
              status: 'running' 
            })
          }
          break

        case 'tool_complete':
          if (event.call_id) {
            const tool = updatedMsg.toolCalls.get(event.call_id)
            if (tool) {
              updatedMsg.toolCalls.set(event.call_id, { 
                ...tool, 
                status: 'done', 
                output: event.output 
              })
            }
          }
          break
      }
      
      newMessages[newMessages.length - 1] = updatedMsg
      return newMessages
    })
  }, [])

  async function handleCreateSession() {
    if (!serviceUrlRef.current || !service) return

    try {
      const newSession = await createSession(serviceUrlRef.current, {
        working_dir: service.workingDir,
      })
      setSessions([...sessions, newSession])
      setSession(newSession)
      setMessages([])
      setShowSessionSelector(false)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !session || !serviceUrlRef.current || sending) return

    const currentPrompt = input
    setInput('')
    setSending(true)

    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now(),
    }

    // 添加助手消息占位
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      toolCalls: new Map(),
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])

    try {
      const result = await execute(serviceUrlRef.current, {
        prompt: currentPrompt,
      })
      currentTaskIdRef.current = result.task_id
    } catch (err) {
      console.error('Execute error:', err)
      setSending(false)
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === 'assistant') {
          last.status = 'error'
          last.content = `发送失败: ${(err as Error).message}`
        }
        return newMessages
      })
    }
  }

  async function handleCancel() {
    // TODO: 实现取消逻辑
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="bg-muted/30 p-4 rounded-full">
          <AlertCircle className="size-8 text-destructive" />
        </div>
        <p className="text-lg text-foreground">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="text-primary hover:underline"
        >
          返回首页
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 hover:bg-muted/50 rounded-full transition-colors -ml-2"
          >
            <ArrowLeft className="size-5 text-foreground/70" />
          </button>
          <div className="flex flex-col">
            <h1 className="font-medium text-base text-foreground">{service?.name}</h1>
            <span className="text-xs text-muted-foreground">{server?.name} • 端口 {service?.port}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Session 选择器 */}
          <div className="relative">
            <button
              onClick={() => setShowSessionSelector(!showSessionSelector)}
              className="p-2 hover:bg-muted/50 rounded-full transition-colors"
              title="会话管理"
            >
              <Settings className="size-5 text-foreground/70" />
            </button>
            
            {showSessionSelector && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-card rounded-lg border border-border shadow-lg z-10">
                <div className="p-2 border-b border-border">
                  <button
                    onClick={handleCreateSession}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    <Plus className="size-4" />
                    新建会话
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto p-2">
                  {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">暂无会话</p>
                  ) : (
                    sessions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSession(s)
                          setMessages([])
                          setShowSessionSelector(false)
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm",
                          session?.id === s.id ? "bg-primary/10" : ""
                        )}
                      >
                        <div className="font-medium truncate">{s.id.slice(0, 12)}...</div>
                        <div className="text-xs text-muted-foreground">{s.workingDir}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
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
            <p className="text-sm">开始与 {service?.name} 对话</p>
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
                  {/* Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.size > 0 && (
                    <div className="mb-3 space-y-2">
                      {Array.from(msg.toolCalls.values()).map((tool) => (
                        <div key={tool.id} className="bg-muted/50 rounded-lg border border-border/50 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                            {tool.status === 'running' ? <RefreshCw className="size-3 animate-spin" /> : <Wrench className="size-3" />}
                            <span>调用工具: {tool.name}</span>
                          </div>
                          {tool.output && (
                            <div className="px-3 py-2 text-xs font-mono bg-background/50 border-t border-border/30 max-h-32 overflow-y-auto whitespace-pre-wrap">
                              {tool.output}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content || (msg.status === 'streaming' && <span className="animate-pulse">...</span>)}
                  </div>
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
            <form onSubmit={handleSubmit} className="relative bg-background rounded-[24px] border border-primary/20 shadow-sm transition-all duration-200">
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
                className="w-full min-h-[52px] max-h-[200px] bg-transparent border-none px-5 py-4 text-sm resize-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/40"
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
