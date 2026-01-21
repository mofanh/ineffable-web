// ============ 服务列表组件 ============

import React from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import { cn } from '../../../utils/cn'
import { ServiceListItem } from './ServiceListItem'
import { CreateServiceDialog } from '../dialogs/CreateServiceDialog'
import type { ServiceListProps } from './types'

export function ServiceList({
  services,
  loading,
  selectedServer,
  showCreateDialog,
  selectedSessionId,
  runningSessionId,
  showSessionMenuId,
  onRefresh,
  onCreateService,
  onCloseCreateDialog,
  onCreateServiceSubmit,
  onToggleExpand,
  onLoadSessions,
  onCreateSession,
  onStartService,
  onStopService,
  onSessionClick,
  onSessionMenuClick,
  onRenameSession,
  onDeleteSession,
}: ServiceListProps) {
  // 无服务器状态
  if (!selectedServer) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          <p>请先选择服务器</p>
          <button
            onClick={() => onCreateService()}
            className="mt-1 text-primary text-xs hover:underline"
          >
            + 添加服务器
          </button>
        </div>
        {showCreateDialog && (
          <CreateServiceDialog
            isOpen={showCreateDialog}
            onClose={onCloseCreateDialog}
            onSubmit={onCreateServiceSubmit}
          />
        )}
      </>
    )
  }

  // 服务器离线状态
  if (selectedServer.status !== 'online') {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          服务器离线
        </div>
      </>
    )
  }

  // 加载中状态
  if (loading) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          加载中...
        </div>
      </>
    )
  }

  // 无服务状态
  if (services.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              onClick={() => onCreateService()}
              className="p-1 rounded hover:bg-muted transition-colors text-primary"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="px-3 py-4 text-center text-muted-foreground text-sm">
          <p>暂无服务</p>
          <button
            onClick={() => onCreateService()}
            className="mt-1 text-primary text-xs hover:underline"
          >
            + 创建服务
          </button>
        </div>
        {showCreateDialog && (
          <CreateServiceDialog
            isOpen={showCreateDialog}
            onClose={onCloseCreateDialog}
            onSubmit={onCreateServiceSubmit}
          />
        )}
      </>
    )
  }

  return (
    <>
      {/* 服务头部 */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">服务</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => onCreateService()}
            className="p-1 rounded hover:bg-muted transition-colors text-primary"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 服务列表 */}
      <div className="space-y-0.5 px-2">
        {services.map(service => (
          <ServiceListItem
            key={service.id}
            service={service}
            selectedSessionId={selectedSessionId}
            runningSessionId={runningSessionId}
            showSessionMenuId={showSessionMenuId}
            onToggleExpand={onToggleExpand}
            onLoadSessions={onLoadSessions}
            onCreateSession={onCreateSession}
            onStartService={onStartService}
            onStopService={onStopService}
            onSessionClick={onSessionClick}
            onSessionMenuClick={onSessionMenuClick}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
          />
        ))}
      </div>

      {showCreateDialog && (
        <CreateServiceDialog
          isOpen={showCreateDialog}
          onClose={onCloseCreateDialog}
          onSubmit={onCreateServiceSubmit}
        />
      )}
    </>
  )
}

