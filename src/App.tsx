import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Plus, RefreshCw } from 'lucide-react'
import DashboardHeader from './components/DashboardHeader'
import AgentCard, { Agent, AgentStatus } from './components/AgentCard'
import AgentDetailSheet from './components/AgentDetailSheet'
import { getHealth, getStatus } from './api'
import { useSSE } from './hooks/useSSE'
import { useTheme } from './hooks/useTheme'

type EventRecord = {
  id?: string
  type: string
  task_id?: string
  content?: string
  delta?: string
  [k: string]: any
}

// 模拟多个智能体（实际项目中应从 API 获取）
const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: '通用助手',
    description: '处理各类通用任务',
    status: 'idle',
    taskCount: 12,
    lastActivity: '2分钟前',
  },
  {
    id: 'agent-2',
    name: '代码审查',
    description: '自动代码审查和优化建议',
    status: 'running',
    currentTask: '正在分析 src/components 目录...',
    taskCount: 8,
    lastActivity: '刚刚',
  },
  {
    id: 'agent-3',
    name: '文档生成',
    description: '自动生成API文档',
    status: 'completed',
    taskCount: 5,
    lastActivity: '10分钟前',
  },
  {
    id: 'agent-4',
    name: '测试助手',
    description: '自动化测试生成与执行',
    status: 'error',
    currentTask: '测试执行失败',
    taskCount: 3,
    lastActivity: '5分钟前',
  },
]

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [status, setStatus] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>(mockAgents)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [buffers, setBuffers] = useState<Record<string, string>>({})
  const [refreshing, setRefreshing] = useState(false)

  // 加载系统状态
  async function loadStatus() {
    setRefreshing(true)
    try {
      const s = await getStatus()
      setStatus(s.data)
      // 根据状态更新第一个智能体
      if (s.data?.is_running) {
        setAgents(prev => prev.map((a, i) => 
          i === 0 ? { ...a, status: 'running' as AgentStatus } : a
        ))
      }
    } catch (_) {}
    try {
      const h = await getHealth()
      setHealth(h.data)
    } catch (_) {}
    setRefreshing(false)
  }

  useEffect(() => {
    loadStatus()
    // 定期刷新状态
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // SSE 事件处理
  const handleEvent = useCallback((evt: any) => {
    const e: EventRecord = evt
    setEvents((s) => [...s.slice(-500), e])
    const tid = e.task_id || 'global'
    
    if (e.type === 'assistant_message_delta') {
      setBuffers((b) => ({ ...b, [tid]: (b[tid] || '') + (e.delta || '') }))
    } else if (e.type === 'assistant_message_completed') {
      setBuffers((b) => ({ ...b, [tid]: e.content || b[tid] || '' }))
    } else if (e.type === 'task_started') {
      // 更新智能体状态为运行中
      setAgents(prev => prev.map((a, i) => 
        i === 0 ? { ...a, status: 'running' as AgentStatus, currentTask: '处理任务中...', lastActivity: '刚刚' } : a
      ))
    } else if (e.type === 'task_completed') {
      // 更新智能体状态为已完成
      setAgents(prev => prev.map((a, i) => 
        i === 0 ? { ...a, status: 'completed' as AgentStatus, currentTask: undefined, taskCount: (a.taskCount || 0) + 1 } : a
      ))
    }
  }, [])

  const { connected } = useSSE(handleEvent)

  // 统计信息
  const runningCount = useMemo(() => 
    agents.filter(a => a.status === 'running').length, 
    [agents]
  )

  // 获取选中智能体的输出
  const selectedOutput = useMemo(() => {
    if (!selectedAgent) return ''
    // 这里简化处理，实际应根据智能体ID过滤
    return buffers['global'] || ''
  }, [selectedAgent, buffers])

  // 获取选中智能体的事件
  const selectedEvents = useMemo(() => {
    if (!selectedAgent) return []
    // 这里简化处理，实际应根据智能体ID过滤
    return events
  }, [selectedAgent, events])

  function handleAgentClick(agent: Agent) {
    setSelectedAgent(agent)
    setSheetOpen(true)
  }

  function handleTaskStarted(taskId: string, prompt: string) {
    if (selectedAgent) {
      setAgents(prev => prev.map(a => 
        a.id === selectedAgent.id 
          ? { ...a, status: 'running' as AgentStatus, currentTask: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''), lastActivity: '刚刚' }
          : a
      ))
      setSelectedAgent(prev => prev ? { ...prev, status: 'running', currentTask: prompt.slice(0, 50) } : null)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/30 transition-colors duration-500">
      {/* Header */}
      <DashboardHeader
        totalAgents={agents.length}
        runningAgents={runningCount}
        healthStatus={health?.status}
        systemState={status?.state}
        theme={theme}
        onThemeToggle={toggleTheme}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold text-foreground tracking-tight">智能体列表</h2>
            <p className="text-sm text-muted-foreground mt-1.5 opacity-80">
              点击卡片查看详情，管理和监控各个智能体
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadStatus}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-muted/50 transition-all duration-300 disabled:opacity-50 hover:shadow-sm"
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-linear-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5">
              <Plus className="size-4" />
              新建智能体
            </button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="mb-6 flex items-center gap-2 text-sm bg-card/30 backdrop-blur-sm rounded-lg px-4 py-2.5 w-fit border border-border/30">
          <span className={`size-2.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
          <span className="text-muted-foreground">
            SSE连接: {connected ? '已连接' : '断开'}
          </span>
        </div>

        {/* Agent Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => handleAgentClick(agent)}
            />
          ))}

          {/* Add New Agent Card */}
          <div
            className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 cursor-pointer transition-all duration-300 min-h-40 hover:shadow-lg hover:shadow-primary/5"
          >
            <Bot className="size-8" />
            <span className="text-sm font-medium">添加新智能体</span>
          </div>
        </div>

        {/* Empty State */}
        {agents.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex p-6 rounded-2xl bg-linear-to-br from-muted/50 to-muted/20 mb-6">
              <Bot className="size-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">暂无智能体</h3>
            <p className="text-muted-foreground mb-8 opacity-80">创建你的第一个智能体开始使用</p>
            <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-linear-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5">
              <Plus className="size-4" />
              创建智能体
            </button>
          </div>
        )}
      </main>

      {/* Agent Detail Sheet */}
      <AgentDetailSheet
        agent={selectedAgent}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        output={selectedOutput}
        events={selectedEvents}
        onTaskStarted={handleTaskStarted}
      />
    </div>
  )
}
