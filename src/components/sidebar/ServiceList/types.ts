// ============ 服务列表类型 ============

import type { Service, Session } from '../../types'

export interface ServiceListProps {
  services: ServiceWithSessions[]
  loading: boolean
  selectedServer: Server | null
  showCreateDialog: boolean
  selectedSessionId?: string
  runningSessionId?: string
  showSessionMenuId: string | null
  onRefresh: () => Promise<void>
  onCreateService: () => void
  onCloseCreateDialog: () => void
  onCreateServiceSubmit: (data: CreateServiceFormData) => Promise<void>
  onToggleExpand: (serviceId: string) => void
  onLoadSessions: (serviceId: string) => Promise<void>
  onCreateSession: (service: ServiceWithSessions, e: React.MouseEvent) => Promise<void>
  onStartService: (serviceId: string, e: React.MouseEvent) => Promise<void>
  onStopService: (serviceId: string, e: React.MouseEvent) => Promise<void>
  onSessionClick: (service: Service, session: Session) => void
  onSessionMenuClick: (sessionId: string | null) => void
  onRenameSession: (session: Session, e: React.MouseEvent) => Promise<void>
  onDeleteSession: (session: Session, e: React.MouseEvent) => Promise<void>
}

export interface ServiceWithSessions extends Service {
  expanded: boolean
  loadingSessions: boolean
  sessions: Session[]
}

export interface CreateServiceFormData {
  name: string
  port: string
  workingDir: string
}

export interface ServiceListItemProps {
  service: ServiceWithSessions
  selectedSessionId?: string
  runningSessionId?: string
  showSessionMenuId: string | null
  onToggleExpand: () => void
  onLoadSessions: () => Promise<void>
  onCreateSession: (e: React.MouseEvent) => Promise<void>
  onStartService: (e: React.MouseEvent) => Promise<void>
  onStopService: (e: React.MouseEvent) => Promise<void>
  onSessionClick: (session: Session) => void
  onSessionMenuClick: (sessionId: string | null) => void
  onRenameSession: (session: Session, e: React.MouseEvent) => Promise<void>
  onDeleteSession: (session: Session, e: React.MouseEvent) => Promise<void>
}
