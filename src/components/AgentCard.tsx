import React from 'react'
import { Bot, Play, Pause, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
import { cn } from '../utils/cn'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'paused' | 'offline'

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

const statusConfig: Record<AgentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode; className?: string }> = {
  idle: {
    label: '空闲',
    variant: 'secondary',
    icon: <Clock className="size-3" />,
    className: 'bg-muted text-muted-foreground',
  },
  running: {
    label: '运行中',
    variant: 'default',
    icon: <Play className="size-3" />,
    className: 'bg-primary/10 text-primary',
  },
  completed: {
    label: '已完成',
    variant: 'outline',
    icon: <CheckCircle2 className="size-3" />,
    className: 'bg-success/10 text-success',
  },
  error: {
    label: '错误',
    variant: 'destructive',
    icon: <AlertCircle className="size-3" />,
    className: 'bg-destructive/10 text-destructive',
  },
  paused: {
    label: '已暂停',
    variant: 'secondary',
    icon: <Pause className="size-3" />,
    className: 'bg-warning/10 text-warning',
  },
  offline: {
    label: '离线',
    variant: 'secondary',
    icon: <Clock className="size-3" />,
    className: 'bg-muted text-muted-foreground/50',
  },
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const config = statusConfig[agent.status]

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5',
        'bg-linear-to-br from-card to-card/80 backdrop-blur-sm',
        agent.status === 'running' && 'border-primary/30 shadow-primary/5 shadow-lg'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2.5 rounded-xl transition-colors duration-300',
              agent.status === 'running' 
                ? 'bg-linear-to-br from-primary/20 to-primary/5 text-primary shadow-sm' 
                : 'bg-muted/50 text-muted-foreground'
            )}>
              <Bot className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
              {agent.description && (
                <CardDescription className="text-xs mt-0.5 opacity-80">{agent.description}</CardDescription>
              )}
            </div>
          </div>
          <Badge variant={config.variant} className="gap-1 text-xs">
            {config.icon}
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {agent.currentTask && (
          <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 mb-3">
            <span className="font-medium text-foreground/80">当前：</span>
            <span className="line-clamp-1 opacity-80">{agent.currentTask}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
          <span className="flex items-center gap-1.5 mt-2">
            <span className="font-medium">{agent.taskCount ?? 0}</span> 任务
          </span>
          {agent.lastActivity && (
            <span className="mt-2 opacity-70">{agent.lastActivity}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
