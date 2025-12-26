import { useEffect, useState } from 'react'

/**
 * 主题类型
 * - light: 冲气以为和 浅色
 * - dark: 冲气以为和 深色  
 * - zhenwu: 我見真武見真我 浅色（明）
 * - zhenwu-dark: 我見真武見真我 深色（玄）
 */
export type Theme = 'light' | 'dark' | 'zhenwu' | 'zhenwu-dark'

// 主题显示名称
export const themeNames: Record<Theme, string> = {
  'light': '冲气以为和 · 阳',
  'dark': '冲气以为和 · 阴',
  'zhenwu': '真武见真我 · 明',
  'zhenwu-dark': '真武见真我 · 玄',
}

// 主题循环顺序
const themeOrder: Theme[] = ['light', 'dark', 'zhenwu', 'zhenwu-dark']

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // 从 localStorage 读取保存的主题
    const saved = localStorage.getItem('theme') as Theme
    if (saved && themeOrder.includes(saved)) return saved
    // 检测系统偏好
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    // 清除所有主题类
    root.classList.remove('dark', 'zhenwu', 'zhenwu-dark')
    // 添加当前主题类
    if (theme !== 'light') {
      root.classList.add(theme)
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // 循环切换主题
  const toggleTheme = () => {
    setTheme(prev => {
      const currentIndex = themeOrder.indexOf(prev)
      const nextIndex = (currentIndex + 1) % themeOrder.length
      return themeOrder[nextIndex]
    })
  }

  // 判断是否为深色系主题
  const isDark = theme === 'dark' || theme === 'zhenwu-dark'

  return { theme, setTheme, toggleTheme, isDark, themeName: themeNames[theme] }
}
