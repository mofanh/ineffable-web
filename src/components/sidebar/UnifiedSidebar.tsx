// ============ UnifiedSidebar 主组件 ============

import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { Server, Service, Session } from '../../types'
import type { SidebarProps, SidebarHandle } from './types'
import { useServers } from '../../hooks/sidebar/useServers'
import { useServices } from '../../hooks/sidebar/useServices'
import { useSessions } from '../../hooks/sidebar/useSessions'
import { SidebarHeader } from './SidebarHeader'
import { ServerSelector } from './ServerSelector'
import { AddServerDialog } from './dialogs'
import { ServiceList } from './ServiceList'
import { SessionList } from './SessionList'
import { UserMenu } from './UserMenu'
import { useTheme } from '../../hooks/useTheme'
import ConfigPanel from '../config/ConfigPanel'

const UnifiedSidebar = forwardRef<SidebarHandle, SidebarProps>(function UnifiedSidebar({ 
  isCollapsed, 
  onCollapse, 
  onSessionSelect, 
  selectedSessionId,
  runningSessionId,
  currentServiceUrl,
  initialServerId,
  initialServiceId,
  initialSessionId
}: Props, ref) {
  const { theme, toggleTheme } = useTheme()
  const [showAddServer, setShowAddServer] = useState(false)
  const [showCreateService, setShowCreateService] = useState(false)
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  
  // 服务器管理
  const {
    servers,
    selectedServer,
    loadingServers,
    showServerDropdown,
    setShowServerDropdown,
    loadServers,
    selectServer,
    addServer,
  } = useServers({
    initialServerId,
    onServerSelect: () => {
      // 服务器切换时清空会话选择
      onSessionSelect(
        selectedServer!,
        { id: '', name: '', port: 0, workingDir: '', status: 'stopped', autoStart: false, createdAt: '' } as Service,
        { id: '', messageCount: 0, isActive: false } as Session,
        ''
      )
    }
  })

  // 服务管理 (Hub模式)
  const {
    services,
    loadingServices,
    showCreateService: showServiceDialog,
    setShowCreateService: setShowServiceDialog,
    loadServices,
    handleStartService,
    handleStopService,
    handleCreateService,
    toggleServiceExpand,
    loadSessionsForService,
  } = useServices({ selectedServer })

  // 会话管理
  const {
    directSessions,
    loadingDirectSessions,
    showSessionMenuId,
    setShowSessionMenuId,
    loadDirectSessions,
    handleCreateSession,
    handleDeleteSession,
    handleRenameSession,
    handleCreateDirectSession,
    handleDeleteDirectSession,
    handleRenameDirectSession,
  } = useSessions({
    selectedServer,
    initialSessionId,
    onSessionSelect,
  })

  // 刷新会话标题
  const refreshSessionTitle = useCallback(async (serviceUrl: string, sessionId: string) => {
    if (!selectedServer) return null
    try {
      const { listSessions } = await import('../../api/services')
      const { sessions } = await listSessions(serviceUrl)
      const target = sessions.find(s => s.id === sessionId)
      if (!target) return null

      // Hub模式
      if (selectedServer.connectionType !== 'direct') {
        setServices(prev => prev.map(svc => {
          if (svc.id !== selectedServer.id) return svc
          return {
            ...svc,
            sessions: svc.sessions.map(s => s.id === sessionId ? { ...s, name: target.name, createdAt: target.createdAt } : s)
          }
        }))
      }

      return { id: target.id, name: target.name, createdAt: target.createdAt }
    } catch (err) {
      console.error('Failed to refresh session title:', err)
      return null
    }
  }, [selectedServer])

  useImperativeHandle(ref, () => ({
    refreshSessionTitle,
  }), [refreshSessionTitle])

  // 添加服务器
  const handleAddServer = useCallback(async (data: { name: string; url: string; connectionType: 'hub' | 'direct' }) => {
    await addServer(data.name, data.url, data.connectionType)
  }, [addServer])

  // 创建服务
  const handleCreateServiceSubmit = useCallback(async (data: { name: string; port: string; workingDir: string }) => {
    await handleCreateService(data)
  }, [handleCreateService])

  // 创建直连会话
  const handleCreateDirectSessionClick = useCallback(async () => {
    if (!selectedServer) return
    try {
      const { createSession } = await import('../../api/services')
      const newSession = await createSession(selectedServer.url)
      setDirectSessions(prev => [...(prev || []), newSession])
      
      const virtualService: Service = {
        id: 'direct',
        name: selectedServer.name,
        port: 0,
        workingDir: '',
        status: 'running',
        autoStart: false,
        createdAt: '',
      }
      onSessionSelect(selectedServer, virtualService, newSession, selectedServer.url)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }, [selectedServer, onSessionSelect])

  // 删除直连会话
  const handleDeleteDirectSessionClick = useCallback(async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedServer) return
    if (runningSessionId === session.id) {
      alert('无法删除运行中的会话')
      return
    }
    if (!confirm(`确定要删除会话 "${session.name || session.id.slice(0, 8)}" 吗？`)) return
    
    try {
      const { permanentDeleteSession } = await import('../../api/services')
      await permanentDeleteSession(selectedServer.url, session.id)
      setDirectSessions(prev => prev?.filter(s => s.id !== session.id))
    } catch (err) {
      alert(`删除会话失败: ${(err as Error).message}`)
    }
  }, [selectedServer, runningSessionId])

  // 重命名直连会话
  const handleRenameDirectSessionClick = useCallback(async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation()
    const newName = prompt('请输入新的会话名称:', session.name || '')
    if (newName === null || newName.trim() === session.name?.trim()) return
    
    try {
      const { updateSession } = await import('../../api/services')
      const updated = await updateSession(selectedServer!.url, session.id, { name: newName.trim() })
      setDirectSessions(prev => prev?.map(s => s.id === session.id ? { ...s, name: updated.name } : s))
    } catch (err) {
      alert(`重命名会话失败: ${(err as Error).message}`)
    }
  }, [selectedServer])

  // Hub模式下会话点击
  const handleHubSessionClick = useCallback((session: Session) => {
    if (!selectedServer || services.length === 0) return
    // 找到第一个有会话的服务
    const targetService = services.find(s => s.sessions.some(sess => sess.id === session.id))
    if (targetService) {
      const { buildServiceUrl } = require('../../api/services')
      const serviceUrl = buildServiceUrl(selectedServer.url, targetService.port)
      onSessionSelect(selectedServer, targetService, session, serviceUrl)
    }
  }, [selectedServer, services, onSessionSelect])

  if (isCollapsed) {
    return null
  }

  const isDirectMode = selectedServer?.connectionType === 'direct'
  const isOnline = selectedServer?.status === 'online'

  return (
    <aside className="w-70 flex flex-col border-r border-border bg-muted/20 overflow-hidden h-full">
      {/* 头部 */}
      <SidebarHeader onCollapse={onCollapse} />

      {/* 服务器选择器 */}
      <ServerSelector
        servers={servers}
        selectedServer={selectedServer}
        loadingServers={loadingServers}
        showDropdown={showServerDropdown}
        onToggleDropdown={() => setShowServerDropdown(!showServerDropdown)}
        onSelectServer={selectServer}
        onAddServer={() => setShowAddServer(true)}
      />

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {/* 直连模式 */}
        {isDirectMode ? (
          <SessionList
            sessions={directSessions || []}
            mode="direct"
            selectedSessionId={selectedSessionId}
            runningSessionId={runningSessionId}
            showSessionMenuId={showSessionMenuId}
            isLoading={loadingDirectSessions}
            serverStatus={selectedServer?.status}
            onRefresh={loadDirectSessions}
            onCreateSession={handleCreateDirectSession}
            onSessionClick={(session) => {
              if (!selectedServer) return
              const virtualService: Service = {
                id: 'direct',
                name: selectedServer.name,
                port: 0,
                workingDir: '',
                status: 'running',
                autoStart: false,
                createdAt: '',
              }
              onSessionSelect(selectedServer, virtualService, session, selectedServer.url)
            }}
            onSessionMenuClick={setShowSessionMenuId}
            onRename={handleRenameDirectSession}
            onDelete={handleDeleteDirectSession}
          />
        ) : (
          /* Hub模式 */
          <ServiceList
            services={services}
            loading={loadingServices}
            selectedServer={selectedServer}
            showCreateDialog={showCreateService}
            selectedSessionId={selectedSessionId}
            runningSessionId={runningSessionId}
            showSessionMenuId={showSessionMenuId}
            onRefresh={loadServices}
            onCreateService={() => setShowCreateService(true)}
            onCloseCreateDialog={() => setShowCreateService(false)}
            onCreateServiceSubmit={handleCreateServiceSubmit}
            onToggleExpand={toggleServiceExpand}
            onLoadSessions={loadSessionsForService}
            onCreateSession={handleCreateSession}
            onStartService={handleStartService}
            onStopService={handleStopService}
            onSessionClick={(service, session) => {
              if (!selectedServer) return
              const { buildServiceUrl } = require('../../api/services')
              const serviceUrl = buildServiceUrl(selectedServer.url, service.port)
              onSessionSelect(selectedServer, service, session, serviceUrl)
            }}
            onSessionMenuClick={setShowSessionMenuId}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
          />
        )}
      </div>

      {/* 用户菜单 */}
      <UserMenu
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowConfigPanel(true)}
      />

      <ConfigPanel
        open={showConfigPanel}
        onOpenChange={setShowConfigPanel}
        serviceUrl={currentServiceUrl}
      />

      {/* 对话框 */}
      <AddServerDialog
        isOpen={showAddServer}
        onClose={() => setShowAddServer(false)}
        onAddServer={handleAddServer}
      />
    </aside>
  )
})

export default UnifiedSidebar
