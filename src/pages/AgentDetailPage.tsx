import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Bot, Send, RefreshCw, Terminal, Activity, FileText, ArrowLeft, Settings, Trash2, Play, Pause, Wrench } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { cn } from '../utils/cn'
import { getAgent, executeOnAgentStream, RegisteredAgent, SSEEvent } from '../api'
import { useTheme } from '../hooks/useTheme'
import type { Agent, AgentStatus } from '../components/AgentCard'

type EventRecord = SSEEvent & {
  id?: string
  timestamp?: number
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
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'output' | 'events'>('output')
  const [events, setEvents] = useState<EventRecord[]>([])
  const [output, setOutput] = useState('')
  const [toolCalls, setToolCalls] = useState<Map<string, { tool: string; status: 'running' | 'done'; output?: string }>>(new Map())
  const cancelRef = useRef<(() => void) | null>(null)

  // 加载智能体数据
  useEffect(() => {
    async function loadAgent() {
      if (!agentId) {
        setNotFound(true)
        return
      }
      
      // 对于 local 智能体，直接创建一个本地代理对象
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
      
      // 从 API 获取智能体信息
      const data = await getAgent(agentId)
      if (data) {
        setAgent(toAgent(data))
      } else {
        setNotFound(true)
      }
    }
    
    loadAgent()
  }, [agentId])

  // SSE 事件处理
  const handleEvent = useCallback((evt: SSEEvent) => {
    const e: EventRecord = { ...evt, timestamp: Date.now() }
    setEvents((s) => [...s.slice(-500), e])
    
    switch (e.type) {
      case 'delta':
        // 流式文本输出
        if (e.content) {
          setOutput((prev) => prev + e.content)
        }
        break
      case 'task_started':
        setAgent(prev => prev ? { ...prev, status: 'running' as AgentStatus, currentTask: '处理任务中...', lastActivity: '刚刚' } : null)
        setOutput('') // 清空上次输出
        setToolCalls(new Map())
        break
      case 'task_completed':
        setAgent(prev => prev ? { ...prev, status: 'completed' as AgentStatus, currentTask: undefined, taskCount: (prev.taskCount || 0) + 1 } : null)
        break
      case 'task_aborted':
        setAgent(prev => prev ? { ...prev, status: 'error' as AgentStatus, currentTask: undefined } : null)
        if (e.reason) {
          setOutput((prev) => prev + `\n\n[错误] ${e.reason}`)
        }
        break
      case 'tool_start':
        if (e.call_id && e.tool) {
          setToolCalls((prev) => new Map(prev).set(e.call_id!, { tool: e.tool!, status: 'running' }))
        }
        break
      case 'tool_complete':
        if (e.call_id) {
          setToolCalls((prev) => {
            const next = new Map(prev)
            const existing = next.get(e.call_id!)
            if (existing) {
              next.set(e.call_id!, { ...existing, status: 'done', output: e.output })
            }
            return next
          })
        }
        break
      // 兼容旧事件格式
      case 'assistant_message_delta':
        if (e.delta) {
          setOutput((prev) => prev + e.delta)
        }
        break
      case 'assistant_message_completed':
        if (e.content) {
          setOutput(e.content)
        }
        break
    }
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
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex items-center justify-center">
        <div className="text-center">
          <Bot className="size-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">智能体不存在</h2>
          <p className="text-muted-foreground mb-6">找不到 ID 为 {agentId} 的智能体</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回首页
          </button>
        </div>
      </div>
    )
  }

  // 加载中
  if (!agent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="size-12 mx-auto text-muted-foreground/50 mb-4 animate-spin" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  const config = statusConfig[agent.status]

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!prompt.trim() || loading) return
    
    // 取消之前的请求
    if (cancelRef.current) {
      cancelRef.current()
    }
    
    setLoading(true)
    const currentPrompt = prompt
    setPrompt('')
    
    // 使用流式执行
    cancelRef.current = executeOnAgentStream(
      agent.id,
      currentPrompt,
      handleEvent,
      (error) => {
        console.error('Stream error:', error)
        setAgent(prev => prev ? { ...prev, status: 'error' as AgentStatus } : null)
        setLoading(false)
      },
      () => {
        // 完成
        setLoading(false)
        cancelRef.current = null
      }
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 transition-colors duration-500">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back & Title */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all duration-300"
              >
                <ArrowLeft className="size-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', config.bgColor)}>
                  <Bot className={cn('size-6', config.color)} />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground tracking-tight">{agent.name}</h1>
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                </div>
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={cn('size-2 rounded-full', agent.status === 'running' ? 'bg-success animate-pulse' : 'bg-muted-foreground/40')} />
                <Badge variant="outline" className={cn('gap-1', config.color)}>
                  {config.label}
                </Badge>
              </div>
              
              <div className="flex items-center gap-1">
                {agent.status === 'running' ? (
                  <button className="p-2 rounded-xl hover:bg-muted/50 text-warning transition-colors" title="暂停">
                    <Pause className="size-5" />
                  </button>
                ) : (
                  <button className="p-2 rounded-xl hover:bg-muted/50 text-success transition-colors" title="启动">
                    <Play className="size-5" />
                  </button>
                )}
                <button className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="设置">
                  <Settings className="size-5" />
                </button>
                <button className="p-2 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="删除">
                  <Trash2 className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Status & Input */}
          <div className="lg:col-span-1 space-y-6">
            {/* Status Card */}
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">状态信息</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">状态</span>
                  <span className={cn('font-medium', config.color)}>{config.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">任务数</span>
                  <span className="font-medium">{agent.taskCount ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">最后活动</span>
                  <span className="font-medium">{agent.lastActivity || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">流式状态</span>
                  <span className={cn('font-medium', loading ? 'text-success' : 'text-muted-foreground')}>
                    {loading ? '接收中...' : '空闲'}
                  </span>
                </div>
                {agent.currentTask && (
                  <>
                    <Separator className="my-2 opacity-30" />
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">当前任务</div>
                      <div className="text-sm font-medium bg-muted/30 rounded-lg px-3 py-2">{agent.currentTask}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Task Input */}
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Send className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">提交新任务</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="输入任务描述..."
                  className="w-full min-h-[100px] rounded-xl bg-muted/30 border border-border/50 focus:border-primary/50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
                    'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20',
                    'disabled:opacity-50 disabled:pointer-events-none',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {loading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  发送任务
                </button>
              </form>
            </div>
          </div>

          {/* Right: Output & Events */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => setActiveTab('output')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                  activeTab === 'output' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                <Terminal className="size-4" />
                实时输出
              </button>
              <button
                onClick={() => setActiveTab('events')}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                  activeTab === 'events' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                <Activity className="size-4" />
                事件日志
                {events.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                    {events.length}
                  </Badge>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden" style={{ minHeight: '500px' }}>
              {activeTab === 'output' ? (
                <div className="h-full">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-3 border-b border-border/30 bg-muted/20">
                    <FileText className="size-3" />
                    <span>输出终端</span>
                    {toolCalls.size > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        <Wrench className="size-3 mr-1" />
                        {Array.from(toolCalls.values()).filter(t => t.status === 'running').length} 工具运行中
                      </Badge>
                    )}
                  </div>
                  <div className="p-4 bg-foreground/95 dark:bg-background/95 min-h-[450px]">
                    {/* 工具调用状态 */}
                    {toolCalls.size > 0 && (
                      <div className="mb-4 space-y-2">
                        {Array.from(toolCalls.entries()).map(([callId, info]) => (
                          <div key={callId} className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                            info.status === 'running' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                          )}>
                            {info.status === 'running' ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <Wrench className="size-3" />
                            )}
                            <span className="font-medium">{info.tool}</span>
                            {info.status === 'done' && info.output && (
                              <span className="text-muted-foreground truncate max-w-xs">
                                → {info.output.slice(0, 50)}{info.output.length > 50 ? '...' : ''}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* 文本输出 */}
                    <pre className="text-sm text-success font-mono whitespace-pre-wrap">
                      {output || <span className="text-muted-foreground/50 italic">等待输出...</span>}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="h-full">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-3 border-b border-border/30 bg-muted/20">
                    <Activity className="size-3" />
                    <span>事件日志</span>
                  </div>
                  <div className="p-4 space-y-2 max-h-[450px] overflow-auto">
                    {events.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-16">
                        暂无事件
                      </div>
                    ) : (
                      events.slice(-50).reverse().map((ev, i) => (
                        <div key={i} className="p-3 bg-muted/20 rounded-lg border border-border/30 text-xs transition-colors hover:bg-muted/30">
                          <div className="flex items-center justify-between mb-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {ev.type}
                            </Badge>
                            {ev.task_id && (
                              <span className="text-muted-foreground">
                                Task: {ev.task_id.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground break-all opacity-80">
                            {JSON.stringify(ev).slice(0, 200)}
                            {JSON.stringify(ev).length > 200 && '...'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
