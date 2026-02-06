// ============ 用户菜单类型 ============

export interface UserMenuProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenSettings?: () => void
  userName?: string
  userPlan?: string
}
