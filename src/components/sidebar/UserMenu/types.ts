// ============ 用户菜单类型 ============

export interface UserMenuProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  userName?: string
  userPlan?: string
}
