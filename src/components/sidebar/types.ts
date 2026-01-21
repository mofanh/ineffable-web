// ============ Sidebar 共享类型定义 ============

import type { Server, Service, Session, ConnectionType } from '../../types'

/** Sidebar 主组件 Props */
export interface SidebarProps {
  isCollapsed: boolean
  onCollapse: (collapsed: boolean) => void
  onSessionSelect: (server: Server, service: Service, session: Session, serviceUrl: string) => void
  selectedSessionId?: string
  runningSessionId?: string
  initialServerId?: string
  initialServiceId?: string
  initialSessionId?: string
}

/** Sidebar 暴露给父组件的方法 */
export interface SidebarHandle {
  refreshSessionTitle: (
    serviceUrl: string,
    sessionId: string
  ) => Promise<Pick<Session, 'id' | 'name' | 'createdAt'> | null>
}

/** 服务器下拉菜单项 */
export interface ServerMenuItem {
  server: Server
  isSelected: boolean
  onClick: () => void
}

/** 会话列表项 */
export interface SessionListItem {
  session: Session
  isSelected: boolean
  isRunning: boolean
  isMenuOpen: boolean
  onSessionClick: () => void
  onMenuClick: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}

/** 服务列表项 */
export interface ServiceListItem {
  service: Service
  isExpanded: boolean
  isLoadingSessions: boolean
  sessions: Session[]
  onToggleExpand: () => void
  onCreateSession: (e: React.MouseEvent) => void
  onStartService: (e: React.MouseEvent) => void
  onStopService: (e: React.MouseEvent) => void
  onSessionClick: (session: Session) => void
  onSessionMenuClick: (sessionId: string | null) => void
  showSessionMenuId: string | null
  runningSessionId?: string
  selectedSessionId?: string
}

/** 模式类型 */
export type SidebarMode = 'hub' | 'direct'

/** 直连模式虚拟服务 */
export interface VirtualDirectService extends Service {
  isVirtual: true
}
