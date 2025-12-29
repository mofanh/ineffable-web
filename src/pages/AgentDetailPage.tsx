import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Bot, Send, RefreshCw, Terminal, Activity, FileText, ArrowLeft, Settings, Trash2, Play, Pause, Wrench, StopCircle, User, Paperclip, Mic, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { cn } from '../utils/cn'
import { getAgent, executeOnAgentStream, cancelAgentTask, deleteAgent, RegisteredAgent, SSEEvent } from '../api'
import { useTheme } from '../hooks/useTheme'
import type { Agent, AgentStatus } from '../components/AgentCard'

type EventRecord = SSEEvent & {
  id?: string
  timestamp?: number
}

interface ToolCall {
  id: string
  name: string
  status: 'running' | 'done'
  output?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  status?: 'streaming' | 'completed' | 'error'
  toolCalls?: Map<string, ToolCall>
}

// 将后端 RegisteredAgent 转换为前端 Agent 格式
function toAgent(ra: RegisteredAgent): Agent {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ra.last_activity
  let lastActivity = '未知'
  if (diff < 60) lastActivity = '刚刚'
  else if (diff < 3600) lastActivity = `${Math.floor(diff / 60)}分钟前`
  else if (diff < 86400) lastActivity = `${Math.floor(diff / 3600)}小时前`
  else lastActivity = `${Math.floor(diff / 86400)}天前`

  return {
    id: ra.id,
    name: ra.name,
    description: ra.description,
    status: ra.status as AgentStatus,
    currentTask: ra.current_task,
    taskCount: ra.task_count,
    lastActivity,
  }
}

