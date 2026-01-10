import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'
import type { Server, Service, Session } from '../types'
import UnifiedSidebar, { type UnifiedSidebarHandle } from '../components/UnifiedSidebar'
import ChatPanel from '../components/ChatPanel'

type MainPageProps = {
  initialServerId?: string
  initialServiceId?: string
  initialSessionId?: string
}

export default function MainPage({
  initialServerId,
  initialServiceId,
  initialSessionId,
}: MainPageProps) {
  const navigate = useNavigate()
  
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  // 当前选中状态
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [serviceUrl, setServiceUrl] = useState<string>('')

  // 仅当当前会话有 SSE 流（sending）时才算“运行中”
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)

  const sidebarRef = useRef<UnifiedSidebarHandle | null>(null)

  // 当会话选择变化时，更新 URL
  const handleSessionSelect = useCallback((
    server: Server, 
    service: Service, 
    session: Session, 
    url: string
  ) => {
    setSelectedServer(server)
    setSelectedService(service)
    setSelectedSession(session)
    setServiceUrl(url)
    
    // 更新 URL，不重新加载页面
    const newPath = `/chat/${server.id}/${service.id}/${session.id}`
    if (window.location.pathname !== newPath) {
      navigate(newPath, { replace: true })
    }
  }, [navigate])

  const handleSessionChange = useCallback((session: Session) => {
    setSelectedSession(session)
    // 更新 URL 中的 sessionId
    if (selectedServer && selectedService) {
      const newPath = `/chat/${selectedServer.id}/${selectedService.id}/${session.id}`
      if (window.location.pathname !== newPath) {
        navigate(newPath, { replace: true })
      }
    }
  }, [navigate, selectedServer, selectedService])

  const handleSessionTitleRefresh = useCallback(async (sessionId: string) => {
    const url = serviceUrl
    if (!url) return
    const patch = await sidebarRef.current?.refreshSessionTitle(url, sessionId)
    if (!patch) return
    setSelectedSession(prev => {
      if (!prev || prev.id !== sessionId) return prev
      return { ...prev, name: patch.name ?? prev.name, createdAt: patch.createdAt ?? prev.createdAt }
    })
  }, [serviceUrl])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        ref={sidebarRef}
        isCollapsed={isCollapsed}
        onCollapse={setIsCollapsed}
        onSessionSelect={handleSessionSelect}
        selectedSessionId={selectedSession?.id}
        runningSessionId={runningSessionId || undefined}
        initialServerId={initialServerId}
        initialServiceId={initialServiceId}
        initialSessionId={initialSessionId}
      />

      {/* Chat Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Expand sidebar button when collapsed */}
        {isCollapsed && (
          <div className="absolute top-4 left-4 z-50">
            <button 
              onClick={() => setIsCollapsed(false)}
              className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-muted transition-colors"
              title="展开侧边栏"
            >
              <PanelLeft className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* 中间：对话区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel
            server={selectedServer}
            service={selectedService}
            session={selectedSession}
            serviceUrl={serviceUrl}
            onSessionChange={handleSessionChange}
            onSessionTitleRefresh={handleSessionTitleRefresh}
            onRunningSessionChange={setRunningSessionId}
          />
        </div>
      </div>
    </div>
  )
}
