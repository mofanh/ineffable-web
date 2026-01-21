// ============ 会话列表组件（统一模式） ============

import React from 'react'
import { RefreshCw, Plus, MessageSquare } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { SessionListItem } from './SessionListItem'
import type { SessionListProps } from './types'

export function SessionList({
  sessions,
  mode,
  selectedSessionId,
  runningSessionId,
  showSessionMenuId,
  isLoading,
  serverStatus,
  onRefresh,
  onCreateSession,
  onSessionClick,
  onSessionMenuClick,
  onRename,
  onDelete,
}: SessionListProps) {
  const isOnline = serverStatus === 'online'

  // 空状态
  if (!isOnline) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {mode === 'direct' ? '会话' : '会话'}
          </span>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          {mode === 'direct' ? '服务离线' : '服务器离线'}
        </div>
      </>
    )
  }

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {mode === 'direct' ? '会话' : '会话'}
          </span>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          加载中...
        </div>
      </>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {mode === 'direct' ? '会话' : '会话'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              onClick={onCreateSession}
              className="p-1 rounded hover:bg-muted transition-colors text-primary"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          <p>暂无会话</p>
          <button
            onClick={onCreateSession}
            className="mt-1 text-primary text-xs hover:underline"
          >
            + 新建会话
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {mode === 'direct' ? '会话' : '会话'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            onClick={onCreateSession}
            className="p-1 rounded hover:bg-muted transition-colors text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 会话列表 */}
      <div className={cn("space-y-0.5", mode === 'direct' ? "px-2" : "ml-6 mt-0.5 px-2")}>
        {sessions.map(session => (
          <SessionListItem
            key={session.id}
            session={session}
            mode={mode}
            isSelected={selectedSessionId === session.id}
            isRunning={runningSessionId === session.id}
            isMenuOpen={showSessionMenuId === session.id}
            onClick={() => onSessionClick(session)}
            onMenuClick={(e) => {
              e.stopPropagation()
              onSessionMenuClick(showSessionMenuId === session.id ? null : session.id)
            }}
            onRename={(e) => onRename(session, e)}
            onDelete={(e) => onDelete(session, e)}
          />
        ))}
      </div>
    </>
  )
}
