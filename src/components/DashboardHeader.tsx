import React from 'react'
import { Bot, Activity, CheckCircle2, AlertCircle, Server, Sun, Moon, Sparkles } from 'lucide-react'
import { Badge } from './ui/badge'
import { cn } from '../utils/cn'
import { Theme, themeNames } from '../hooks/useTheme'

interface DashboardHeaderProps {
  totalAgents: number
  runningAgents: number
  healthStatus?: string
  systemState?: string
  theme: Theme
  onThemeToggle: () => void
}

export default function DashboardHeader({
  totalAgents,
  runningAgents,
  healthStatus,
  systemState,
  theme,
  onThemeToggle,
}: DashboardHeaderProps) {
  const isHealthy = healthStatus === 'healthy' || healthStatus === 'ok'

  return (
    <header className="bg-card/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-linear-to-br from-primary/20 to-accent/20 shadow-sm">
              <Bot className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Ineffable Agent</h1>
              <p className="text-xs text-muted-foreground">智能体控制台</p>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-6">
            {/* Running Agents */}
            <div className="flex items-center gap-2">
              <Activity className={cn('size-4', runningAgents > 0 ? 'text-success' : 'text-muted-foreground')} />
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
                <CheckCircle2 className="size-4 text-success" />
              ) : (
                <AlertCircle className="size-4 text-warning" />
              )}
              <span className={cn(
                'text-sm font-medium',
                isHealthy ? 'text-success' : 'text-warning'
              )}>
                {isHealthy ? '系统正常' : healthStatus || '未知'}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={onThemeToggle}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 hover:scale-105",
                theme.startsWith('zhenwu') 
                  ? "bg-primary/10 hover:bg-primary/20 text-primary" 
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              aria-label={`当前主题: ${themeNames[theme]}，点击切换`}
              title={themeNames[theme]}
            >
              {theme === 'light' && <Moon className="size-4" />}
              {theme === 'dark' && <Sun className="size-4" />}
              {theme === 'zhenwu' && <Sparkles className="size-4" />}
              {theme === 'zhenwu-dark' && <Sparkles className="size-4" />}
              <span className="text-xs font-medium hidden sm:inline">{themeNames[theme]}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
