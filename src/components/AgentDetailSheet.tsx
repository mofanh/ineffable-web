import React, { useState } from 'react'
import { Bot, Send, RefreshCw, Terminal, Activity, FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { cn } from '../utils/cn'
import { execute } from '../api'
import type { Agent, AgentStatus } from './AgentCard'

interface AgentDetailSheetProps {
  agent: Agent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  output: string
  events: any[]
  onTaskStarted?: (taskId: string, prompt: string) => void
}

const statusConfig: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: '空闲', color: 'text-muted-foreground' },
  running: { label: '运行中', color: 'text-success' },
  completed: { label: '已完成', color: 'text-primary' },
  error: { label: '错误', color: 'text-destructive' },
  paused: { label: '已暂停', color: 'text-warning' },
}

export default function AgentDetailSheet({
  agent,
  open,
  onOpenChange,
  output,
  events,
  onTaskStarted,
}: AgentDetailSheetProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'output' | 'events'>('output')

  if (!agent) return null

  const config = statusConfig[agent.status]

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!prompt.trim() || loading) return
    setLoading(true)
    try {
      const data = await execute(prompt)
      onTaskStarted?.(data.task_id, prompt)
      setPrompt('')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col bg-linear-to-b from-card to-background">
        <SheetHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-linear-to-br from-primary/20 to-accent/10 text-primary shadow-sm">
              <Bot className="size-6" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-lg font-semibold tracking-tight">{agent.name}</SheetTitle>
              <SheetDescription className="opacity-80">{agent.description || '智能体详情'}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Status Section */}
        <div className="px-4 py-3 bg-muted/30 backdrop-blur-sm rounded-xl mx-4 mt-4 border border-border/30">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">状态</div>
              <div className={cn('font-medium flex items-center gap-1.5', config.color)}>
                <span className={cn('size-2 rounded-full', agent.status === 'running' ? 'bg-success animate-pulse' : 'bg-muted-foreground/40')} />
                {config.label}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">任务数</div>
              <div className="font-medium">{agent.taskCount ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">最后活动</div>
              <div className="font-medium text-xs">{agent.lastActivity || '—'}</div>
            </div>
          </div>
          {agent.currentTask && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <div className="text-muted-foreground text-xs mb-1">当前任务</div>
              <div className="text-sm font-medium">{agent.currentTask}</div>
            </div>
          )}
        </div>

        {/* Task Submit Form */}
        <div className="px-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Send className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">提交新任务</span>
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入任务描述..."
              className="flex-1 rounded-xl bg-muted/30 border-border/50 focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
                'bg-linear-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-lg hover:shadow-primary/20',
                'disabled:opacity-50 disabled:pointer-events-none',
                'flex items-center gap-2'
              )}
            >
              {loading ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              发送
            </button>
          </form>
        </div>

        <Separator className="my-4 opacity-30" />

        {/* Tabs */}
        <div className="px-4 flex gap-1">
          <button
            onClick={() => setActiveTab('output')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300',
              activeTab === 'output' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Terminal className="size-4" />
            实时输出
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300',
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
        <div className="flex-1 overflow-hidden mx-4 mt-3 mb-4">
          {activeTab === 'output' ? (
            <div className="h-full bg-foreground/95 dark:bg-background/95 rounded-xl p-4 overflow-auto shadow-inner">
              <div className="flex items-center gap-2 text-xs text-muted dark:text-muted-foreground mb-3">
                <FileText className="size-3" />
                <span>输出终端</span>
              </div>
              <pre className="text-sm text-success font-mono whitespace-pre-wrap">
                {output || <span className="text-muted-foreground/50 italic">等待输出...</span>}
              </pre>
            </div>
          ) : (
            <div className="h-full bg-muted/20 backdrop-blur-sm rounded-xl p-3 overflow-auto border border-border/30">
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    暂无事件
                  </div>
                ) : (
                  events.slice(-50).reverse().map((ev, i) => (
                    <div key={i} className="p-2.5 bg-card/50 rounded-lg border border-border/30 text-xs transition-colors hover:bg-card">
                      <div className="flex items-center justify-between mb-1">
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
      </SheetContent>
    </Sheet>
  )
}
