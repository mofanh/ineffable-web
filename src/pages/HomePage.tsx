import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus, RefreshCw } from 'lucide-react'
import DashboardHeader from '../components/DashboardHeader'
import AgentCard, { Agent, AgentStatus } from '../components/AgentCard'
import CreateAgentDialog from '../components/CreateAgentDialog'
import { getHealth, getStatus, getAgents, RegisteredAgent } from '../api'
import { useSSE } from '../hooks/useSSE'
import { useTheme } from '../hooks/useTheme'

type EventRecord = {
  id?: string
  type: string
  task_id?: string
  content?: string
  delta?: string
  agent_id?: string
  [k: string]: any
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

export default function HomePage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [status, setStatus] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [isHubMode, setIsHubMode] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // 加载系统状态和智能体列表
  async function loadStatus() {
    setRefreshing(true)
    try {
      const s = await getStatus()
      setStatus(s.data)
    } catch (_) {}
    try {
      const h = await getHealth()
      setHealth(h.data)
      // 检查是否是 Hub 模式
      setIsHubMode(h.data?.mode === 'Hub')
    } catch (_) {}
    
    // 尝试从 Hub 获取智能体列表
    try {
      const registeredAgents = await getAgents()
      if (registeredAgents.length > 0) {
        setAgents(registeredAgents.map(toAgent))
      }
    } catch (_) {
      // 如果不是 Hub 模式，使用本地智能体作为单项
      if (status?.session_id) {
        setAgents([{
          id: 'local',
          name: '本地智能体',
          description: '当前运行的智能体',
          status: status?.is_running ? 'running' : 'idle',
          taskCount: 0,
          lastActivity: '刚刚',
        }])
      }
    }
    setRefreshing(false)
  }

  useEffect(() => {
    loadStatus()
    // 定期刷新状态
    const interval = setInterval(loadStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  // SSE 事件处理
  const handleEvent = useCallback((evt: any) => {
    const e: EventRecord = evt
    const agentId = e.agent_id || 'local'
    
    if (e.type === 'task_started') {
      setAgents(prev => prev.map(a => 
        a.id === agentId ? { ...a, status: 'running' as AgentStatus, currentTask: '处理任务中...', lastActivity: '刚刚' } : a
      ))
    } else if (e.type === 'task_completed') {
      setAgents(prev => prev.map(a => 
        a.id === agentId ? { ...a, status: 'idle' as AgentStatus, currentTask: undefined, taskCount: (a.taskCount || 0) + 1 } : a
      ))
    } else if (e.type === 'agent_registered') {
      // 新智能体注册，刷新列表
      loadStatus()
    } else if (e.type === 'agent_offline') {
      setAgents(prev => prev.map(a =>
        a.id === agentId ? { ...a, status: 'error' as AgentStatus } : a
      ))
    }
  }, [])

  const { connected } = useSSE(handleEvent)

  // 统计信息
  const runningCount = useMemo(() => 
    agents.filter(a => a.status === 'running').length, 
    [agents]
  )

  function handleAgentClick(agent: Agent) {
    navigate(`/agent/${agent.id}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 transition-colors duration-500">
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
            <button 
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5"
            >
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
            onClick={() => setShowCreateDialog(true)}
            className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 cursor-pointer transition-all duration-300 min-h-[160px] hover:shadow-lg hover:shadow-primary/5"
          >
            <Bot className="size-8" />
            <span className="text-sm font-medium">添加新智能体</span>
          </div>
        </div>

        {/* Empty State */}
        {agents.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-flex p-6 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/20 mb-6">
              <Bot className="size-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">暂无智能体</h3>
            <p className="text-muted-foreground mb-8 opacity-80">创建你的第一个智能体开始使用</p>
            <button 
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5"
            >
              <Plus className="size-4" />
              创建智能体
            </button>
          </div>
        )}
      </main>

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          setShowCreateDialog(false)
          loadStatus()
        }}
      />
    </div>
  )
}
