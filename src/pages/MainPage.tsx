import React, { useState, useCallback } from 'react'
import { PanelLeft } from 'lucide-react'
import type { Server, Service, Session } from '../types'
import UnifiedSidebar from '../components/UnifiedSidebar'
import ChatPanel from '../components/ChatPanel'

export default function MainPage() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  // 当前选中状态
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [serviceUrl, setServiceUrl] = useState<string>('')

  // 用于刷新会话列表的回调
  const [refreshKey, setRefreshKey] = useState(0)

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
  }, [])

  const handleSessionChange = useCallback((session: Session) => {
    setSelectedSession(session)
  }, [])

  const handleSessionsRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        key={refreshKey}
        isCollapsed={isCollapsed}
        onCollapse={setIsCollapsed}
        onSessionSelect={handleSessionSelect}
        selectedSessionId={selectedSession?.id}
      />

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
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
        
        <ChatPanel
          server={selectedServer}
          service={selectedService}
          session={selectedSession}
          serviceUrl={serviceUrl}
          onSessionChange={handleSessionChange}
          onSessionsRefresh={handleSessionsRefresh}
        />
      </div>
    </div>
  )
}
