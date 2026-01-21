// ============ UnifiedSidebar - 向后兼容入口 ============
// 此文件提供向后兼容，重新导出模块化后的组件

export { default } from './sidebar/UnifiedSidebar'
export { 
  SidebarHeader,
  ServerSelector,
  SessionList,
  ServiceList,
  UserMenu,
  AddServerDialog,
  CreateServiceDialog,
} from './sidebar'

// 重新导出类型
export * from './sidebar/types'

// 保留原有的类型别名以保持向后兼容
import type { SidebarProps as Props, SidebarHandle as UnifiedSidebarHandle } from './sidebar/types'
export type { Props, UnifiedSidebarHandle }
