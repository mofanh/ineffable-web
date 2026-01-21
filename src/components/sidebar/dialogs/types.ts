// ============ 对话框类型 ============

import type { ConnectionType } from '../../types'

export interface AddServerFormData {
  name: string
  url: string
  connectionType: ConnectionType
}

export interface AddServerDialogProps {
  isOpen: boolean
  onClose: () => void
  onAddServer: (data: AddServerFormData) => Promise<void>
  initialConnectionType?: ConnectionType
}

export interface CreateServiceFormData {
  name: string
  port: string
  workingDir: string
}

export interface CreateServiceDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateServiceFormData) => Promise<void>
}
