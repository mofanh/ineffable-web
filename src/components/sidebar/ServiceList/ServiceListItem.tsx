// ============ 服务列表项组件 ============

import React from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Plus, Square, Play, MessageSquare } from 'lucide-react'
import { cn } from '../../../utils/cn'
import type { ServiceListItemProps } from './types'
import { SessionListItem } from '../SessionList/SessionListItem'

export function ServiceListItem({
  service,
  selectedSessionId,
  runningSessionId,
  showSessionMenuId,
  onToggleExpand,
  onLoadSessions,
  onCreateSession,
  onStartService,
  onStopService,
  onSessionClick,
  onSessionMenuClick,
  onRenameSession,
  onDeleteSession,
}: ServiceListItemProps) {
  const isRunning = service.status === 'running'
  const hasSessions = service.sessions.length > 0

  return (
    <div key={service.id}>
      {/* Service Item */}
      <div
        onClick={() => isRunning && onToggleExpand(service.id)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors group",
          isRunning ? "cursor-pointer hover:bg-muted" : "opacity-60"
        )}
      >
        {/* Expand Icon */}
        <div className="size-4 flex items-center justify-center">
          {!isRunning ? null : service.loadingSessions ? (
            <RefreshCw className="size-3 animate-spin text-muted-foreground" />
          ) : service.expanded ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
        </div>

        {/* Status Dot */}
        <div className={cn(
          "size-2 rounded-full shrink-0",
          isRunning ? "bg-success" : "bg-muted-foreground"
        )} />

        {/* Name */}
        <span className="text-sm flex-1 truncate">{service.name}</span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {isRunning ? (
            <>
              <button
                onClick={(e) => onCreateSession(e)}
                className="p-1 rounded hover:bg-muted-foreground/20"
                title="新建会话"
              >
                <Plus className="size-3" />
              </button>
              <button
                onClick={(e) => onStopService(e)}
                className="p-1 rounded hover:bg-muted-foreground/20"
                title="停止服务"
              >
                <Square className="size-3" />
              </button>
            </>
          ) : (
            <button
              onClick={(e) => onStartService(e)}
              className="p-1 rounded hover:bg-muted-foreground/20"
              title="启动服务"
            >
              <Play className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Sessions */}
      {service.expanded && isRunning && (
        <div className="ml-6 mt-0.5 space-y-0.5">
          {hasSessions ? (
            service.sessions.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                mode="hub"
                isSelected={selectedSessionId === session.id}
                isRunning={runningSessionId === session.id}
                isMenuOpen={showSessionMenuId === session.id}
                onClick={() => onSessionClick(session)}
                onMenuClick={(e) => {
                  e.stopPropagation()
                  onSessionMenuClick(showSessionMenuId === session.id ? null : session.id)
                }}
                onRename={(e) => {
                  e.stopPropagation()
                  const newName = prompt('请输入新的会话名称:', session.name || '')
                  if (newName !== null && newName.trim() !== session.name?.trim()) {
                    onRenameSession(service, session, newName)
                  }
                }}
                onDelete={(e) => {
                  e.stopPropagation()
                  if (runningSessionId !== session.id) {
                    onDeleteSession(service, session, e)
                  }
                }}
              />
            ))
          ) : (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              暂无会话
            </div>
          )}
        </div>
      )}
    </div>
  )
}
