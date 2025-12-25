import React from 'react'
import { Bot, Activity, CheckCircle2, AlertCircle, Server } from 'lucide-react'
import { Badge } from './ui/badge'
import { cn } from '../utils/cn'

interface DashboardHeaderProps {
  totalAgents: number
  runningAgents: number
  healthStatus?: string
  systemState?: string
}

export default function DashboardHeader({
  totalAgents,
  runningAgents,
  healthStatus,
  systemState,
}: DashboardHeaderProps) {
  const isHealthy = healthStatus === 'healthy' || healthStatus === 'ok'

  return (
    <header className="bg-background border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Ineffable Agent</h1>
              <p className="text-xs text-muted-foreground">智能体控制台</p>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-6">
            {/* Running Agents */}
            <div className="flex items-center gap-2">
              <Activity className={cn('size-4', runningAgents > 0 ? 'text-green-500' : 'text-muted-foreground')} />
              <div className="text-sm">
                <span className="font-medium">{runningAgents}</span>
                <span className="text-muted-foreground">/{totalAgents} 运行中</span>
              </div>
            </div>

            {/* System State */}
            {systemState && (
              <div className="flex items-center gap-2">
                <Server className="size-4 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs">
                  {systemState}
                </Badge>
              </div>
            )}

            {/* Health Status */}
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <CheckCircle2 className="size-4 text-green-500" />
              ) : (
                <AlertCircle className="size-4 text-yellow-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                isHealthy ? 'text-green-600' : 'text-yellow-600'
              )}>
                {isHealthy ? '系统正常' : healthStatus || '未知'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
