// ============ 服务器选择器类型 ============

import type { Server, ConnectionType } from '../../types'

export interface ServerSelectorProps {
  servers: Server[]
  selectedServer: Server | null
  loadingServers: boolean
  showDropdown: boolean
  onToggleDropdown: () => void
  onSelectServer: (server: Server) => void
  onAddServer: () => void
}

// 导出对话框类型供其他模块使用
export type { AddServerFormData, AddServerDialogProps } from '../dialogs/types'
