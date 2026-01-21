// ============ 会话列表类型 ============

import type { Session } from '../../types'

export interface SessionListProps {
  sessions: Session[]
  mode: 'hub' | 'direct'
  selectedSessionId?: string
  runningSessionId?: string
  showSessionMenuId: string | null
  isLoading?: boolean
  serverStatus?: 'online' | 'offline' | 'unknown'
  onRefresh: () => Promise<void>
  onCreateSession: () => Promise<void>
  onSessionClick: (session: Session) => void
  onSessionMenuClick: (sessionId: string | null) => void
  onRename: (session: Session, e: React.MouseEvent) => Promise<void>
  onDelete: (session: Session, e: React.MouseEvent) => Promise<void>
}

export interface SessionListItemProps {
  session: Session
  mode: 'hub' | 'direct'
  isSelected: boolean
  isRunning: boolean
  isMenuOpen: boolean
  onClick: () => void
  onMenuClick: (e: React.MouseEvent) => void
  onRename: (e: React.MouseEvent) => Promise<void>
  onDelete: (e: React.MouseEvent) => Promise<void>
}