const statusConfig: Record<AgentStatus, { label: string; color: string; bgColor: string }> = {
  idle: { label: '空闲', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  running: { label: '运行中', color: 'text-success', bgColor: 'bg-success/10' },
  completed: { label: '已完成', color: 'text-primary', bgColor: 'bg-primary/10' },
  error: { label: '错误', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  paused: { label: '已暂停', color: 'text-warning', bgColor: 'bg-warning/10' },
  offline: { label: '离线', color: 'text-muted-foreground', bgColor: 'bg-muted' },
}

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  
  const [agent, setAgent] = useState<Agent | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const cancelRef = useRef<(() => void) | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载智能体数据
  useEffect(() => {
    // 切换智能体时重置状态
    setMessages([])
    setAgent(null)
    setNotFound(false)
    setInput('')
    setLoading(false)
    if (cancelRef.current) {
      cancelRef.current()
      cancelRef.current = null
    }

    async function loadAgent() {
      if (!agentId) {
        setNotFound(true)
        return
      }
      
      if (agentId === 'local') {
        setAgent({
          id: 'local',
          name: '本地智能体',
          description: '当前运行的智能体（非 Hub 模式）',
          status: 'idle',
          taskCount: 0,
          lastActivity: '刚刚',
        })
        return
      }
      
      const data = await getAgent(agentId)
      if (data) {
        setAgent(toAgent(data))
      } else {
        setNotFound(true)
      }
    }
    
    loadAgent()
  }, [agentId])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // SSE 事件处理
  const handleEvent = useCallback((evt: SSEEvent) => {
    setMessages(prev => {
      const newMessages = [...prev]
      const lastMsg = newMessages[newMessages.length - 1]
      
      if (!lastMsg || lastMsg.role !== 'assistant') return prev

      const updatedMsg = { ...lastMsg }
      
      switch (evt.type) {
        case 'delta':
          if (evt.content) {
            updatedMsg.content += evt.content
          }
          break
        case 'task_started':
          // 可以在这里更新状态，但主要逻辑在 handleSubmit
          break
        case 'task_completed':
          updatedMsg.status = 'completed'
          setAgent(prev => prev ? { ...prev, status: 'idle', taskCount: (prev.taskCount || 0) + 1 } : null)
          break
        case 'task_aborted':
          updatedMsg.status = 'error'
          updatedMsg.content += '\n\n[任务已取消]'
          setAgent(prev => prev ? { ...prev, status: 'idle' } : null)
          break
        case 'tool_start':
          if (evt.call_id && evt.tool) {
            const tools = new Map(updatedMsg.toolCalls || [])
            tools.set(evt.call_id, { id: evt.call_id, name: evt.tool, status: 'running' })
            updatedMsg.toolCalls = tools
          }
          break
        case 'tool_complete':
          if (evt.call_id) {
            const tools = new Map(updatedMsg.toolCalls || [])
            const tool = tools.get(evt.call_id)
            if (tool) {
              tools.set(evt.call_id, { ...tool, status: 'done', output: evt.output })
              updatedMsg.toolCalls = tools
            }
          }
          break
        // 兼容旧事件
        case 'assistant_message_delta':
          if (evt.delta) updatedMsg.content += evt.delta
          break
        case 'assistant_message_completed':
          if (evt.content) updatedMsg.content = evt.content
          updatedMsg.status = 'completed'
          break
      }
      
      newMessages[newMessages.length - 1] = updatedMsg
      return newMessages
    })
  }, [])

  // 清理取消函数
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current()
      }
    }
  }, [])

  // 智能体不存在
  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="size-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">智能体不存在</h2>
          <button onClick={() => navigate('/')} className="text-primary hover:underline">返回首页</button>
        </div>
      </div>
    )
  }

  // 加载中
  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const config = statusConfig[agent.status]

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!agent || !input.trim() || loading) return
    
    if (cancelRef.current) cancelRef.current()
    
    const currentPrompt = input
    setInput('')
    setLoading(true)
    
    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now()
    }
    
    // 添加助手消息占位
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      toolCalls: new Map()
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setAgent(prev => prev ? { ...prev, status: 'running' } : null)
    
    cancelRef.current = executeOnAgentStream(
      agent.id,
      currentPrompt,
      handleEvent,
      (error) => {
        console.error('Stream error:', error)
        setMessages(prev => {
          const newMessages = [...prev]
          const last = newMessages[newMessages.length - 1]
          if (last && last.role === 'assistant') {
            last.status = 'error'
            last.content += `\n\n[错误: ${error}]`
          }
          return newMessages
        })
        setAgent(prev => prev ? { ...prev, status: 'error' } : null)
        setLoading(false)
      },
      () => {
        setLoading(false)
        cancelRef.current = null
      }
    )
  }

  async function handleCancel() {
    if (!agent || !loading) return
    try {
      if (cancelRef.current) {
        cancelRef.current()
        cancelRef.current = null
      }
      await cancelAgentTask(agent.id)
      setAgent(prev => prev ? { ...prev, status: 'idle' } : null)
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === 'assistant') {
          last.status = 'error'
          last.content += '\n\n[已取消]'
        }
        return newMessages
      })
    } catch (error) {
      console.error('Failed to cancel task:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!agent || agent.id === 'local') return
    if (!window.confirm(`确定要删除智能体「${agent.name}」吗？`)) return
    try {
      await deleteAgent(agent.id)
      navigate('/')
    } catch (error) {
      alert('删除失败')
    }
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none h-16 border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ArrowLeft className="size-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', config.bgColor)}>
              <Bot className={cn('size-5', config.color)} />
            </div>
            <div>
              <h1 className="font-semibold text-sm">{agent.name}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', config.color.replace('text-', 'bg-'))} />
                {config.label}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} disabled={agent.id === 'local'} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors">
            <Trash2 className="size-5" />
          </button>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Settings className="size-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <Bot className="size-12 mb-4" />
            <p>开始与 {agent.name} 对话...</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 max-w-3xl mx-auto", msg.role === 'user' ? "justify-end" : "justify-start")}>
              {msg.role === 'assistant' && (
                <div className="flex-none size-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                  <Bot className="size-5 text-primary" />
                </div>
              )}
              
              <div className={cn(
                "flex-1 max-w-[80%]",
                msg.role === 'user' ? "flex justify-end" : ""
              )}>
                <div className={cn(
                  "rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm",
                  msg.role === 'user' 
                    ? "bg-primary text-primary-foreground rounded-tr-sm" 
                    : "bg-card border border-border/50 rounded-tl-sm"
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

              {msg.role === 'user' && (
                <div className="flex-none size-8 rounded-full bg-muted flex items-center justify-center mt-1">
                  <User className="size-5 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="flex-none p-4 bg-background/80 backdrop-blur-sm border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative bg-muted/30 rounded-2xl border border-border/50 focus-within:border-primary/60 focus-within:bg-background focus-within:shadow-sm transition-all duration-200">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="输入消息..."
              className="w-full min-h-[60px] max-h-[200px] bg-transparent border-none px-4 py-3 text-sm resize-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/50"
              rows={1}
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <button type="button" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                  <Paperclip className="size-4" />
                </button>
                <button type="button" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                  <Mic className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {loading && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="取消"
                  >
                    <StopCircle className="size-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className={cn(
                    "p-2 rounded-lg transition-all duration-200",
                    input.trim() && !loading
                      ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/50">
              AI 生成的内容可能不准确，请核实重要信息。
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
