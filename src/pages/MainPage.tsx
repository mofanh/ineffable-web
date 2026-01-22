import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelLeft, PanelLeftOpen } from 'lucide-react'
import type { Server, Service, Session, SkillInfo } from '../types'
import UnifiedSidebar, { type UnifiedSidebarHandle } from '../components/UnifiedSidebar'
import ChatPanel from '../components/ChatPanel'
import SkillsSidebar from '../components/skills/SkillsSidebar'
import { useMobileSidebar } from '../hooks/useResponsive'
import { cn } from '../utils/cn'

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
  
  // 使用移动端侧边栏 hook 管理状态
  const { isOpen, isMobile, toggle } = useMobileSidebar(true)
  
  // Desktop 侧边栏展开状态
  const [isDesktopOpen, setIsDesktopOpen] = useState(true)
  
  // 当前选中状态
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [serviceUrl, setServiceUrl] = useState<string>('')

  // 仅当当前会话有 SSE 流（sending）时才算"运行中"
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null)

  // Skills 侧边栏状态
  const [skillsSidebarOpen, setSkillsSidebarOpen] = useState(false)

  const sidebarRef = useRef<UnifiedSidebarHandle | null>(null)

  // 统一的侧边栏状态
  const isSidebarOpen = isMobile ? isOpen : isDesktopOpen
  
  // 统一的切换函数
  const handleSidebarToggle = isMobile ? toggle : () => setIsDesktopOpen(prev => !prev)
  
  // 侧边栏折叠回调（统一处理移动端和桌面端）
  const handleSidebarCollapse = () => {
    if (isMobile) {
      toggle()
    } else {
      setIsDesktopOpen(false)
    }
  }

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

  // 移动端侧边栏容器样式
  const sidebarContainerClass = isMobile
    ? cn(
        "fixed inset-y-0 left-0 z-50 w-72 h-full bg-background transform transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )
    : cn(
        "flex-none transition-all duration-300 ease-in-out overflow-hidden",
        isDesktopOpen ? "w-[280px] opacity-100" : "w-0 opacity-0"
      )

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Unified Sidebar */}
      <div className={sidebarContainerClass}>
        {!isMobile && !isDesktopOpen ? null : (
          <UnifiedSidebar
            ref={sidebarRef}
            isCollapsed={!isSidebarOpen}
            onCollapse={handleSidebarCollapse}
            onSessionSelect={handleSessionSelect}
            selectedSessionId={selectedSession?.id}
            runningSessionId={runningSessionId || undefined}
            initialServerId={initialServerId}
            initialServiceId={initialServiceId}
            initialSessionId={initialSessionId}
          />
        )}
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 打开侧边栏按钮 - 固定在左上角 */}
        {!isSidebarOpen && (
          <button
            onClick={handleSidebarToggle}
            className="fixed top-4 left-4 z-40 p-2 rounded-lg shadow-sm bg-card border border-border hover:bg-muted transition-all duration-200"
            title="展开侧边栏"
          >
            <PanelLeftOpen className="size-4 text-muted-foreground" />
          </button>
        )}

        {/* 移动端点击遮罩层关闭侧边栏 */}
        {isMobile && isOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={toggle}
          />
        )}

        {/* 中间：对话区 + Skills 侧边栏 */}
        <div className="flex-1 flex overflow-hidden transition-all duration-300 ease-in-out">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatPanel
              server={selectedServer}
              service={selectedService}
              session={selectedSession}
              serviceUrl={serviceUrl}
              onSessionChange={handleSessionChange}
              onSessionTitleRefresh={handleSessionTitleRefresh}
              onRunningSessionChange={setRunningSessionId}
              skillsSidebarOpen={skillsSidebarOpen}
              onToggleSkills={() => setSkillsSidebarOpen(!skillsSidebarOpen)}
            />
          </div>

          {/* Skills 侧边栏 - 右侧推挤效果 */}
          <div
            className={cn(
              "h-full overflow-hidden transition-all duration-300 ease-in-out",
              skillsSidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0"
            )}
          >
            <SkillsSidebar
              onClose={() => setSkillsSidebarOpen(false)}
              serviceUrl={serviceUrl || null}
              onUseSkill={(skill: SkillInfo) => {
                // SkillsSidebar 会自己处理，不需要在这里做额外操作
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
