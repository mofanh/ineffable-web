import React from 'react'
import { Bot, Play, Pause, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { cn } from '../utils/cn'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'paused'

export interface Agent {
  id: string
  name: string
  description?: string
  status: AgentStatus
  currentTask?: string
  lastActivity?: string
  taskCount?: number
}

interface AgentCardProps {
  agent: Agent
  onClick?: () => void
}

const statusConfig: Record<AgentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  idle: {
    label: '空闲',
    variant: 'secondary',
    icon: <Clock className="size-3" />,
  },
  running: {
    label: '运行中',
    variant: 'default',
    icon: <Play className="size-3" />,
  },
  completed: {
    label: '已完成',
    variant: 'outline',
    icon: <CheckCircle2 className="size-3" />,
  },
  error: {
    label: '错误',
    variant: 'destructive',
    icon: <AlertCircle className="size-3" />,
  },
  paused: {
    label: '已暂停',
    variant: 'secondary',
    icon: <Pause className="size-3" />,
  },
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const config = statusConfig[agent.status]

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
        agent.status === 'running' && 'border-primary/30 bg-primary/5'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              'p-2 rounded-lg',
              agent.status === 'running' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              <Bot className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              {agent.description && (
                <CardDescription className="text-xs mt-0.5">{agent.description}</CardDescription>
              )}
            </div>
          </div>
          <Badge variant={config.variant} className="gap-1">
            {config.icon}
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {agent.currentTask && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">当前任务：</span>
            <span className="line-clamp-1">{agent.currentTask}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>任务数: {agent.taskCount ?? 0}</span>
          {agent.lastActivity && <span>最后活动: {agent.lastActivity}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
